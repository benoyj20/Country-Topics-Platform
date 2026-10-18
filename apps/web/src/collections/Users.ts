import {
  DISPLAY_NAME_MAX_LENGTH,
  displayNameProblem,
  normalizeDisplayName,
  ROLES,
} from "@countrytopics/domain";
import type { CollectionConfig } from "payload";

import {
  eraseAccountContent,
  refuseOwnStaffDeletion,
} from "@/account/deletion";

import {
  isVerifiedAdmin,
  isVerifiedStaff,
  nobody,
  verifiedAdminsOnly,
} from "@/access";
import { changedFields, recordAudit } from "@/audit";
import { deleteAuthUser } from "@/auth/auth";
import { betterAuthStrategy } from "@/auth/payload-strategy";

// One profile per person. Sign-in itself (Google, email link, authenticator
// apps, sessions) is handled by Better Auth; see src/auth. Profiles are created
// on first sign-in, never through the API.
const AUDITED_FIELDS = ["role", "name", "displayName"] as const;

export const Users: CollectionConfig = {
  slug: "users",
  admin: {
    group: "Administration",
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
      // Chosen by the member before their first comment (ADR 0009); the
      // sign-in name and email are never shown publicly.
      name: "displayName",
      type: "text",
      maxLength: DISPLAY_NAME_MAX_LENGTH,
      admin: { description: "Shown publicly with the person's comments." },
      hooks: {
        beforeValidate: [
          ({ value }) =>
            typeof value === "string" ? normalizeDisplayName(value) : value,
        ],
      },
      validate: (value: string | null | undefined) =>
        value ? (displayNameProblem(value) ?? true) : true,
    },
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
          return;
        }
        const changes = changedFields(previousDoc, doc, AUDITED_FIELDS);
        if (Object.keys(changes).length > 0) {
          await recordAudit(req, {
            action: "role" in changes ? "user.role_changed" : "user.updated",
            targetCollection: "users",
            targetId: String(doc.id),
            details: { email: doc.email, changes },
          });
        }
      },
    ],
    beforeDelete: [
      async ({ id, req }) => {
        refuseOwnStaffDeletion(req, String(id));
        await eraseAccountContent(req, String(id));
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        const own = req.user?.id === doc.id;
        await recordAudit(
          req,
          {
            action: "user.deleted",
            targetCollection: "users",
            targetId: String(doc.id),
            details: { email: doc.email, role: doc.role, own },
          },
          // A member deleting their own account is no longer there to
          // name as the actor.
          own ? { actor: null } : undefined,
        );
        // Deleting a profile removes the person's sign-in account too, which
        // ends all their sessions; they need a new invitation to come back.
        // Last, as it cannot be rolled back with the rest.
        if (doc.authUserId) await deleteAuthUser(doc.authUserId);
      },
    ],
  },
};
