import type { LinkArchiveStatus } from "@countrytopics/domain";
import type { Pool } from "pg";
import { v7 as uuidv7 } from "uuid";

import type { LinkArchiveRecord, LinkArchiveStore } from "./link-jobs.ts";
import type { PendingCheckStore } from "./pending-checks.ts";
import type {
  ReferenceCheckJob,
  ReferenceState,
  ReferenceStore,
} from "./reference-jobs.ts";
import type { VideoState, VideoStore } from "./video-jobs.ts";

// The worker writes the results of its checks straight to the tables the API
// app's Payload collections use ("references", "link-archives", and
// "videos", see apps/api/src/collections). It changes only the system fields those
// collections never accept from requests, so it does not need Payload or its
// hooks. Queries are parameterised; table and column names are fixed.

/** The reference row still carries the job's identifiers. */
const SAME_IDENTIFIERS = `doi IS NOT DISTINCT FROM $2
  AND isbn IS NOT DISTINCT FROM $3
  AND url IS NOT DISTINCT FROM $4`;

/**
 * How the check request a row records compares with a job's (`param` holds
 * the job's requestedAt). The API stores the request time with the
 * "being checked" status and puts the same value in the job, so this compares
 * two copies of one value, never two clocks:
 * - "older": the save that queued the job has not committed yet;
 * - "newer": a later save asked again, and its own job covers it;
 * - "same": the row is the one the job was queued for.
 */
function requestOrder(param: string): string {
  return `CASE
      WHEN check_requested_at IS NULL OR check_requested_at < ${param}::timestamptz
        THEN 'older'
      WHEN check_requested_at > ${param}::timestamptz THEN 'newer'
      ELSE 'same'
    END`;
}

type RequestOrder = "older" | "newer" | "same";

function stateFor(
  order: RequestOrder,
  waiting: boolean,
): "pending" | "superseded" | "missing" {
  if (order === "older") return "missing";
  if (order === "newer") return "superseded";
  return waiting ? "pending" : "superseded";
}

export function createContentStore(
  pool: Pool,
): ReferenceStore & LinkArchiveStore & VideoStore & PendingCheckStore {
  const identifiers = (job: ReferenceCheckJob) => [
    job.referenceId,
    job.doi,
    job.isbn,
    job.url,
  ];

  return {
    async referenceState(job): Promise<ReferenceState> {
      const { rows } = await pool.query<{
        waiting: boolean;
        request: RequestOrder;
      }>(
        `SELECT (check_status = 'pending' AND ${SAME_IDENTIFIERS}) AS waiting,
                ${requestOrder("$5")} AS request
           FROM "references" WHERE id = $1`,
        [...identifiers(job), job.requestedAt],
      );
      const [row] = rows;
      return row ? stateFor(row.request, row.waiting) : "missing";
    },

    async saveReferenceCheck(job, result) {
      const { rowCount } = await pool.query(
        `UPDATE "references"
            SET check_status = $6, check_message = $7, checked_at = now()
          WHERE id = $1 AND check_status = 'pending' AND ${SAME_IDENTIFIERS}
            AND check_requested_at = $5::timestamptz`,
        [...identifiers(job), job.requestedAt, result.status, result.message],
      );
      return rowCount === 1;
    },

    async linkArchiveStatus(url) {
      const { rows } = await pool.query<{ status: LinkArchiveStatus }>(
        `SELECT status FROM link_archives WHERE url = $1`,
        [url],
      );
      return rows[0]?.status ?? null;
    },

    async saveLinkArchive(url, record: LinkArchiveRecord) {
      // A link already archived keeps its copy, whatever a later run finds.
      await pool.query(
        `INSERT INTO link_archives
           (id, url, status, archive_url, captured_at, message, checked_at,
            updated_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, now(), now(), now())
         ON CONFLICT (url) DO UPDATE
           SET status = EXCLUDED.status,
               archive_url = EXCLUDED.archive_url,
               captured_at = EXCLUDED.captured_at,
               message = EXCLUDED.message,
               checked_at = now(),
               updated_at = now()
           WHERE link_archives.status <> 'archived'`,
        [
          uuidv7(),
          url,
          record.status,
          record.archiveUrl,
          record.capturedAt,
          record.message,
        ],
      );
    },

    async pendingChecks(limit) {
      // Rows without a request time predate it and cannot be matched to a
      // job; the migration that added it stamped the pending ones.
      const [references, videos] = await Promise.all([
        pool.query<{
          id: string;
          doi: string | null;
          isbn: string | null;
          url: string | null;
          requested_at: Date;
        }>(
          `SELECT id, doi, isbn, url, check_requested_at AS requested_at
             FROM "references"
            WHERE check_status = 'pending' AND check_requested_at IS NOT NULL
            ORDER BY check_requested_at
            LIMIT $1`,
          [limit],
        ),
        pool.query<{ id: string; youtube_id: string; requested_at: Date }>(
          `SELECT id, youtube_id, check_requested_at AS requested_at
             FROM videos
            WHERE check_status = 'pending' AND check_requested_at IS NOT NULL
            ORDER BY check_requested_at
            LIMIT $1`,
          [limit],
        ),
      ]);
      return {
        references: references.rows.map((row) => ({
          referenceId: row.id,
          doi: row.doi,
          isbn: row.isbn,
          url: row.url,
          requestedAt: row.requested_at.toISOString(),
        })),
        videos: videos.rows.map((row) => ({
          videoId: row.id,
          youtubeId: row.youtube_id,
          requestedAt: row.requested_at.toISOString(),
        })),
      };
    },

    async videoState(job): Promise<VideoState> {
      const { rows } = await pool.query<{
        waiting: boolean;
        request: RequestOrder;
      }>(
        `SELECT (check_status = 'pending' AND youtube_id = $2) AS waiting,
                ${requestOrder("$3")} AS request
           FROM videos WHERE id = $1`,
        [job.videoId, job.youtubeId, job.requestedAt],
      );
      const [row] = rows;
      return row ? stateFor(row.request, row.waiting) : "missing";
    },

    async saveVideoCheck(job, result) {
      // What YouTube no longer says (a failed check, a lookup without the
      // Data API) keeps the title, channel, and length found before.
      // confirmed_at records the first time the video was found playable.
      const { rowCount } = await pool.query(
        `UPDATE videos
            SET check_status = $3,
                title = COALESCE($4, title),
                channel = COALESCE($5, channel),
                duration_s = COALESCE($6, duration_s),
                check_message = $7,
                checked_at = now(),
                confirmed_at = CASE WHEN $8::boolean
                                    THEN COALESCE(confirmed_at, now())
                                    ELSE confirmed_at END,
                updated_at = now()
          WHERE id = $1 AND youtube_id = $2 AND check_status = 'pending'
            AND check_requested_at = $9::timestamptz`,
        [
          job.videoId,
          job.youtubeId,
          result.status,
          result.title,
          result.channel,
          result.duration_s,
          result.message,
          result.status === "playable",
          job.requestedAt,
        ],
      );
      return rowCount === 1;
    },
  };
}
