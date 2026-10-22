import * as Sentry from "@sentry/nextjs";

// Next.js calls register once per server start, and onRequestError for
// errors it catches while handling requests (ADR 0012).

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startServerErrorReporting } =
    await import("./error-reporting/server");
  startServerErrorReporting();
}

// Does nothing while error reporting is off.
export const onRequestError = Sentry.captureRequestError;
