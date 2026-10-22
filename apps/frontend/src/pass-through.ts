import { type ApiError, PURGE_PATH } from "@countrytopics/contracts";
import {
  FORWARDING_HEADERS,
  signedPathAndQuery,
  signForwardedRequest,
} from "@countrytopics/forwarding";

import type { FrontendSettings } from "./settings";
import { visitorAddress } from "./visitor-address.ts";

// Passes a browser's request to the backend and its answer back (ADR 0014,
// "Sign-in and API calls, through the frontend"). Browsers only ever talk
// to this origin, so the session cookie never covers another host. Each
// request goes on signed, with the visitor's address; the method, body
// (streamed), cookies, and every response header, Set-Cookie included,
// pass unchanged. Redirects come back to the browser instead of being
// followed here, so a sign-in's cookie reaches it.
//
// Only /api and /files go on (app/api and app/files); the pages are this
// frontend's own.

/** The paths passed on, and everything under them. */
const PASSED = ["/api", "/files"];

/** Never passed on: answered here. */
const NOT_PASSED = [
  // The worker's purge of this site's cache (app/api/revalidate).
  PURGE_PATH,
];

// Request headers set by the connection, by this frontend, or by
// Cloudflare: a client's copies would be believed downstream.
const DROPPED_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-real-ip",
  // Replaced: the backend's answers come back uncompressed (see below).
  "accept-encoding",
  ...Object.values(FORWARDING_HEADERS),
]);
const DROPPED_REQUEST_PREFIXES = ["cf-", "x-forwarded-"];

// Response headers that describe the connection, not the answer.
const DROPPED_RESPONSE_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "set-cookie",
]);

/** How long the backend may take to start answering. */
export const BACKEND_TIMEOUT_MS = 30_000;

const NO_STORE = { "Cache-Control": "no-store" };

const isUnder = (decoded: string, path: string) =>
  decoded === path || decoded.startsWith(`${path}/`);

/**
 * Whether `pathname` goes on, compared as the backend's router reads it,
 * percent-decoded, so "/api/revalid%61te" counts as "/api/revalidate".
 * A "." or ".." segment is refused: URL parsing resolves "%2e%2e" away,
 * so "/api/%2e%2e/admin" would otherwise reach the backend's /admin. Null
 * when it cannot be decoded.
 */
function isPassed(pathname: string): boolean | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.split(/[/\\]/).some((part) => part === "." || part === "..")) {
    return false;
  }
  return (
    PASSED.some((path) => isUnder(decoded, path)) &&
    !NOT_PASSED.some((path) => isUnder(decoded, path))
  );
}

function failure(status: number, pathname: string, message: string): Response {
  return pathname.startsWith("/api/")
    ? Response.json({ error: message, problems: [] } satisfies ApiError, {
        status,
        headers: NO_STORE,
      })
    : new Response(message, {
        status,
        headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" },
      });
}

/**
 * A Location that names the backend, rewritten to this site. A relative
 * one already stays on whichever host the browser asked.
 */
function siteLocation(location: string, settings: FrontendSettings): string {
  const absolute =
    /^[a-z][a-z0-9+.-]*:/i.test(location) || location.startsWith("//");
  if (!absolute || !URL.canParse(location, settings.backendUrl))
    return location;
  const target = new URL(location, settings.backendUrl);
  if (target.origin !== settings.backendUrl) return location;
  return `${settings.siteUrl}${target.pathname}${target.search}${target.hash}`;
}

export async function passThrough(
  request: Request,
  settings: FrontendSettings,
  send: typeof fetch = fetch,
  timeoutMs: number = BACKEND_TIMEOUT_MS,
): Promise<Response> {
  const incoming = new URL(request.url);
  const passed = isPassed(incoming.pathname);
  if (passed === null) {
    return failure(400, incoming.pathname, "The address cannot be read.");
  }
  if (!passed) {
    return failure(404, incoming.pathname, "There is nothing at this address.");
  }
  const address = visitorAddress(request.headers, settings);
  if (!address) {
    return failure(
      400,
      incoming.pathname,
      "The request has no visitor address.",
    );
  }

  // Only the path and query change, so no path, such as one starting with
  // "//", can name another host.
  const target = new URL(settings.backendUrl);
  target.pathname = incoming.pathname;
  target.search = incoming.search;
  const headers = new Headers();
  for (const [name, value] of request.headers) {
    if (
      DROPPED_REQUEST_HEADERS.has(name) ||
      DROPPED_REQUEST_PREFIXES.some((prefix) => name.startsWith(prefix))
    ) {
      continue;
    }
    headers.set(name, value);
  }
  // Uncompressed, so no runtime has to decide whether to decode the body
  // or pass it on as compressed; Cloudflare compresses for the browser.
  headers.set("accept-encoding", "identity");
  // What the browser asked for, for the backend's own checks, such as
  // Next.js's on server actions.
  const site = new URL(settings.siteUrl);
  headers.set("x-forwarded-host", site.host);
  headers.set("x-forwarded-proto", site.protocol.replace(":", ""));
  const signature = await signForwardedRequest(
    settings.forwardingKey,
    {
      method: request.method,
      pathAndQuery: signedPathAndQuery(target),
    },
    address,
  );
  for (const [name, value] of Object.entries(signature))
    headers.set(name, value);

  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  let response: Response;
  try {
    response = await send(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      redirect: "manual",
      signal: AbortSignal.any([timeout.signal, request.signal]),
      // Node's fetch needs this to stream a request body; Workers ignore it.
      ...(hasBody ? { duplex: "half" } : {}),
    } as RequestInit);
  } catch {
    return timeout.signal.aborted
      ? failure(
          504,
          incoming.pathname,
          "The site took too long to answer. Try again in a moment.",
        )
      : failure(
          502,
          incoming.pathname,
          "The site is not available right now. Try again in a moment.",
        );
  } finally {
    clearTimeout(timer);
  }

  const answer = new Headers();
  for (const [name, value] of response.headers) {
    if (!DROPPED_RESPONSE_HEADERS.has(name)) answer.set(name, value);
  }
  for (const cookie of response.headers.getSetCookie()) {
    answer.append("set-cookie", cookie);
  }
  const location = response.headers.get("location");
  if (location) answer.set("location", siteLocation(location, settings));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: answer,
  });
}
