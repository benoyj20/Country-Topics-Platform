import pg from "pg";

import { serverEnv } from "@/env";

// Public reads that run their own SQL (search, comments) go through one
// small pool on the read connection (DATABASE_REPLICA_URL when set), as
// AGENTS.md asks of reads that can use a replica. Writes use Payload's pool
// on the primary.

const READ_POOL_SIZE = 6;
const READ_CONNECT_TIMEOUT_MS = 5_000;
/** A read that takes longer is cancelled; the page says to try again. */
const READ_STATEMENT_TIMEOUT_MS = 5_000;

declare global {
  // Reused across hot reloads in development so connections do not pile up.
  var countryTopicsReadPool: pg.Pool | undefined;
}

export function readPool(): pg.Pool {
  if (!globalThis.countryTopicsReadPool) {
    const env = serverEnv();
    const pool = new pg.Pool({
      connectionString: env.databaseReplicaUrl ?? env.databaseUrl,
      max: READ_POOL_SIZE,
      connectionTimeoutMillis: READ_CONNECT_TIMEOUT_MS,
      statement_timeout: READ_STATEMENT_TIMEOUT_MS,
    });
    // An idle connection that breaks (a database restart) is replaced on
    // the next query; without a listener the error would stop the process.
    pool.on("error", (error) =>
      console.error("Read database connection lost:", error.message),
    );
    globalThis.countryTopicsReadPool = pool;
  }
  return globalThis.countryTopicsReadPool;
}
