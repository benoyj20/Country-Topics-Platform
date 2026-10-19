import { serverEnv } from "@/env";

/**
 * The visitor's address from the proxy's header named by CLIENT_IP_HEADER
 * (ADR 0010), or null without one. Other headers, such as X-Forwarded-For,
 * are set by the client and cannot be trusted, so limits that need an
 * address share one bucket instead (ADR 0012).
 */
export function trustedClientAddress(headers: Headers): string | null {
  const header = serverEnv().clientIpHeader;
  return (header && headers.get(header)?.trim()) || null;
}
