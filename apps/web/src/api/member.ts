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
  refundRateLimit,
} from "@/rate-limit";

import { apiError, NO_STORE } from "./json";

/**
 * The signed-in person's profile and when their session began, or null
 * for visitors.
 */
export async function requestSession(
  request: Request,
): Promise<{ profile: User; sessionCreatedAt: Date } | null> {
  // Route handlers can set cookies, but a read here should not; the
  // browser refreshes its session through /api/auth.
  const session = await getAuth().api.getSession({
    headers: request.headers,
    query: { disableRefresh: true },
  });
  if (!session) return null;
  const profile = await ensureUserProfile(await loadPayload(), session.user);
  return profile
    ? { profile, sessionCreatedAt: new Date(session.session.createdAt) }
    : null;
}

/** The signed-in person's profile, or null for visitors. */
export async function requestProfile(request: Request): Promise<User | null> {
  return (await requestSession(request))?.profile ?? null;
}

type Member =
  | { ok: true; profile: User; sessionCreatedAt: Date }
  | { ok: false; response: Response };

/**
 * The member making a write: the request must come from the site itself
 * (the session cookie is sent with any same-site request) and carry a
 * session. Every role may write; staff have no extra powers here.
 */
export async function writingMember(
  request: Request,
  signInMessage = "Sign in to take part in the discussion.",
): Promise<Member> {
  if (!isSameOriginWrite(request.headers, serverEnv().siteUrl)) {
    return {
      ok: false,
      response: apiError(403, "Requests from other sites are refused."),
    };
  }
  const session = await requestSession(request);
  if (!session) {
    return { ok: false, response: apiError(401, signInMessage) };
  }
  return { ok: true, ...session };
}

function waitText(seconds: number): string {
  if (seconds < 60) return seconds === 1 ? "a second" : `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return minutes === 1 ? "a minute" : `${minutes} minutes`;
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? "an hour" : `${hours} hours`;
}

/**
 * Counts a write against its rate limit (ADR 0010), for a member's id or,
 * before sign-in, a visitor's address. Returns the response refusing it
 * (429, or 503 when the limits cannot be checked), or null when it may go
 * ahead.
 */
export async function rateLimited(
  action: RateLimitedAction,
  subjectId: string,
): Promise<Response | null> {
  let result: RateLimitResult;
  try {
    result = await consumeRateLimit(action, subjectId);
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

/**
 * Takes back a write counted by `rateLimited` that the server then refused.
 * A failure here only leaves the count one higher, so it is logged.
 */
export async function refundRateLimited(
  action: RateLimitedAction,
  memberId: string,
): Promise<void> {
  try {
    await refundRateLimit(action, memberId);
  } catch (error) {
    console.error(
      `Rate limit refund failed (${action}):`,
      error instanceof Error ? error.message : error,
    );
  }
}
