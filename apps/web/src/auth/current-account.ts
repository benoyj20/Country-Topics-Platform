import {
  canEnterAdminPanel,
  isRole,
  isStaff,
  type Role,
} from "@countrytopics/domain";
import { headers } from "next/headers";

import { loadPayload } from "@/payload-instance";

import { ensureUserProfile } from "./accounts";
import { getAuth } from "./auth";

export type CurrentAccount = {
  email: string;
  name: string | null;
  role: Role;
  staff: boolean;
  twoFactorEnabled: boolean;
  /** This session passed the authenticator check recently enough for the admin panel. */
  adminVerified: boolean;
};

/** The signed-in person for server-rendered pages, or null for visitors. */
export async function currentAccount(): Promise<CurrentAccount | null> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;

  const profile = await ensureUserProfile(await loadPayload(), session.user);
  if (!profile || !isRole(profile.role)) return null;

  const twoFactorEnabled = session.user.twoFactorEnabled === true;
  const verifiedAt = session.session.twoFactorVerifiedAt;
  return {
    email: profile.email,
    name: profile.name ?? null,
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
