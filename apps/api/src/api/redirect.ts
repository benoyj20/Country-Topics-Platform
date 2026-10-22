import { serverEnv } from "@/env";

/**
 * A permanent redirect to `url`'s path and query on the site (ADR 0014).
 * Behind the frontend's pass-through the request's own URL names this
 * backend, which browsers never use.
 */
export function canonicalRedirect(url: URL): Response {
  return Response.redirect(
    new URL(`${url.pathname}${url.search}`, serverEnv().siteUrl),
    308,
  );
}
