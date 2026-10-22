import { captcha } from "better-auth/plugins";

import type { ServerEnv } from "@/env";

import { isTurnstileTestSecret, TURNSTILE_ACTION } from "./turnstile-shared";

export { TURNSTILE_HEADER } from "./turnstile-shared";

// Cloudflare Turnstile on the email sign-in form (ADR 0010): the request
// for a sign-in link must carry a token from the widget in the
// `x-captcha-response` header, which Better Auth checks with Cloudflare
// (ten-second timeout, refused if Cloudflare cannot be reached). Google
// sign-in needs none: Google does its own checks. Off when the keys are
// not configured.

/** Better Auth endpoints that need a Turnstile token. */
export const TURNSTILE_ENDPOINTS = ["/sign-in/magic-link"];

export function turnstilePlugins(
  turnstile: ServerEnv["turnstile"],
  siteUrl: string,
  /** Tests point this at a local stand-in for Cloudflare. */
  siteVerifyURLOverride?: string,
) {
  if (!turnstile) return [];
  // A token is good only for this widget on this site: one solved for
  // another page or hostname under the same key is refused. Test keys'
  // answers name no action and the hostname "example.com", so they skip
  // these checks; the server configuration allows them only on localhost.
  const checks = isTurnstileTestSecret(turnstile.secretKey)
    ? {}
    : {
        expectedAction: TURNSTILE_ACTION,
        allowedHostnames: [new URL(siteUrl).hostname],
      };
  return [
    captcha({
      provider: "cloudflare-turnstile",
      secretKey: turnstile.secretKey,
      endpoints: TURNSTILE_ENDPOINTS,
      siteVerifyURLOverride,
      ...checks,
    }),
  ];
}
