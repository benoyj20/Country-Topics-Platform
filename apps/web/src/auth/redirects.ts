export const DEFAULT_AFTER_SIGN_IN = "/account";

/**
 * Returns `value` as a path on this site, or the default. Parsing it as a URL
 * catches tricks that look like paths but leave the site, such as
 * "//evil.example" and "/\evil.example" (browsers read the backslash as "/").
 */
export function safeCallbackPath(value: unknown, siteUrl: string): string {
  if (typeof value !== "string" || !value.startsWith("/"))
    return DEFAULT_AFTER_SIGN_IN;
  try {
    const url = new URL(value, siteUrl);
    if (url.origin === siteUrl)
      return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    // Not a URL; use the default.
  }
  return DEFAULT_AFTER_SIGN_IN;
}
