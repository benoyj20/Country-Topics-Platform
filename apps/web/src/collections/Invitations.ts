import { normalizeEmail, ROLES } from "@countrytopics/domain";
import type { CollectionConfig } from "payload";

import { verifiedAdminsOnly } from "@/access";
import { changedFields, recordAudit } from "@/audit";

// The invite-only allowlist (INVITE_ONLY). An address on this list may create an
// account and receives the invitation's role when it does.
export const Invitations: CollectionConfig = {
  slug: "invitations",
  admin: {
    useAsTitle: "email",
    defaultColumns: ["email", "role", "acceptedAt", "createdAt"],
  },
  access: {
    read: verifiedAdminsOnly,
    create: verifiedAdminsOnly,
    update: verifiedAdminsOnly,
    delete: verifiedAdminsOnly,
  },
  fields: [
    { name: "email", type: "email", required: true, unique: true, index: true },
    {
      name: "role",
      type: "select",
      required: true,
      defaultValue: "member",
      options: [...ROLES],
    },
    { name: "note", type: "textarea" },
    {
      name: "invitedBy",
      type: "relationship",
      relationTo: "users",
      access: { create: () => false, update: () => false },
      admin: { readOnly: true, position: "sidebar" },
    },
    {
      name: "acceptedAt",
      type: "date",
      access: { create: () => false, update: () => false },
      admin: { readOnly: true, position: "sidebar" },
    },
  ],
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (data && typeof data.email === "string")
          data.email = normalizeEmail(data.email);
        return data;
      },
    ],
    beforeChange: [
      ({ data, operation, req }) => {
        if (operation === "create" && req.user) data.invitedBy = req.user.id;
        return data;
      },
    ],
    afterChange: [
      async ({ doc, operation, previousDoc, req }) => {
        if (operation === "create") {
          await recordAudit(req, {
            action: "invitation.created",
            targetCollection: "invitations",
            targetId: String(doc.id),
            details: { email: doc.email, role: doc.role },
          });
        } else {
          const changes = changedFields(previousDoc, doc, [
            "email",
            "role",
            "note",
          ]);
          if (Object.keys(changes).length > 0) {
            await recordAudit(req, {
              action: "invitation.updated",
              targetCollection: "invitations",
              targetId: String(doc.id),
              details: { email: doc.email, changes },
            });
          }
        }
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        await recordAudit(req, {
          action: "invitation.deleted",
          targetCollection: "invitations",
          targetId: String(doc.id),
          details: { email: doc.email },
        });
      },
    ],
  },
};
