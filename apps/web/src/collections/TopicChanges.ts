import type { CollectionConfig } from "payload";

import { nobody, verifiedStaffOnly } from "@/access";

// A topic's public change log (F3): one entry per publish, written by the topic
// hooks and never edited or deleted. Visitors see it from week 7; the full
// content of every version stays in Payload's version history.
export const TopicChanges: CollectionConfig = {
  slug: "topic-changes",
  labels: { singular: "Topic change", plural: "Topic changes" },
  admin: {
    group: "Content",
    useAsTitle: "note",
    defaultColumns: ["topic", "kind", "note", "createdAt"],
  },
  defaultSort: "-createdAt",
  access: {
    read: verifiedStaffOnly,
    create: nobody,
    update: nobody,
    delete: nobody,
  },
  fields: [
    {
      name: "topic",
      type: "relationship",
      relationTo: "topics",
      required: true,
      index: true,
    },
    {
      name: "kind",
      type: "select",
      required: true,
      options: [
        { label: "First published", value: "published" },
        { label: "Updated", value: "updated" },
        { label: "Archived", value: "archived" },
        { label: "Restored", value: "restored" },
      ],
    },
    { name: "note", type: "textarea", required: true },
    {
      name: "version",
      type: "text",
      admin: { description: "The published version this entry describes." },
    },
    { name: "actor", type: "relationship", relationTo: "users" },
  ],
};
