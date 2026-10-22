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
  // Payload types its database as the generic adapter; payload.config.ts
  // always configures the PostgreSQL one, whose pool this is. Checked, so
  // a different adapter fails here with a clear message, not on first use.
  const { pool } = payload.db as unknown as Partial<PostgresAdapter>;
  if (!pool) {
    throw new Error("The database adapter has no PostgreSQL pool.");
  }
  return pool;
}
