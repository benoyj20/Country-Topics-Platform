import { readLimitedBody } from "@/api/json";
import { trustedClientAddress } from "@/api/client-address";
import { rateLimited } from "@/api/member";
import { isSameOriginWrite } from "@/auth/same-origin";
import { serverEnv } from "@/env";
import {
  browserEnvelopeForSentry,
  ERROR_ENVELOPE_MAX_BYTES,
  sentryEnvelopeUrl,
} from "@/error-reporting/envelope";

// POST /api/v1/errors: the browser's error reports, passed on to Sentry
// (ADR 0012; src/error-reporting/envelope.ts). Answers 204 whatever Sentry
// says, and drops reports while error reporting is off.

const FORWARD_TIMEOUT_MS = 5_000;
const ACCEPTED = () => new Response(null, { status: 204 });

export async function POST(request: Request) {
  const config = serverEnv().errorReporting;
  if (!config) return ACCEPTED();
  if (!isSameOriginWrite(request.headers, serverEnv().siteUrl)) {
    return new Response(null, { status: 403 });
  }
  const limited =
    (await rateLimited(
      "error-report",
      trustedClientAddress(request.headers) ?? "shared",
    )) ?? (await rateLimited("error-report-site", "site"));
  if (limited) return limited;
  const body = await readLimitedBody(request, ERROR_ENVELOPE_MAX_BYTES);
  if (!body.ok) return body.response;
  const envelope = browserEnvelopeForSentry(body.bytes, config);
  if (!envelope) return ACCEPTED();
  try {
    const response = await fetch(sentryEnvelopeUrl(config), {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope" },
      body: envelope,
      signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
    });
    if (!response.ok) {
      // A warning, not an error: errors are themselves reported to Sentry.
      console.warn(`Sentry refused a browser error report: ${response.status}`);
    }
  } catch (error) {
    console.warn(
      "Could not pass a browser error report to Sentry:",
      error instanceof Error ? error.message : error,
    );
  }
  return ACCEPTED();
}
