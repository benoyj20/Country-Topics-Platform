import type {
  TopicSearchDocument,
  TopicSearchIndex,
} from "@countrytopics/search";
import { type JobsOptions, Queue, UnrecoverableError, Worker } from "bullmq";
import * as z from "zod";

import type { QueueSettings } from "./email-jobs.ts";
import type { JobAttempt } from "./reference-jobs.ts";
import { SEARCH_SOURCE_TABLES } from "./topic-search-source.ts";

export const SEARCH_QUEUE_NAME = "search";

/** Topic ids in one job; larger requests are split. */
export const SEARCH_JOB_MAX_TOPICS = 500;
/** Topics read from the database at a time. */
const SEARCH_BATCH_SIZE = 100;
/** A full rebuild also catches anything a lost job missed (ADR 0008). */
export const SEARCH_REBUILD_EVERY_MS = 60 * 60 * 1000;

/**
 * The save that queued a job, which the job waits for. Jobs are queued
 * inside the save's transaction, so the worker may run before it commits;
 * the row's updatedAt reaches the job's value once it has (the same value,
 * stored twice, never two clocks).
 */
const changeSchema = z.object({
  table: z.enum(SEARCH_SOURCE_TABLES),
  id: z.uuid(),
  updatedAt: z.iso.datetime(),
});
export type SearchSourceChange = z.infer<typeof changeSchema>;

/** Index these topics as they are now, or rebuild the whole index. */
export const searchJobSchema = z.union([
  z.object({
    topicIds: z.array(z.uuid()).min(1).max(SEARCH_JOB_MAX_TOPICS),
    after: changeSchema.optional(),
  }),
  z.object({ rebuild: z.literal(true) }),
]);
export type SearchJob = z.infer<typeof searchJobSchema>;

export const SEARCH_JOB_OPTIONS: JobsOptions = {
  // The job usually arrives before the save that queued it commits, so the
  // first retry comes soon; about half a minute in all for it to commit.
  attempts: 7,
  backoff: { type: "exponential", delay: 500 },
  removeOnComplete: true,
  removeOnFail: true,
};

/** A topic as the search index should hold it now. */
export type TopicSearchState = {
  /** Null while the topic is not listed (a draft, or archived). */
  document: TopicSearchDocument | null;
  /** When the topic or anything it shows last changed, as read. */
  version: string;
};

export type TopicSearchSource = {
  listedTopicIds(): Promise<string[]>;
  /** Topics by id; deleted topics are absent. */
  topicStates(topicIds: string[]): Promise<Map<string, TopicSearchState>>;
  /** Whether the save that queued a job has committed. */
  changeVisible(change: SearchSourceChange): Promise<boolean>;
};

export type SearchQueue = {
  enqueue(job: SearchJob): Promise<void>;
  /** Rebuilds now, then every SEARCH_REBUILD_EVERY_MS (one schedule however many workers start). */
  scheduleRebuilds(): Promise<void>;
  close(): Promise<void>;
};

function chunks<T>(list: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < list.length; start += size) {
    result.push(list.slice(start, start + size));
  }
  return result;
}

export function createSearchQueue({
  connection,
  prefix,
}: QueueSettings): SearchQueue {
  const queue = new Queue(SEARCH_QUEUE_NAME, { connection, prefix });
  const rebuild = { rebuild: true } as const;
  return {
    async enqueue(job) {
      if ("rebuild" in job) {
        await queue.add("rebuild", rebuild, SEARCH_JOB_OPTIONS);
        return;
      }
      const { topicIds, after } = job;
      // No job ids: a job already running may have read the data before
      // this save, so every request gets its own job.
      await queue.addBulk(
        chunks([...new Set(topicIds)], SEARCH_JOB_MAX_TOPICS).map((ids) => ({
          name: "index",
          data: searchJobSchema.parse({ topicIds: ids, after }),
          opts: SEARCH_JOB_OPTIONS,
        })),
      );
    },
    async scheduleRebuilds() {
      // BullMQ lines `every` runs up with the clock, so a new schedule's
      // first run may come at once or up to an hour later; the rebuild on
      // start does not wait for it. Two rebuilds in a row cost little:
      // unchanged documents are skipped.
      await queue.add("rebuild", rebuild, SEARCH_JOB_OPTIONS);
      await queue.upsertJobScheduler(
        "search-rebuild",
        { every: SEARCH_REBUILD_EVERY_MS },
        { name: "rebuild", data: rebuild, opts: SEARCH_JOB_OPTIONS },
      );
    },
    close: () => queue.close(),
  };
}

export type SearchIndexOutcome = {
  indexed: number;
  /** Not replaced: the index already held a newer version, or removed it later. */
  kept: number;
  /** A rebuild found the indexed document up to date. */
  unchanged: number;
  removed: number;
};

/**
 * Brings the index in line with the topics: listed topics are added or
 * replaced, others removed. A rebuild covers every listed topic and every
 * indexed one. Throws to have BullMQ retry while the queuing save has not
 * committed; the final attempt indexes what it finds.
 */
export async function processSearchJob(
  job: SearchJob,
  { source, index }: { source: TopicSearchSource; index: TopicSearchIndex },
  { isFinal }: JobAttempt,
): Promise<SearchIndexOutcome> {
  let topicIds: string[];
  // On a rebuild, the version of each indexed document: one that matches
  // what the topic shows now is left alone.
  let indexed = new Map<string, string>();
  if ("rebuild" in job) {
    const listed = await source.listedTopicIds();
    indexed = await index.indexedVersions();
    topicIds = [...new Set([...listed, ...indexed.keys()])];
  } else {
    if (job.after && !isFinal && !(await source.changeVisible(job.after))) {
      throw new Error("The change is not saved yet; trying again.");
    }
    topicIds = job.topicIds;
  }

  const outcome: SearchIndexOutcome = {
    indexed: 0,
    kept: 0,
    unchanged: 0,
    removed: 0,
  };
  for (const batch of chunks(topicIds, SEARCH_BATCH_SIZE)) {
    const states = await source.topicStates(batch);
    for (const topicId of batch) {
      const state = states.get(topicId);
      if (state?.document && indexed.get(topicId) === state.version) {
        outcome.unchanged += 1;
      } else if (state?.document) {
        if (await index.upsert(state.document)) outcome.indexed += 1;
        else outcome.kept += 1;
      } else {
        await index.remove(topicId, state?.version ?? null);
        outcome.removed += 1;
      }
    }
  }
  return outcome;
}

export type SearchWorkerOptions = QueueSettings & {
  source: TopicSearchSource;
  index: TopicSearchIndex;
};

export function createSearchWorker({
  connection,
  prefix,
  source,
  index,
}: SearchWorkerOptions): Worker {
  return new Worker(
    SEARCH_QUEUE_NAME,
    async (job) => {
      const parsed = searchJobSchema.safeParse(job.data);
      if (!parsed.success) {
        throw new UnrecoverableError(
          `Invalid search job: ${parsed.error.message}`,
        );
      }
      const attempts = job.opts.attempts ?? 1;
      return processSearchJob(
        parsed.data,
        { source, index },
        { isFinal: job.attemptsMade + 1 >= attempts },
      );
    },
    // Two at a time, so a publish is not held up by a rebuild; the index's
    // versions and per-topic locks keep jobs from undoing each other.
    { connection, prefix, concurrency: 2 },
  );
}
