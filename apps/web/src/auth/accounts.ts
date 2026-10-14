import {
  decideSignUp,
  isRole,
  normalizeEmail,
  type Role,
  type SignUpDecision,
} from "@countrytopics/domain";
import type { Payload } from "payload";

import { serverEnv } from "@/env";
import type { User } from "@/payload-types";

// Better Auth owns sign-in (accounts, sessions, authenticators); Payload owns the
// profile that carries the role. They are linked by `users.authUserId`.

export type AuthUser = {
  id: string;
  email: string;
  name?: string | null;
  emailVerified: boolean;
};

export async function invitationRole(
  payload: Payload,
  email: string,
): Promise<Role | null> {
  // An invitation admits one account; once accepted it grants nothing more, so
  // deleting that person's profile really removes their access.
  const result = await payload.find({
    collection: "invitations",
    where: {
      email: { equals: normalizeEmail(email) },
      acceptedAt: { exists: false },
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const role = result.docs[0]?.role;
  return isRole(role) ? role : null;
}

export async function decideSignUpFor(
  payload: Payload,
  email: string,
): Promise<SignUpDecision> {
  const { inviteOnly, adminEmails } = serverEnv();
  return decideSignUp(email, await invitationRole(payload, email), {
    inviteOnly,
    adminEmails,
  });
}

async function findProfile(
  payload: Payload,
  where: { authUserId: string } | { unlinkedEmail: string },
): Promise<User | null> {
  const result = await payload.find({
    collection: "users",
    where:
      "authUserId" in where
        ? { authUserId: { equals: where.authUserId } }
        : {
            email: { equals: normalizeEmail(where.unlinkedEmail) },
            authUserId: { exists: false },
          },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  return result.docs[0] ?? null;
}

/**
 * Whether `email` may sign in: an existing profile was admitted before, so it
 * stays allowed even if its invitation is later removed; otherwise the sign-up
 * rules decide.
 */
export async function maySignIn(
  payload: Payload,
  email: string,
): Promise<boolean> {
  const existing = await payload.count({
    collection: "users",
    where: { email: { equals: normalizeEmail(email) } },
    overrideAccess: true,
  });
  if (existing.totalDocs > 0) return true;
  return (await decideSignUpFor(payload, email)).allowed;
}

/**
 * Returns the Payload profile for a signed-in Better Auth user, creating it on
 * first use with the role the sign-up rules give. A profile made before Better
 * Auth (MVP week 1) is linked by its email instead. Returns null when the rules
 * no longer allow the account (for example, its invitation was withdrawn before
 * the profile existed) or the address is not verified. Safe to call
 * concurrently.
 */
export async function ensureUserProfile(
  payload: Payload,
  authUser: AuthUser,
): Promise<User | null> {
  const existing = await findProfile(payload, { authUserId: authUser.id });
  if (existing) return existing;

  // Invitations, admin rights, and old profiles are matched by address, so only
  // a proven address (an emailed link, or Google's verified flag) may use them.
  if (!authUser.emailVerified) return null;

  const unlinked = await findProfile(payload, {
    unlinkedEmail: authUser.email,
  });
  if (unlinked) {
    return payload.update({
      collection: "users",
      id: unlinked.id,
      data: {
        authUserId: authUser.id,
        name: unlinked.name || authUser.name || undefined,
      },
      overrideAccess: true,
    });
  }

  const decision = await decideSignUpFor(payload, authUser.email);
  if (!decision.allowed) return null;

  const email = normalizeEmail(authUser.email);
  try {
    const profile = await payload.create({
      collection: "users",
      data: {
        authUserId: authUser.id,
        email,
        name: authUser.name || undefined,
        role: decision.role,
      },
      overrideAccess: true,
    });
    await payload.update({
      collection: "invitations",
      where: { email: { equals: email }, acceptedAt: { exists: false } },
      data: { acceptedAt: new Date().toISOString() },
      overrideAccess: true,
    });
    return profile;
  } catch (error) {
    // A concurrent request created it first (unique authUserId); use that one.
    const created = await findProfile(payload, { authUserId: authUser.id });
    if (created) return created;
    throw error;
  }
}
