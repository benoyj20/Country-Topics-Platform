import { type PostgresAdapter, sql } from "@payloadcms/db-postgres";
import type { PayloadRequest } from "payload";

/**
 * Takes PostgreSQL advisory locks for the request's transaction, so two saves
 * that would both pass a check before either commits (a duplicate name, the
 * same new video) run one after the other. The locks end with the
 * transaction; without one (outside a transaction) nothing is locked.
 */
export async function lockForTransaction(
  req: PayloadRequest,
  keys: readonly string[],
): Promise<void> {
  const adapter = req.payload.db as unknown as PostgresAdapter;
  const transactionID = await req.transactionID;
  const session =
    transactionID === undefined ? undefined : adapter.sessions[transactionID];
  if (!session) return;
  // A fixed order, so two saves never wait on each other's locks.
  for (const key of [...keys].sort()) {
    await session.db.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`,
    );
  }
}
