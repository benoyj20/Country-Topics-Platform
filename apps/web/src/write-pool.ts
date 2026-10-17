import type { PostgresAdapter } from "@payloadcms/db-postgres";
import type { Pool } from "pg";

import { loadPayload } from "@/payload-instance";

/**
 * Payload's own pool on the primary database (DATABASE_URL), for writes
 * that run their own SQL and for reads that must see them, such as a
 * member's own votes.
 */
export async function writePool(): Promise<Pool> {
  const payload = await loadPayload();
  return (payload.db as unknown as PostgresAdapter).pool;
}
