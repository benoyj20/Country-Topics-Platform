import {
  checkForwardedRequest,
  signedPathAndQuery,
} from "@countrytopics/forwarding";
import { type NextRequest, NextResponse } from "next/server";

import { serverEnv } from "@/env";

// The backend answers only the frontend (ADR 0014, "The backend: APIs
// only"): every request must carry the frontend's signature, which also
// vouches for the visitor's address. The routes read that address from
// the signed header (client-address.ts), so a request reaches them only
// with a signature that checks, or with no signature headers at all. The
// exceptions are the health check, which reveals nothing, and, locally
// only, Payload's panel at the backend's own address until phase 12.
//
// Requests pass on unchanged: Next.js leaves its router headers out of
// headers a proxy rewrites, and its pages' data requests then fail their
// own check.

/** Answered without a signature: the containers' and the tunnel's health checks. */
const UNSIGNED_PATHS = new Set(["/api/v1/health"]);

const REFUSED = { "Cache-Control": "no-store" };

/**
 * A request from Payload's panel, which staff open at the backend's own
 * address: one of its pages, or anything a page there loads or calls,
 * which the browser says came from that origin. Checked only locally,
 * where nothing but the developer can reach the backend.
 */
function isPanelRequest(request: NextRequest, panelOrigin: string): boolean {
  const { pathname } = new URL(request.url);
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return true;
  const origin = request.headers.get("origin");
  if (origin !== null) return origin === panelOrigin;
  return request.headers.get("referer")?.startsWith(`${panelOrigin}/`) ?? false;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { forwardingKey, panelOrigin } = serverEnv();
  const url = new URL(request.url);
  if (UNSIGNED_PATHS.has(url.pathname)) return NextResponse.next();

  const check = await checkForwardedRequest(
    forwardingKey,
    { method: request.method, pathAndQuery: signedPathAndQuery(url) },
    request.headers,
  );
  if (check.ok) return NextResponse.next();
  // Only with no signature headers at all, so the routes never see an
  // address no signature vouched for; such panel requests share one bucket.
  if (
    check.reason === "unsigned" &&
    panelOrigin &&
    isPanelRequest(request, panelOrigin)
  ) {
    return NextResponse.next();
  }
  return NextResponse.json(
    {
      error:
        check.reason === "expired"
          ? "This request's signature has expired, or the clocks of the frontend and this backend differ by more than 5 minutes."
          : "This address answers only the site's own requests.",
    },
    { status: 401, headers: REFUSED },
  );
}

export const config = {
  // Next.js's own files are public and the same for everyone: the
  // scripts, styles, and fonts of Payload's panel and of the pages this
  // backend still renders until phase 12, and the development server's
  // live reload.
  matcher: ["/((?!_next/).*)"],
};
