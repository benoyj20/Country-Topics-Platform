import * as z from "zod";

// Sign-in (ADRs 0002 and 0010) as the site's pages and the backend's
// Better Auth share it.

/** Better Auth's error codes for an address that may not sign in. */
export const NOT_INVITED_ERROR = "NOT_INVITED";
export const EMAIL_NOT_VERIFIED_ERROR = "EMAIL_NOT_VERIFIED";

/** The header the browser sends a Turnstile token in. */
export const TURNSTILE_HEADER = "x-captcha-response";

/** The widget's action, which Cloudflare reports back for real keys. */
export const TURNSTILE_ACTION = "sign-in";

/** GET /api/v1/sign-in-options: what the sign-in page offers. */
export const SignInOptions = z.object({
  /** Whether "Continue with Google" is offered. */
  google: z.boolean(),
  /** Turnstile's public site key; null where Turnstile is off. */
  turnstileSiteKey: z.string().nullable(),
});
export type SignInOptions = z.infer<typeof SignInOptions>;

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
