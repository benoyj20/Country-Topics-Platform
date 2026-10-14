// Roles from docs/product-overview.md. Visitors are not signed in and have no
// account; Subscriber arrives with payments after the pilot.

export const ROLES = ["member", "moderator", "admin"] as const;
export type Role = (typeof ROLES)[number];

/** Staff can open the admin panel, and must use two-factor verification. */
export const STAFF_ROLES: readonly Role[] = ["moderator", "admin"];

/** A staff member's verification lasts this long before they must enter a new code. */
export const ADMIN_VERIFICATION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function isRole(value: unknown): value is Role {
  return (
    typeof value === "string" && (ROLES as readonly string[]).includes(value)
  );
}

export function isStaff(role: Role): boolean {
  return STAFF_ROLES.includes(role);
}

export type AdminPanelAccess = {
  role: Role;
  /** The account has an authenticator app set up. */
  twoFactorEnabled: boolean;
  /** When this session last passed the authenticator check, if ever. */
  twoFactorVerifiedAt: Date | null;
};

/**
 * Staff enter the admin panel only after this session passed an authenticator
 * check recently. Google and email-link sign-in alone are not enough.
 */
export function canEnterAdminPanel(
  access: AdminPanelAccess,
  now: Date = new Date(),
): boolean {
  if (!isStaff(access.role) || !access.twoFactorEnabled) return false;
  if (!access.twoFactorVerifiedAt) return false;
  const ageMs = now.getTime() - access.twoFactorVerifiedAt.getTime();
  return ageMs >= 0 && ageMs <= ADMIN_VERIFICATION_MAX_AGE_MS;
}
