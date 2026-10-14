import { ROLES } from "@countrytopics/domain";
import type { CollectionConfig } from "payload";

import {
  isVerifiedAdmin,
  isVerifiedStaff,
  nobody,
  verifiedAdminsOnly,
} from "@/access";
import { recordAudit } from "@/audit";
import { betterAuthStrategy } from "@/auth/payload-strategy";

// One profile per person. Sign-in itself (Google, email link, authenticator
// apps, sessions) is handled by Better Auth; see src/auth. Profiles are created
// on first sign-in, never through the API.
export const Users: CollectionConfig = {
  slug: "users",
  admin: {
    useAsTitle: "email",
    defaultColumns: ["email", "name", "role", "createdAt"],
  },
  auth: {
    disableLocalStrategy: true,
    strategies: [betterAuthStrategy],
  },
  access: {
    admin: ({ req }) => isVerifiedStaff(req.user),
    read: ({ req }) => {
      if (isVerifiedAdmin(req.user)) return true;
      return req.user ? { id: { equals: req.user.id } } : false;
    },
    create: nobody,
    update: verifiedAdminsOnly,
    delete: verifiedAdminsOnly,
  },
  fields: [
    {
      name: "email",
      type: "email",
      required: true,
      unique: true,
      index: true,
      access: { update: () => false },
      admin: { readOnly: true },
    },
    { name: "name", type: "text" },
    {
      name: "role",
      type: "select",
      required: true,
      defaultValue: "member",
      options: [...ROLES],
    },
    {
      // Empty only for an account made before Better Auth (MVP week 1); it is
      // linked by email on that person's first sign-in.
      name: "authUserId",
      type: "text",
      unique: true,
      index: true,
      access: { update: () => false },
      admin: { readOnly: true, position: "sidebar" },
    },
    // This session's authenticator state, filled in by the sign-in strategy and
    // never stored.
    {
      name: "twoFactorEnabled",
      type: "checkbox",
      virtual: true,
      admin: { hidden: true },
    },
    {
      name: "twoFactorVerifiedAt",
      type: "date",
      virtual: true,
      admin: { hidden: true },
    },
  ],
  hooks: {
    afterChange: [
      async ({ doc, operation, previousDoc, req }) => {
        if (operation === "create") {
          await recordAudit(req, {
            action: "user.created",
            targetCollection: "users",
            targetId: String(doc.id),
            details: { email: doc.email, role: doc.role },
          });
        } else if (previousDoc.role !== doc.role) {
          await recordAudit(req, {
            action: "user.role_changed",
            targetCollection: "users",
            targetId: String(doc.id),
            details: { email: doc.email, from: previousDoc.role, to: doc.role },
          });
        }
      },
    ],
  },
};
