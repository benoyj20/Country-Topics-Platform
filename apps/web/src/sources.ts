import {
  type Bibliography,
  createBibliography,
  SOURCE_TIMEOUT_MS,
  sourceUserAgent,
} from "@countrytopics/sources";

import { serverEnv } from "@/env";

declare global {
  // Reused across hot reloads; integration tests put a fake here so they
  // never call the live services.
  var countryTopicsBibliography: Bibliography | undefined;
}

/**
 * DOI and ISBN lookups for the admin's "Look up" button. The worker does the
 * checks that decide whether a reference is confirmed.
 */
export function bibliography(): Bibliography {
  if (!globalThis.countryTopicsBibliography) {
    const env = serverEnv();
    globalThis.countryTopicsBibliography = createBibliography(
      {
        fetch,
        userAgent: sourceUserAgent(env),
        timeoutMs: SOURCE_TIMEOUT_MS,
      },
      {
        googleBooksApiKey: env.googleBooksApiKey,
        onBackupError: (message) =>
          console.warn(`ISBN lookup backup failed: ${message}`),
      },
    );
  }
  return globalThis.countryTopicsBibliography;
}
