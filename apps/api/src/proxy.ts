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
// with a signature that checks. The exception is the health check, which
// reveals nothing.
//
// Requests pass on unchanged: Next.js leaves its router headers out of
// headers a proxy rewrites.

/** Answered without a signature: the containers' and the tunnel's health checks. */
const UNSIGNED_PATHS = new Set(["/api/v1/health"]);

const REFUSED = { "Cache-Control": "no-store" };

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { forwardingKey } = serverEnv();
  const url = new URL(request.url);
  if (UNSIGNED_PATHS.has(url.pathname)) return NextResponse.next();

  const check = await checkForwardedRequest(
    forwardingKey,
    { method: request.method, pathAndQuery: signedPathAndQuery(url) },
    request.headers,
  );
  if (check.ok) return NextResponse.next();
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
  // Every path, Next.js's own files included: the backend renders no
  // pages, so it has no scripts or styles anyone else needs.
  matcher: ["/:path*"],
};
