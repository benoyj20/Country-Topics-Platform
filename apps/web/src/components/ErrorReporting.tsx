"use client";

import {
  ERROR_REPORTING_DEFAULTS,
  scrubBreadcrumb,
  scrubErrorEvent,
} from "@countrytopics/observability";
import { useEffect } from "react";

// Browser error reporting (ADR 0012). Reports go to the site's own
// /api/v1/errors, which adds the real DSN and passes error events on to
// Sentry, or drops them while reporting is off; so pages, which are cached
// for everyone, need no configuration, and the DSN below only gives the SDK
// the shape it expects. The SDK loads after the page, to keep it out of
// the way of the content.
const PLACEHOLDER_DSN = "https://site@errors.invalid/1";
const TUNNEL = "/api/v1/errors";
/** How long after the page loads the SDK is fetched. */
const LOAD_DELAY_MS = 2_000;

let started = false;

export function ErrorReporting() {
  useEffect(() => {
    if (started) return;
    const timer = window.setTimeout(() => {
      // Once per page load, however often the layout mounts.
      started = true;
      void import("@sentry/nextjs").then((Sentry) => {
        Sentry.init({
          ...ERROR_REPORTING_DEFAULTS,
          dsn: PLACEHOLDER_DSN,
          tunnel: TUNNEL,
          // Errors only: no session counts.
          integrations: (defaults) =>
            defaults.filter(
              (integration) => integration.name !== "BrowserSession",
            ),
          beforeSend: (event) => scrubErrorEvent(event),
          beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
        });
      });
    }, LOAD_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return null;
}
