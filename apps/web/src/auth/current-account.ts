import type { Account } from "@countrytopics/contracts";
import { canEnterAdminPanel, isRole, isStaff } from "@countrytopics/domain";
import { headers } from "next/headers";

import { loadPayload } from "@/payload-instance";

import { ensureUserProfile } from "./accounts";
import { getAuth } from "./auth";

export type CurrentAccount = Account;

/** The signed-in person for server-rendered pages, or null for visitors. */
export async function currentAccount(): Promise<CurrentAccount | null> {
  return accountFor(await headers());
}

/**
 * The person a request's session cookie belongs to, or null for visitors:
 * for this backend's pages, and for the frontend's, which ask through
 * GET /api/v1/account.
 */
export async function accountFor(
  requestHeaders: Headers,
): Promise<CurrentAccount | null> {
  // Reading a session must not set cookies: server components cannot, and
  // the frontend renders its pages with them unchanged. The browser
  // refreshes the session instead (RefreshSession).
  const session = await getAuth().api.getSession({
    headers: requestHeaders,
    query: { disableRefresh: true },
  });
  if (!session) return null;

  const profile = await ensureUserProfile(await loadPayload(), session.user);
  if (!profile || !isRole(profile.role)) return null;

  const twoFactorEnabled = session.user.twoFactorEnabled === true;
  const verifiedAt = session.session.twoFactorVerifiedAt;
  return {
    id: String(profile.id),
    email: profile.email,
    name: profile.name ?? null,
    displayName: profile.displayName ?? null,
    role: profile.role,
    staff: isStaff(profile.role),
    twoFactorEnabled,
    adminVerified: canEnterAdminPanel({
      role: profile.role,
      twoFactorEnabled,
      twoFactorVerifiedAt: verifiedAt ? new Date(verifiedAt) : null,
    }),
  };
}
