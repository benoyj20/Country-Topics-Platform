import { isHttpUrl } from "@countrytopics/domain";
import type {
  ReferenceCheckJob,
  SearchSourceChange,
  VideoCheckJob,
} from "@countrytopics/jobs";
import { APIError, type Payload, type PayloadRequest } from "payload";

import { linkQueue, referenceQueue, searchQueue, videoQueue } from "@/jobs";

/**
 * Runs inside the save's transaction: if the job cannot be queued, the save
 * fails and rolls back rather than leaving a check that will never run. The
 * worker copes with jobs that arrive before the save commits.
 */
async function enqueueOrFail(
  req: PayloadRequest,
  what: string,
  enqueue: () => Promise<void>,
): Promise<void> {
  try {
    await enqueue();
  } catch (error) {
    req.payload.logger.error({ err: error, msg: `Could not queue ${what}` });
    throw new APIError(
      `The ${what} could not be queued, so nothing was saved. Try again in a moment.`,
      503,
      undefined,
      true,
    );
  }
}

export function queueReferenceCheck(
  req: PayloadRequest,
  job: ReferenceCheckJob,
): Promise<void> {
  return enqueueOrFail(req, "reference check", () =>
    referenceQueue().enqueue(job),
  );
}

export function queueVideoCheck(
  req: PayloadRequest,
  job: VideoCheckJob,
): Promise<void> {
  return enqueueOrFail(req, "video check", () => videoQueue().enqueue(job));
}

/** Asks the worker to archive each link that has no Wayback Machine copy yet. */
export async function queueLinkArchives(
  req: PayloadRequest,
  urls: unknown[],
): Promise<void> {
  const unique = [
    ...new Set(
      urls.filter(
        (url): url is string => typeof url === "string" && isHttpUrl(url),
      ),
    ),
  ];
  if (unique.length === 0) return;
  const { docs } = await req.payload.find({
    collection: "link-archives",
    where: { url: { in: unique }, status: { equals: "archived" } },
    select: { url: true },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
  });
  const archived = new Set(docs.map((doc) => doc.url));
  const waiting = unique.filter((url) => !archived.has(url));
  if (waiting.length === 0) return;
  await enqueueOrFail(req, "link archive", () =>
    linkQueue().enqueueMany(waiting.map((url) => ({ url }))),
  );
}

/**
 * Asks the worker to re-index topics once the save that changed them (or
 * something they show) commits. Unlike checks, a lost request is caught by
 * the worker's hourly rebuild (ADR 0008), so a queue outage does not stop
 * the save: it is logged, and search catches up within the hour.
 */
export async function queueSearchIndex(
  req: PayloadRequest,
  topicIds: string[],
  after: SearchSourceChange,
): Promise<void> {
  await requestSearchIndex(req.payload.logger, topicIds, after);
}

/** queueSearchIndex for saves made outside Payload (comments). */
export async function requestSearchIndex(
  logger: Payload["logger"],
  topicIds: string[],
  after: SearchSourceChange,
): Promise<void> {
  if (topicIds.length === 0) return;
  try {
    await searchQueue().enqueue({ topicIds, after });
  } catch (error) {
    logger.error({
      err: error,
      msg: `Could not queue a search index update for ${topicIds.length} topic(s); the hourly rebuild will catch up`,
    });
  }
}
