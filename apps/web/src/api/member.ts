import { ensureUserProfile } from "@/auth/accounts";
import { getAuth } from "@/auth/auth";
import { isSameOriginWrite } from "@/auth/same-origin";
import { serverEnv } from "@/env";
import { loadPayload } from "@/payload-instance";
import type { User } from "@/payload-types";

import { apiError } from "./json";

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
