import "server-only";

import {
  LOCAL_CLIENT_ADDRESS,
  signedPathAndQuery,
  signForwardedRequest,
} from "@countrytopics/forwarding";
import type * as z from "zod";

import { frontendSettings } from "@/settings";

// The frontend's own reads from the backend (ADR 0014): page data, and the
// visitor's account for the member pages and the admin. Each is signed, as
// the requests the pass-through sends on are.

/** A read waits at most this long; the page then shows its error. */
export const BACKEND_READ_TIMEOUT_MS = 10_000;

/**
 * The address the frontend's shared reads are signed with. Page data is
 * cached for everyone, so no visitor asked for it.
 */
export const FRONTEND_ADDRESS = LOCAL_CLIENT_ADDRESS;

/** A backend answer the frontend cannot use: neither data nor a 404. */
export class BackendError extends Error {
  constructor(
    readonly path: string,
    readonly status: number,
  ) {
    super(`The backend answered ${path} with ${status}.`);
    this.name = "BackendError";
  }
}

type Read = {
  /** The visitor's address, or FRONTEND_ADDRESS for shared data. */
  clientAddress: string;
  /** The visitor's cookies, for their account. */
  cookie?: string | null;
};

/**
 * GETs `path` from the backend and parses its JSON with `schema`; null
 * when the backend answers 404. Anything else that is not a success
 * throws, so a page never renders from a refusal or an outage.
 */
export async function readBackend<T>(
  path: string,
  schema: z.ZodType<T>,
  { clientAddress, cookie }: Read,
): Promise<T | null> {
  const settings = frontendSettings();
  // Only the path and query change, so no path can name another host.
  const target = new URL(settings.backendUrl);
  const asked = new URL(path, settings.backendUrl);
  target.pathname = asked.pathname;
  target.search = asked.search;
  const headers = new Headers({
    accept: "application/json",
    ...(await signForwardedRequest(
      settings.forwardingKey,
      { method: "GET", pathAndQuery: signedPathAndQuery(target) },
      clientAddress,
    )),
  });
  if (cookie) headers.set("cookie", cookie);
  const response = await fetch(target, {
    headers,
    // Each answer is cached, if at all, by its caller (page-data.ts), never
    // under a key that holds the signature.
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(BACKEND_READ_TIMEOUT_MS),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new BackendError(path, response.status);
  return schema.parse(await response.json());
}
