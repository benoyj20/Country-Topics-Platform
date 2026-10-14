import { canEnterAdminPanel, isRole, type Role } from "@countrytopics/domain";
import type { Access, PayloadRequest } from "payload";

type RequestUser = PayloadRequest["user"];

function roleOf(user: RequestUser): Role | null {
  return user && isRole(user.role) ? user.role : null;
}

/**
 * Staff powers need the same authenticator check as the admin panel, on every
 * route (REST and local API included), not only in the panel's UI.
 */
export function isVerifiedStaff(user: RequestUser): boolean {
  const role = roleOf(user);
  if (!user || !role) return false;
  return canEnterAdminPanel({
    role,
    twoFactorEnabled: user.twoFactorEnabled === true,
    twoFactorVerifiedAt: user.twoFactorVerifiedAt
      ? new Date(user.twoFactorVerifiedAt)
      : null,
  });
}

export function isVerifiedAdmin(user: RequestUser): boolean {
  return roleOf(user) === "admin" && isVerifiedStaff(user);
}

export const verifiedStaffOnly: Access = ({ req }) => isVerifiedStaff(req.user);
export const verifiedAdminsOnly: Access = ({ req }) =>
  isVerifiedAdmin(req.user);
export const nobody: Access = () => false;
