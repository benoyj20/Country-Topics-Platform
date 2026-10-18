import { serverEnv } from "@/env";

/**
 * The visitor's address, for limits that apply before anyone signs in
 * (ADR 0012): the proxy's header when CLIENT_IP_HEADER names one (ADR
 * 0010), else the first X-Forwarded-For entry, which a client can forge,
 * so it serves only to slow abuse, never to identify anyone.
 */
export function clientAddress(headers: Headers): string {
  const header = serverEnv().clientIpHeader;
  const value = header
    ? headers.get(header)
    : headers.get("x-forwarded-for")?.split(",")[0];
  return value?.trim() || "unknown";
}
