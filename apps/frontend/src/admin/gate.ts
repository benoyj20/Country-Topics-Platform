import "server-only";

import type { Account } from "@countrytopics/contracts";
import { redirect } from "next/navigation";

import { currentAccount } from "@/backend/account";

/** Why someone signed in may not open the admin yet. */
export type AdminRefusal = "not-staff" | "not-verified";

/**
 * The admin's gate (ADR 0014): asks the backend for the session before
 * anything under /admin renders. Visitors go to sign-in and come back to
 * `path`. The backend's access rules remain the real check: the admin's
 * scripts hold no secret and no permission.
 */
export async function adminGate(
  path: string,
): Promise<
  { ok: true; account: Account } | { ok: false; refusal: AdminRefusal }
> {
  const account = await currentAccount();
  if (!account) redirect(`/sign-in?callbackURL=${encodeURIComponent(path)}`);
  if (!account.staff) return { ok: false, refusal: "not-staff" };
  if (!account.adminVerified) return { ok: false, refusal: "not-verified" };
  return { ok: true, account };
}
