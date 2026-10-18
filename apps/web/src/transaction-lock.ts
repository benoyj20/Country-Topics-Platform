import { type PostgresAdapter, sql } from "@payloadcms/db-postgres";
import type { PayloadRequest } from "payload";

type TransactionDb = PostgresAdapter["sessions"][string]["db"];

/** The database session of the request's transaction, if it has one. */
async function transactionSession(
  req: PayloadRequest,
): Promise<TransactionDb | undefined> {
  const adapter = req.payload.db as unknown as PostgresAdapter;
  const transactionID = await req.transactionID;
  return transactionID === undefined
    ? undefined
    : adapter.sessions[transactionID]?.db;
}

/**
 * Where SQL that must commit or roll back with the request's save runs:
 * its transaction, or the adapter's own connection outside one.
 */
export async function transactionDb(
  req: PayloadRequest,
): Promise<TransactionDb | PostgresAdapter["drizzle"]> {
  return (
    (await transactionSession(req)) ??
    (req.payload.db as unknown as PostgresAdapter).drizzle
  );
}

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
  const session = await transactionSession(req);
  if (!session) return;
  // A fixed order, so two saves never wait on each other's locks.
  for (const key of [...keys].sort()) {
    await session.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
  }
}
