import { isHttpUrl } from "@countrytopics/domain";
import type { ReferenceCheckJob, VideoCheckJob } from "@countrytopics/jobs";
import { APIError, type PayloadRequest } from "payload";

import { linkQueue, referenceQueue, videoQueue } from "@/jobs";

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
