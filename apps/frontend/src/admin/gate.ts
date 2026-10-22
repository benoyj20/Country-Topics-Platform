import "server-only";

import {
  type Account,
  ADMIN_COLLECTIONS,
  ADMIN_LISTS,
  type AdminCollection,
} from "@countrytopics/contracts";
import { redirect } from "next/navigation";

import { currentAccount } from "@/backend/account";

import { type AdminGroup, COLLECTION_TEXT } from "./collections";

/** Why someone signed in may not open the admin yet. */
export type AdminRefusal = "not-staff" | "not-verified";

/** Whether `account` may read `collection`'s list, as the backend decides. */
export function canRead(
  collection: AdminCollection,
  account: Account,
): boolean {
  return (
    ADMIN_LISTS[collection].readers === "staff" || account.role === "admin"
  );
}

/**
 * Where `account` makes a new record of `collection`: only collections
 * whose editor is built, for those the backend lets create them.
 */
export function createHref(
  collection: AdminCollection,
  account: Account,
): string | undefined {
  // Topics: verified admins only (apps/web's Topics access).
  return collection === "topics" && account.role === "admin"
    ? "/admin/collections/topics/create"
    : undefined;
}

/** The collections in `group` that `account` may read, in the panel's order. */
export function readableIn(
  group: AdminGroup,
  account: Account,
): AdminCollection[] {
  return ADMIN_COLLECTIONS.filter(
    (collection) =>
      COLLECTION_TEXT[collection].group === group &&
      canRead(collection, account),
  );
}

/**
 * The admin's gate (ADR 0014): asks the backend for the session before
 * anything under /admin renders. Visitors go to sign-in and come back to
 * `path`. The backend's access rules remain the real check: the admin's
 * scripts hold no secret and no permission.
 */
export async function adminGate(
  path: string,
): Promise<
  | { ok: true; account: Account }
  | { ok: false; refusal: AdminRefusal; account: Account }
> {
  const account = await currentAccount();
  if (!account) redirect(`/sign-in?callbackURL=${encodeURIComponent(path)}`);
  if (!account.staff) return { ok: false, refusal: "not-staff", account };
  if (!account.adminVerified) {
    return { ok: false, refusal: "not-verified", account };
  }
  return { ok: true, account };
}
