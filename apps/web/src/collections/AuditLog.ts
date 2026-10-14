import type { CollectionConfig } from "payload";

import { nobody, verifiedAdminsOnly } from "@/access";

// Append-only: entries are written by server code (recordAudit) and can never be
// edited or deleted through the API or the admin panel.
export const AuditLog: CollectionConfig = {
  slug: "audit-log",
  admin: {
    useAsTitle: "action",
    defaultColumns: [
      "action",
      "actor",
      "targetCollection",
      "targetId",
      "createdAt",
    ],
  },
  access: {
    read: verifiedAdminsOnly,
    create: nobody,
    update: nobody,
    delete: nobody,
  },
  fields: [
    { name: "action", type: "text", required: true, index: true },
    {
      name: "actor",
      type: "relationship",
      relationTo: "users",
      admin: { description: "Empty for actions the system took on its own." },
    },
    { name: "targetCollection", type: "text", required: true },
    { name: "targetId", type: "text", required: true, index: true },
    { name: "details", type: "json" },
  ],
};
