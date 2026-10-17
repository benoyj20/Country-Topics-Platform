import * as z from "zod";

import {
  parseOrUnavailable,
  requestJson,
  type SourceClient,
  SourceUnavailableError,
} from "./http.ts";

const SOURCE = "The Wayback Machine";

/**
 * The Internet Archive often takes 10-20 seconds to answer. Archiving runs in
 * the worker, where nobody waits, so it gets more time than lookups.
 */
export const WEB_ARCHIVE_TIMEOUT_MS = 45_000;

/** A saved copy of a web page in the Wayback Machine. */
export type Snapshot = {
  /** https://web.archive.org/web/<timestamp>/<url> */
  archiveUrl: string;
  /** When the copy was taken, as an ISO 8601 date-time. */
  capturedAt: string;
};

/**
 * The Wayback Machine will not keep or show copies of this page, for example
 * because the site asked to be excluded. Trying again will not help.
 */
export class ArchiveRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchiveRefusedError";
  }
}

export type CaptureStatus =
  | { state: "pending" }
  | { state: "saved"; snapshot: Snapshot }
  /** The Internet Archive cannot save the page (blocked, not found, …). */
  | { state: "refused"; message: string };

/**
 * The Internet Archive's Wayback Machine: finds existing copies of a page
 * and, with an account's keys, asks it to save a new one (Save Page Now 2).
 */
export type WebArchive = {
  /** Whether keys are configured, so new copies can be requested. */
  canCapture: boolean;
  /** Throws ArchiveRefusedError for pages the archive refuses to show. */
  findSnapshot(url: string): Promise<Snapshot | null>;
  /** Starts saving a page; returns the job to poll. */
  requestCapture(url: string): Promise<{ jobId: string } | { refused: string }>;
  captureStatus(jobId: string): Promise<CaptureStatus>;
};

export type WebArchiveCredentials = { accessKey: string; secretKey: string };

// Errors that may clear on a later try (from the Save Page Now 2 API's error
// list); any other error means the page cannot be saved as it is.
const TEMPORARY_CAPTURE_ERRORS = new Set([
  "error:bad-gateway",
  "error:bandwidth-limit-exceeded",
  "error:browsing-timeout",
  "error:cannot-fetch",
  "error:capture-location-error",
  "error:celery",
  "error:gateway-timeout",
  "error:internal-server-error",
  "error:invalid-server-response",
  "error:job-failed",
  "error:no-browsers-available",
  "error:protocol-error",
  "error:proxy-error",
  "error:read-timeout",
  "error:recursion-error",
  "error:service-unavailable",
  "error:soft-time-limit-exceeded",
  "error:too-many-requests",
  "error:user-session-limit",
]);

const WAYBACK_TIMESTAMP = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/;

// CDX rows: a header row, then [timestamp, original URL]. The simpler
// "availability" API often answers with no copy for well-archived pages.
const cdxRows = z.array(z.array(z.string()));

const captureRequest = z.object({
  job_id: z.string().optional(),
  status: z.string().optional(),
  status_ext: z.string().optional(),
  message: z.string().optional(),
});

const captureJob = z.object({
  status: z.string(),
  timestamp: z.string().optional(),
  original_url: z.string().optional(),
  status_ext: z.string().optional(),
  message: z.string().optional(),
});

function snapshotAt(timestamp: string, url: string): Snapshot | null {
  const parts = WAYBACK_TIMESTAMP.exec(timestamp);
  if (!parts) return null;
  const [, year, month, day, hour, minute, second] = parts;
  return {
    archiveUrl: `https://web.archive.org/web/${timestamp}/${url}`,
    capturedAt: `${year}-${month}-${day}T${hour}:${minute}:${second}Z`,
  };
}

/** Turns a capture error into a refusal, or throws when it is temporary. */
function refusal(
  statusExt: string | undefined,
  message: string | undefined,
): string {
  if (statusExt && TEMPORARY_CAPTURE_ERRORS.has(statusExt)) {
    throw new SourceUnavailableError(
      SOURCE,
      `could not save the page now (${statusExt})`,
    );
  }
  return message?.trim() || statusExt || "The page could not be saved.";
}

export function createWebArchive(
  client: SourceClient,
  credentials?: WebArchiveCredentials,
): WebArchive {
  const authorization = credentials
    ? { Authorization: `LOW ${credentials.accessKey}:${credentials.secretKey}` }
    : undefined;

  return {
    canCapture: Boolean(credentials),

    async findSnapshot(url) {
      // The latest copy of the page that answered 200; a saved error page is
      // no evidence.
      const query = new URLSearchParams({
        url,
        output: "json",
        limit: "-1",
        filter: "statuscode:200",
        fl: "timestamp,original",
      });
      const { status, body } = await requestJson(
        client,
        SOURCE,
        `https://web.archive.org/cdx/search/cdx?${query}`,
      );
      // Errors 429 and 5xx were thrown as temporary; other 4xx are final.
      if (status >= 400) {
        throw new ArchiveRefusedError(
          `The Wayback Machine refuses to show copies of this page (${status}).`,
        );
      }
      if (status !== 200) {
        throw new SourceUnavailableError(SOURCE, `answered ${status}`);
      }
      const [, latest] = parseOrUnavailable(cdxRows, body, SOURCE);
      const [timestamp, original] = latest ?? [];
      return timestamp && original ? snapshotAt(timestamp, original) : null;
    },

    async requestCapture(url) {
      if (!authorization)
        throw new Error("Wayback Machine keys are not configured");
      const { status, body } = await requestJson(
        client,
        SOURCE,
        "https://web.archive.org/save",
        {
          method: "POST",
          headers: authorization,
          body: new URLSearchParams({ url }),
        },
      );
      if (status === 401 || status === 403) {
        throw new SourceUnavailableError(SOURCE, "refused the configured keys");
      }
      if (status !== 200) {
        throw new SourceUnavailableError(SOURCE, `answered ${status}`);
      }
      const answer = parseOrUnavailable(captureRequest, body, SOURCE);
      if (answer.job_id) return { jobId: answer.job_id };
      return { refused: refusal(answer.status_ext, answer.message) };
    },

    async captureStatus(jobId) {
      if (!authorization)
        throw new Error("Wayback Machine keys are not configured");
      const { status, body } = await requestJson(
        client,
        SOURCE,
        `https://web.archive.org/save/status/${encodeURIComponent(jobId)}`,
        { headers: authorization },
      );
      if (status !== 200) {
        throw new SourceUnavailableError(SOURCE, `answered ${status}`);
      }
      const job = parseOrUnavailable(captureJob, body, SOURCE);
      if (job.status === "pending") return { state: "pending" };
      if (job.status === "success" && job.timestamp && job.original_url) {
        const snapshot = snapshotAt(job.timestamp, job.original_url);
        if (snapshot) return { state: "saved", snapshot };
      }
      return {
        state: "refused",
        message: refusal(job.status_ext, job.message),
      };
    },
  };
}
