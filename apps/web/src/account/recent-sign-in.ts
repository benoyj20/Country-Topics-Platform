import { RECENT_SIGN_IN_MS } from "@countrytopics/contracts";

// How recently a member must have signed in to delete their account (ADR
// 0011), so that someone at a device left signed in cannot do it. The
// account page says how long, so the limit is in packages/contracts.

export { RECENT_SIGN_IN_MS };

/**
 * Whether a session began recently enough for account deletion. Both times
 * come from this process's clock: Better Auth stamps sessions when it
 * creates them.
 */
export function signedInRecently(
  sessionCreatedAt: Date,
  now: Date = new Date(),
): boolean {
  return now.getTime() - sessionCreatedAt.getTime() <= RECENT_SIGN_IN_MS;
}
