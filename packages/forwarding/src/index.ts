// The frontend's signature on every request it passes to the backend
// (ADR 0014, "Sign-in and API calls, through the frontend"): an HMAC over
// the method, the path with its query, the visitor's address, and a
// timestamp, with a key only the two share. The backend answers only
// signed requests, and takes the visitor's address only from one, so its
// rate limits still count each visitor. The body is not signed: the
// signature proves the request came through the frontend, and TLS
// protects the rest. Web Crypto only, so the same code runs in the Worker
// and in Node.

/** The headers the signature travels in. */
export const FORWARDING_HEADERS = {
  timestamp: "x-countrytopics-timestamp",
  clientAddress: "x-countrytopics-client-address",
  signature: "x-countrytopics-signature",
} as const;

/**
 * How far a request's timestamp may be from the backend's clock, either
 * way: enough for drift between Cloudflare's and the server's clocks, and
 * short enough that a captured request stops working soon.
 */
export const MAX_CLOCK_SKEW_S = 5 * 60;

/** The address the frontend signs where no Cloudflare header exists: locally. */
export const LOCAL_CLIENT_ADDRESS = "127.0.0.1";

// IPv4 or IPv6 text, as Cloudflare's CF-Connecting-IP gives it.
const ADDRESS_PATTERN = /^[0-9a-f.:]{2,45}$/i;
const TIMESTAMP_PATTERN = /^\d{1,12}$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const VERSION = "v1";

const encoder = new TextEncoder();

export type ForwardedRequest = {
  method: string;
  /** The path with its query, as sent: `/api/v1/topics?country=kenya`. */
  pathAndQuery: string;
};

/**
 * Next.js's cache-busting parameter on its page-data requests, which it
 * removes from every request's URL before the backend's proxy reads it.
 */
const NEXT_RSC_PARAM = "_rsc";

/**
 * The path and query a request to `url` is signed for: as the backend's
 * proxy sees them. Next.js deletes its `_rsc` parameter from every
 * request's query, which re-encodes the query (a space becomes "+", "["
 * becomes "%5B"), so the same is done here.
 */
export function signedPathAndQuery(url: URL): string {
  const seen = new URL(url);
  seen.searchParams.delete(NEXT_RSC_PARAM);
  return `${seen.pathname}${seen.search}`;
}

/** Whether `value` is an IP address as Cloudflare writes one. */
export function isClientAddress(value: string): boolean {
  return ADDRESS_PATTERN.test(value);
}

function message(
  request: ForwardedRequest,
  clientAddress: string,
  timestamp: string,
): Uint8Array<ArrayBuffer> {
  // Newlines cannot occur in any field: the path is URL-encoded, and the
  // address and timestamp are checked.
  return encoder.encode(
    [
      VERSION,
      request.method.toUpperCase(),
      request.pathAndQuery,
      clientAddress,
      timestamp,
    ].join("\n"),
  );
}

function importKey(key: string, usage: "sign" | "verify") {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/**
 * The headers that sign `request` as passed on for the visitor at
 * `clientAddress`, at `now` (milliseconds since the epoch).
 */
export async function signForwardedRequest(
  key: string,
  request: ForwardedRequest,
  clientAddress: string,
  now: number = Date.now(),
): Promise<Record<string, string>> {
  if (!isClientAddress(clientAddress)) {
    throw new Error("The visitor's address is not an IP address.");
  }
  const timestamp = String(Math.floor(now / 1000));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importKey(key, "sign"),
    message(request, clientAddress, timestamp),
  );
  return {
    [FORWARDING_HEADERS.timestamp]: timestamp,
    [FORWARDING_HEADERS.clientAddress]: clientAddress,
    [FORWARDING_HEADERS.signature]: toBase64Url(signature),
  };
}

export type ForwardingCheck =
  | { ok: true; clientAddress: string }
  | { ok: false; reason: "unsigned" | "malformed" | "expired" | "forged" };

/**
 * Whether `headers` carry the frontend's signature for `request`, made
 * within MAX_CLOCK_SKEW_S of `now`. The comparison is Web Crypto's, which
 * takes the same time however much of a forged signature matches.
 */
export async function checkForwardedRequest(
  key: string,
  request: ForwardedRequest,
  headers: Headers,
  now: number = Date.now(),
): Promise<ForwardingCheck> {
  const timestamp = headers.get(FORWARDING_HEADERS.timestamp);
  const clientAddress = headers.get(FORWARDING_HEADERS.clientAddress);
  const signature = headers.get(FORWARDING_HEADERS.signature);
  if (timestamp === null && clientAddress === null && signature === null) {
    return { ok: false, reason: "unsigned" };
  }
  if (
    !timestamp ||
    !TIMESTAMP_PATTERN.test(timestamp) ||
    !clientAddress ||
    !isClientAddress(clientAddress) ||
    !signature ||
    !SIGNATURE_PATTERN.test(signature)
  ) {
    return { ok: false, reason: "malformed" };
  }
  if (Math.abs(now / 1000 - Number(timestamp)) > MAX_CLOCK_SKEW_S) {
    return { ok: false, reason: "expired" };
  }
  const valid = await crypto.subtle.verify(
    "HMAC",
    await importKey(key, "verify"),
    fromBase64Url(signature),
    message(request, clientAddress, timestamp),
  );
  return valid ? { ok: true, clientAddress } : { ok: false, reason: "forged" };
}
