import * as Sentry from "@sentry/node";

import {
  ERROR_REPORTING_DEFAULTS,
  type ErrorReportingConfig,
  scrubBreadcrumb,
  scrubErrorEvent,
} from "./index.ts";

// Error reporting for the Node processes outside the site: the worker and
// the backup container (ADR 0012). They report what they log with
// console.error, which is how each records failures worth telling someone
// about. Off without SENTRY_DSN.

export function startErrorReporting(
  config: ErrorReportingConfig | undefined,
): void {
  if (!config) return;
  Sentry.init({
    ...ERROR_REPORTING_DEFAULTS,
    dsn: config.dsn.dsn,
    environment: config.environment,
    integrations: [Sentry.captureConsoleIntegration({ levels: ["error"] })],
    beforeSend: (event) => scrubErrorEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  });
}

/** Sends reports still queued, before the process exits. */
export async function stopErrorReporting(): Promise<void> {
  await Sentry.close(2_000);
}
