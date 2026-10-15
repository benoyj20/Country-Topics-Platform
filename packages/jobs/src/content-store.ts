import type { LinkArchiveStatus } from "@countrytopics/domain";
import type { Pool } from "pg";
import { v7 as uuidv7 } from "uuid";

import type { LinkArchiveRecord, LinkArchiveStore } from "./link-jobs.ts";
import type {
  ReferenceCheckJob,
  ReferenceState,
  ReferenceStore,
} from "./reference-jobs.ts";

// The worker writes the results of its checks straight to the tables the web
// app's Payload collections use ("references" and "link-archives", see
// apps/web/src/collections). It changes only the system fields those
// collections never accept from requests, so it does not need Payload or its
// hooks. Queries are parameterised; table and column names are fixed.

/** The reference row still carries the job's identifiers. */
const SAME_IDENTIFIERS = `doi IS NOT DISTINCT FROM $2
  AND isbn IS NOT DISTINCT FROM $3
  AND url IS NOT DISTINCT FROM $4`;

export function createContentStore(
  pool: Pool,
): ReferenceStore & LinkArchiveStore {
  const identifiers = (job: ReferenceCheckJob) => [
    job.referenceId,
    job.doi,
    job.isbn,
    job.url,
  ];

  return {
    async referenceState(job): Promise<ReferenceState> {
      const { rows } = await pool.query<{ waiting: boolean }>(
        `SELECT (check_status = 'pending' AND ${SAME_IDENTIFIERS}) AS waiting
           FROM "references" WHERE id = $1`,
        identifiers(job),
      );
      const [row] = rows;
      if (!row) return "missing";
      return row.waiting ? "pending" : "superseded";
    },

    async saveReferenceCheck(job, result) {
      const { rowCount } = await pool.query(
        `UPDATE "references"
            SET check_status = $5, check_message = $6, checked_at = now()
          WHERE id = $1 AND check_status = 'pending' AND ${SAME_IDENTIFIERS}`,
        [...identifiers(job), result.status, result.message],
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
  };
}
