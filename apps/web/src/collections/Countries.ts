import type { CollectionConfig } from "payload";

import { nobody, verifiedAdminsOnly, verifiedStaffOnly } from "@/access";
import { auditHooks } from "@/audit";

import { slugField } from "./slug";

// The ISO 3166-1 list, loaded by a migration (20261014_223400_seed_countries)
// and closed: entries are never created or deleted through the API. Admins may
// adjust the display name, slug, and region grouping; the codes never change.
const readOnlyCode = {
  access: { create: () => false, update: () => false },
  admin: { readOnly: true },
} as const;

export const Countries: CollectionConfig = {
  slug: "countries",
  admin: {
    group: "Content",
    useAsTitle: "name",
    defaultColumns: ["name", "code", "region", "subregion"],
    listSearchableFields: ["name", "code", "isoName"],
    pagination: { defaultLimit: 50 },
  },
  defaultSort: "name",
  access: {
    read: verifiedStaffOnly,
    create: nobody,
    update: verifiedAdminsOnly,
    delete: nobody,
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
      index: true,
      admin: { description: "The name shown on the site." },
    },
    {
      name: "code",
      label: "ISO 3166-1 alpha-2",
      type: "text",
      required: true,
      unique: true,
      index: true,
      ...readOnlyCode,
    },
    {
      type: "row",
      fields: [
        {
          name: "alpha3",
          label: "Alpha-3",
          type: "text",
          required: true,
          unique: true,
          ...readOnlyCode,
        },
        {
          name: "numericCode",
          label: "Numeric",
          type: "text",
          required: true,
          unique: true,
          ...readOnlyCode,
        },
      ],
    },
    {
      name: "isoName",
      label: "ISO short name",
      type: "text",
      required: true,
      ...readOnlyCode,
    },
    {
      type: "row",
      fields: [
        {
          name: "region",
          type: "text",
          index: true,
          admin: {
            description: "UN M49 region, used to group the country picker.",
          },
        },
        {
          name: "subregion",
          type: "text",
          admin: { description: "UN M49 sub-region." },
        },
      ],
    },
    slugField,
  ],
  hooks: auditHooks({
    collection: "countries",
    action: "country",
    snapshot: (doc) => ({
      code: doc.code,
      name: doc.name,
      slug: doc.slug,
      region: doc.region ?? null,
      subregion: doc.subregion ?? null,
    }),
  }),
};
