import {
  ERROR_REPORTING_DEFAULTS,
  type ErrorReportingConfig,
  scrubBreadcrumb,
  scrubErrorEvent,
} from "@countrytopics/observability";
import * as Sentry from "@sentry/node";

// The worker's error reporting (ADR 0012): anything it logs with
// console.error, which is how it records a job's last failed attempt and
// its own errors. Earlier attempts that will be retried are warnings and
// are not reported. Off without SENTRY_DSN.

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

/** Sends reports still queued, for a clean shutdown. */
export async function stopErrorReporting(): Promise<void> {
  await Sentry.close(2_000);
}
