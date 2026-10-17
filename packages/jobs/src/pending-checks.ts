import type { ReferenceCheckJob, ReferenceQueue } from "./reference-jobs.ts";
import type { VideoCheckJob, VideoQueue } from "./video-jobs.ts";

/** Pending checks queued again per worker start; more wait for the next. */
export const PENDING_CHECKS_LIMIT = 1_000;

export type PendingChecks = {
  references: ReferenceCheckJob[];
  videos: VideoCheckJob[];
};

export type PendingCheckStore = {
  /** References and videos waiting for a check, as the jobs that check them. */
  pendingChecks(limit: number): Promise<PendingChecks>;
};

/**
 * Queues again every check a reference or video is waiting for. A check can
 * be lost: Redis emptied, a job from before a deploy that the new worker
 * cannot read, or a job dropped by a bug. Job ids are per request, so a check
 * still queued is not added twice.
 */
export async function requeuePendingChecks(
  store: PendingCheckStore,
  queues: {
    references: Pick<ReferenceQueue, "enqueue">;
    videos: Pick<VideoQueue, "enqueue">;
  },
  onError: (message: string) => void,
): Promise<{ references: number; videos: number }> {
  const pending = await store.pendingChecks(PENDING_CHECKS_LIMIT);
  const queued = { references: 0, videos: 0 };
  const requeue = async <T>(
    kind: keyof typeof queued,
    jobs: T[],
    enqueue: (job: T) => Promise<void>,
  ) => {
    for (const job of jobs) {
      try {
        await enqueue(job);
        queued[kind] += 1;
      } catch (error) {
        // One record that cannot be queued must not stop the others.
        onError(
          `Could not queue a pending ${kind === "references" ? "reference" : "video"} check: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  };
  await requeue("references", pending.references, (job) =>
    queues.references.enqueue(job),
  );
  await requeue("videos", pending.videos, (job) => queues.videos.enqueue(job));
  return queued;
}
