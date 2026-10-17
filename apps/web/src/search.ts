import {
  createPostgresTopicSearch,
  type TopicSearchIndex,
} from "@countrytopics/search";
import pg from "pg";

import { serverEnv } from "@/env";

// The search index the public pages read (ADR 0008). It is a table in the
// database, read through its own small pool on the read connection
// (DATABASE_REPLICA_URL when set), as AGENTS.md asks of reads that can use a
// replica; the worker writes it on the primary.

const SEARCH_POOL_SIZE = 4;
const SEARCH_CONNECT_TIMEOUT_MS = 5_000;
/** A search that takes longer is cancelled; the page says to try again. */
const SEARCH_STATEMENT_TIMEOUT_MS = 5_000;

declare global {
  // Reused across hot reloads in development so connections do not pile up.
  var countryTopicsSearch: TopicSearchIndex | undefined;
}

export function topicSearch(): TopicSearchIndex {
  if (!globalThis.countryTopicsSearch) {
    const env = serverEnv();
    const pool = new pg.Pool({
      connectionString: env.databaseReplicaUrl ?? env.databaseUrl,
      max: SEARCH_POOL_SIZE,
      connectionTimeoutMillis: SEARCH_CONNECT_TIMEOUT_MS,
      statement_timeout: SEARCH_STATEMENT_TIMEOUT_MS,
    });
    // An idle connection that breaks (a database restart) is replaced on
    // the next query; without a listener the error would stop the process.
    pool.on("error", (error) =>
      console.error("Search database connection lost:", error.message),
    );
    globalThis.countryTopicsSearch = createPostgresTopicSearch(pool);
  }
  return globalThis.countryTopicsSearch;
}
