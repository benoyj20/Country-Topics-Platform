import { FORWARDING_HEADERS } from "@countrytopics/forwarding";

/**
 * The visitor's address, as the frontend signed it (ADR 0014), or null
 * without one. proxy.ts lets a request reach the routes only when this
 * header is part of a signature that checks, or when no signature header
 * was sent, so it can be trusted; other headers, such as X-Forwarded-For,
 * are set by the client. Limits that need an address share one bucket
 * without one (ADR 0012).
 */
export function trustedClientAddress(headers: Headers): string | null {
  return headers.get(FORWARDING_HEADERS.clientAddress)?.trim() || null;
}
