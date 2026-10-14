import type { Role } from "./roles.ts";

/** Email addresses compare case-insensitively and without surrounding spaces. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type SignUpRules = {
  /** While true, only invited addresses and bootstrap admins may create accounts. */
  inviteOnly: boolean;
  /** Normalised addresses that always get the admin role (`ADMIN_EMAILS`). */
  adminEmails: readonly string[];
};

export type SignUpDecision =
  { allowed: true; role: Role } | { allowed: false; reason: "not_invited" };

/**
 * Decides whether a new account may be created for `email`, and with which role.
 * `invitationRole` is the role on a pending invitation for that address, if any.
 */
export function decideSignUp(
  email: string,
  invitationRole: Role | null,
  rules: SignUpRules,
): SignUpDecision {
  if (rules.adminEmails.includes(normalizeEmail(email))) {
    return { allowed: true, role: "admin" };
  }
  if (invitationRole) return { allowed: true, role: invitationRole };
  if (rules.inviteOnly) return { allowed: false, reason: "not_invited" };
  return { allowed: true, role: "member" };
}
