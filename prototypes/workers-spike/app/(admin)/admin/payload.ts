import { headers } from "next/headers";

import { spikeEnv } from "../../backend";
import { isRecord } from "./save-result";

// The admin's reads from Payload's REST API on the real local backend
// (apps/web), made while rendering, with the staff member's cookie. The
// backend's access rules are the real check (ADR 0014, "The admin").

/** Payload's REST API waits at most this long. */
const REST_TIMEOUT_MS = 10_000;

export type PayloadRead<T> =
  | { ok: true; data: T }
  /**
   * unreachable: no answer; hidden: refused or missing for this visitor;
   * failed: any other answer, or one of the wrong shape.
   */
  | { ok: false; reason: "unreachable" | "hidden" | "failed" };

/**
 * GETs `path` from Payload's REST API with the visitor's cookie, never
 * cached, and checks the answer's shape with `isExpected`.
 */
export async function payloadGet<T>(
  path: string,
  isExpected: (value: unknown) => value is T,
): Promise<PayloadRead<T>> {
  const cookie = (await headers()).get("cookie");
  let response: Response;
  try {
    response = await fetch(`${spikeEnv().PAYLOAD_URL}${path}`, {
      headers: cookie ? { cookie } : {},
      cache: "no-store",
      signal: AbortSignal.timeout(REST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, reason: "unreachable" };
  }
  if ([401, 403, 404].includes(response.status)) {
    return { ok: false, reason: "hidden" };
  }
  const data: unknown = response.ok
    ? await response.json().catch(() => undefined)
    : undefined;
  return isExpected(data)
    ? { ok: true, data }
    : { ok: false, reason: "failed" };
}

/** A list answer from Payload's REST API whose every item passes `isItem`. */
export function isListOf<T>(isItem: (value: unknown) => value is T) {
  return (value: unknown): value is { docs: T[] } =>
    isRecord(value) && Array.isArray(value.docs) && value.docs.every(isItem);
}

function isAccess(value: unknown): value is { canAccessAdmin?: boolean } {
  return isRecord(value);
}

/**
 * Whether the visitor may open the admin: a staff role and a recent
 * authenticator check, as Payload's panel asks.
 */
export async function adminAccess(): Promise<
  "staff" | "not-staff" | "unreachable" | "failed"
> {
  const access = await payloadGet("/api/access", isAccess);
  if (access.ok) {
    return access.data.canAccessAdmin === true ? "staff" : "not-staff";
  }
  return access.reason === "hidden" ? "not-staff" : access.reason;
}

/** Where the backend's own pages are, for links to sign-in and the site. */
export function backendOrigin(): string {
  return spikeEnv().PAYLOAD_ORIGIN;
}
