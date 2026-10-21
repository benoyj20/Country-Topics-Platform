import { spikeEnv } from "../../backend";

// A stand-in for phase 4's pass-through (ADR 0014, "Sign-in and API calls,
// through the frontend"): the admin's browser calls /api/* on this origin,
// and the call goes on to Payload's REST API on the real local backend,
// with the staff member's cookie. Phase 4 adds the signature, the visitor's
// address, Set-Cookie, and redirects. Until then the backend sits at its
// own address and checks a write's origin against it, so a write that
// came from this origin is passed on as coming from PAYLOAD_ORIGIN.

const SAFE_METHODS = new Set(["GET", "HEAD"]);
const PASSED_REQUEST_HEADERS = ["accept", "content-type", "cookie"];
const PASSED_RESPONSE_HEADERS = ["content-type"];
const TIMEOUT_MS = 15_000;

function failure(status: number, message: string): Response {
  return Response.json({ errors: [{ message }] }, { status });
}

async function pass(request: Request): Promise<Response> {
  const env = spikeEnv();
  const url = new URL(request.url);
  const safe = SAFE_METHODS.has(request.method);
  // The backend's cross-site check, made here first against this site's
  // configured address (behind a tunnel, the request's own URL is not the
  // browser's), as the origin the backend sees is replaced below.
  if (!safe && request.headers.get("origin") !== env.SITE_URL) {
    return failure(403, "Writes are accepted only from this site.");
  }
  const headers = new Headers();
  for (const name of PASSED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!safe) headers.set("origin", env.PAYLOAD_ORIGIN);
  let response: Response;
  try {
    response = await fetch(`${env.PAYLOAD_URL}${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      body: safe ? undefined : await request.arrayBuffer(),
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    return error instanceof DOMException && error.name === "TimeoutError"
      ? failure(
          504,
          "The backend did not answer in time. Nothing may have been saved; reload to check.",
        )
      : failure(
          502,
          "The backend could not be reached. Check that apps/web is running.",
        );
  }
  const passed = new Headers({ "cache-control": "private, no-store" });
  for (const name of PASSED_RESPONSE_HEADERS) {
    const value = response.headers.get(name);
    if (value) passed.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    headers: passed,
  });
}

export const GET = pass;
export const POST = pass;
export const PATCH = pass;
export const DELETE = pass;
