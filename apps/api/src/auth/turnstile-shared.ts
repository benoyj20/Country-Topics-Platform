// Shared by the sign-in form and the server's Turnstile check (ADR 0010);
// the header and action are in packages/contracts, for the site's form.

export { TURNSTILE_ACTION, TURNSTILE_HEADER } from "@countrytopics/contracts";

// Cloudflare's published test secrets, which pass, fail, or report a spent
// token whatever is sent (developers.cloudflare.com/turnstile/troubleshooting/testing/).
const TEST_SECRET = /^[123]x0{31}AA$/;

/** Whether a Turnstile secret is one of Cloudflare's test keys. */
export function isTurnstileTestSecret(secretKey: string): boolean {
  return TEST_SECRET.test(secretKey);
}
