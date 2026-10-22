import { TAG_NAME_MAX_LENGTH } from "@countrytopics/domain";
import type { CollectionConfig } from "payload";

import { verifiedAdminsOnly, verifiedStaffOnly } from "@/access";
import { auditHooks } from "@/audit";
import { PUBLIC_TAGS, purgeOnChange } from "@/public-cache";
import { reindexTopicsOnChange } from "@/search-index";

import { fillSlug, slugField } from "./slug";
import { keepWhileUsedByTopics } from "./topic-references";

// Free labels for topics (week 4); a topic can have many.
const audit = auditHooks({
  collection: "tags",
  action: "tag",
  snapshot: (doc) => ({ name: doc.name, slug: doc.slug }),
});

export const Tags: CollectionConfig = {
  slug: "tags",
  admin: {
    group: "Content",
    useAsTitle: "name",
    defaultColumns: ["name", "slug", "updatedAt"],
  },
  defaultSort: "name",
  access: {
    read: verifiedStaffOnly,
    create: verifiedAdminsOnly,
    update: verifiedAdminsOnly,
    delete: verifiedAdminsOnly,
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
      unique: true,
      maxLength: TAG_NAME_MAX_LENGTH,
    },
    slugField,
  ],
  hooks: purgeOnChange(PUBLIC_TAGS.tags, {
    beforeValidate: [fillSlug("tags")],
    beforeDelete: [keepWhileUsedByTopics("tags", "tag")],
    afterChange: [
      ...audit.afterChange,
      reindexTopicsOnChange("tags", {
        searched: (doc) => doc.name,
        topicsShowing: async (_req, id) => ({ tags: { in: [id] } }),
      }),
    ],
    afterDelete: audit.afterDelete,
  }),
};
