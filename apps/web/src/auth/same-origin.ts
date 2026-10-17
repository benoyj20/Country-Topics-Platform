/**
 * Cross-site request forgery guard. The session cookie is sent with any
 * same-site request, so a write is trusted only when the browser says it came
 * from the site itself.
 */
export function isSameOriginWrite(headers: Headers, siteUrl: string): boolean {
  const origin = headers.get("origin");
  if (origin) return origin === siteUrl;
  return headers.get("sec-fetch-site") === "same-origin";
}
