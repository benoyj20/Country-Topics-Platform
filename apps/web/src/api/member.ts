import { ensureUserProfile } from "@/auth/accounts";
import { getAuth } from "@/auth/auth";
import { isSameOriginWrite } from "@/auth/same-origin";
import { serverEnv } from "@/env";
import { loadPayload } from "@/payload-instance";
import type { User } from "@/payload-types";
import {
  consumeRateLimit,
  type RateLimitedAction,
  type RateLimitResult,
} from "@/rate-limit";

import { apiError, NO_STORE } from "./json";

/** The signed-in person's profile, or null for visitors. */
export async function requestProfile(request: Request): Promise<User | null> {
  // Route handlers can set cookies, but a read here should not; the
  // browser refreshes its session through /api/auth.
  const session = await getAuth().api.getSession({
    headers: request.headers,
    query: { disableRefresh: true },
  });
  if (!session) return null;
  return ensureUserProfile(await loadPayload(), session.user);
}

type Member = { ok: true; profile: User } | { ok: false; response: Response };

/**
 * The member making a write: the request must come from the site itself
 * (the session cookie is sent with any same-site request) and carry a
 * session. Every role may write; staff have no extra powers here.
 */
export async function writingMember(request: Request): Promise<Member> {
  if (!isSameOriginWrite(request.headers, serverEnv().siteUrl)) {
    return {
      ok: false,
      response: apiError(403, "Requests from other sites are refused."),
    };
  }
  const profile = await requestProfile(request);
  if (!profile) {
    return {
      ok: false,
      response: apiError(401, "Sign in to take part in the discussion."),
    };
  }
  return { ok: true, profile };
}

function waitText(seconds: number): string {
  if (seconds < 60) return seconds === 1 ? "a second" : `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return minutes === 1 ? "a minute" : `${minutes} minutes`;
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? "an hour" : `${hours} hours`;
}

/**
 * Counts a member's write against its rate limit (ADR 0010). Returns the
 * response refusing it (429, or 503 when the limits cannot be checked), or
 * null when it may go ahead.
 */
export async function rateLimited(
  action: RateLimitedAction,
  memberId: string,
): Promise<Response | null> {
  let result: RateLimitResult;
  try {
    result = await consumeRateLimit(action, memberId);
  } catch (error) {
    console.error(
      `Rate limit check failed (${action}):`,
      error instanceof Error ? error.message : error,
    );
    return apiError(
      503,
      "This cannot be done right now. Try again in a moment.",
    );
  }
  if (result.ok) return null;
  return apiError(
    429,
    `You are doing that too often. Try again in ${waitText(result.retryAfterS)}.`,
    {
      code: "rate-limited",
      headers: { ...NO_STORE, "Retry-After": String(result.retryAfterS) },
    },
  );
}
