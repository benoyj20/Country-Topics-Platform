// How recently a member must have signed in to delete their account (ADR
// 0011), so that someone at a device left signed in cannot do it.

export const RECENT_SIGN_IN_MS = 10 * 60 * 1_000;

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
