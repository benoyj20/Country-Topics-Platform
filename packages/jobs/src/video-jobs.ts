import {
  type VideoCheckStatus,
  YOUTUBE_ID_PATTERN,
} from "@countrytopics/domain";
import { SourceUnavailableError, type YouTube } from "@countrytopics/sources";
import { type JobsOptions, Queue, UnrecoverableError, Worker } from "bullmq";
import * as z from "zod";

import type { QueueSettings } from "./email-jobs.ts";
import type { JobAttempt } from "./reference-jobs.ts";

export const VIDEO_QUEUE_NAME = "videos";

/**
 * Asks YouTube whether a video still exists and may be embedded. The job is
 * queued inside the save that marks the video for a check, so until that save
 * commits the worker may still see the video's previous check; requestedAt
 * tells the two apart.
 */
export const videoCheckJobSchema = z.object({
  videoId: z.uuid(),
  youtubeId: z.string().regex(YOUTUBE_ID_PATTERN),
  requestedAt: z.iso.datetime(),
});
export type VideoCheckJob = z.infer<typeof videoCheckJobSchema>;

export const VIDEO_JOB_OPTIONS: JobsOptions = {
  // YouTube and the saving transaction may need a while; about ten minutes
  // in total before the video is marked "could not finish".
  attempts: 6,
  backoff: { type: "exponential", delay: 10_000 },
  // A kept job would block its fixed id, so saving a snippet again could not
  // queue the video again; the failure is stored with the video instead.
  removeOnComplete: true,
  removeOnFail: true,
};

export type VideoCheckResult = {
  status: Exclude<VideoCheckStatus, "pending">;
  title: string | null;
  channel: string | null;
  duration_s: number | null;
  message: string;
};

export type VideoState =
  /** Waits for this check. */
  | "pending"
  /** Checked since the job was requested; nothing to do. */
  | "superseded"
  /**
   * Not visible yet: the save that queued the job has not committed, so the
   * video is absent or still shows a check from before the request.
   */
  | "missing";

export type VideoStore = {
  videoState(job: VideoCheckJob): Promise<VideoState>;
  /** Stores the result if the video is still waiting for a check. */
  saveVideoCheck(
    job: VideoCheckJob,
    result: VideoCheckResult,
  ): Promise<boolean>;
};

export type VideoQueue = {
  /** A video already waiting for a check is not queued twice. */
  enqueue(job: VideoCheckJob): Promise<void>;
  close(): Promise<void>;
};

export function videoJobId(videoId: string): string {
  return `video-${videoId}`;
}

export function createVideoQueue({
  connection,
  prefix,
}: QueueSettings): VideoQueue {
  const queue = new Queue(VIDEO_QUEUE_NAME, { connection, prefix });
  return {
    async enqueue(job) {
      const data = videoCheckJobSchema.parse(job);
      await queue.add("check-video", data, {
        ...VIDEO_JOB_OPTIONS,
        jobId: videoJobId(data.videoId),
      });
    },
    close: () => queue.close(),
  };
}

/**
 * Runs one video check. Throws to have BullMQ retry while the video is not
 * visible yet or YouTube could not answer; on the final attempt it records
 * "could not finish" instead, whatever went wrong.
 */
export async function processVideoCheck(
  job: VideoCheckJob,
  { youtube, store }: { youtube: YouTube; store: VideoStore },
  { isFinal }: JobAttempt,
): Promise<"saved" | "superseded"> {
  const state = await store.videoState(job);
  if (state === "superseded") return "superseded";
  if (state === "missing") {
    if (isFinal) return "superseded";
    throw new Error("The video is not saved yet; trying again.");
  }

  let result: VideoCheckResult;
  try {
    result = await youtube.lookupVideo(job.youtubeId);
  } catch (error) {
    if (!isFinal) throw error;
    const temporary = error instanceof SourceUnavailableError;
    // Keep the title and channel found earlier: null leaves them as they are.
    await store.saveVideoCheck(job, {
      status: "failed",
      title: null,
      channel: null,
      duration_s: null,
      message: `${temporary ? error.message : "The check failed unexpectedly."} Save a snippet of this video to try again.`,
    });
    // An unexpected error is still reported as a failed job, for the logs.
    if (!temporary) throw error;
    return "saved";
  }
  return (await store.saveVideoCheck(job, result)) ? "saved" : "superseded";
}

export type VideoWorkerOptions = QueueSettings & {
  youtube: YouTube;
  store: VideoStore;
  concurrency?: number;
};

export function createVideoWorker({
  connection,
  prefix,
  youtube,
  store,
  concurrency = 2,
}: VideoWorkerOptions): Worker {
  return new Worker(
    VIDEO_QUEUE_NAME,
    async (job) => {
      const parsed = videoCheckJobSchema.safeParse(job.data);
      if (!parsed.success) {
        throw new UnrecoverableError(
          `Invalid video check job: ${parsed.error.message}`,
        );
      }
      const attempts = job.opts.attempts ?? 1;
      return processVideoCheck(
        parsed.data,
        { youtube, store },
        { isFinal: job.attemptsMade + 1 >= attempts },
      );
    },
    { connection, prefix, concurrency },
  );
}
