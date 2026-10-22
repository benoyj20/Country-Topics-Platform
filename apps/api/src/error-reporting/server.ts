import {
  ERROR_REPORTING_DEFAULTS,
  scrubBreadcrumb,
  scrubErrorEvent,
} from "@countrytopics/observability";
import * as Sentry from "@sentry/nextjs";

import { serverEnv } from "@/env";

// Server-side error reporting (ADR 0012): errors Next.js catches in
// requests (instrumentation.ts), 5xx errors in Payload's API, and anything
// logged with console.error, which is how the /api/v1 routes record the
// failures they answer with 503. Off without SENTRY_DSN.

export function startServerErrorReporting(): void {
  const config = serverEnv().errorReporting;
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

/**
 * Reports an error Payload's API answered with, unless it was the
 * request's fault (a 4xx such as a failed validation).
 */
export function reportPayloadError(error: Error & { status?: number }): void {
  if (error.status !== undefined && error.status < 500) return;
  Sentry.captureException(error);
}
