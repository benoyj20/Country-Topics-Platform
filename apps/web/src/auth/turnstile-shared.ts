// Shared by the sign-in form and the server's Turnstile check (ADR 0010).

/** The header the browser sends a Turnstile token in. */
export const TURNSTILE_HEADER = "x-captcha-response";

/** The widget's action, which Cloudflare reports back for real keys. */
export const TURNSTILE_ACTION = "sign-in";

// Cloudflare's published test secrets, which pass, fail, or report a spent
// token whatever is sent (developers.cloudflare.com/turnstile/troubleshooting/testing/).
const TEST_SECRET = /^[123]x0{31}AA$/;

/** Whether a Turnstile secret is one of Cloudflare's test keys. */
export function isTurnstileTestSecret(secretKey: string): boolean {
  return TEST_SECRET.test(secretKey);
}
