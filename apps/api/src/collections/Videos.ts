import {
  VIDEO_CHECK_LABELS,
  VIDEO_CHECK_STATUSES,
} from "@countrytopics/domain";
import type { CollectionConfig } from "payload";

import { nobody, verifiedAdminsOnly, verifiedStaffOnly } from "@/access";
import { auditHooks } from "@/audit";

import { keepWhileUsed } from "./topic-references";

const audit = auditHooks({
  collection: "videos",
  action: "video",
  snapshot: (doc) => ({
    youtubeId: doc.youtubeId,
    title: doc.title ?? null,
    channel: doc.channel ?? null,
  }),
});

// F4: the YouTube videos snippets are cut from, one record per video, shared
// by every snippet of it. Saving a snippet adds its video (see Snippets.ts);
// the worker asks YouTube about it and writes the other fields
// (packages/jobs, content-store.ts). Nothing is downloaded from YouTube.
export const Videos: CollectionConfig = {
  slug: "videos",
  admin: {
    group: "Content",
    useAsTitle: "title",
    defaultColumns: [
      "title",
      "channel",
      "checkStatus",
      "durationS",
      "checkedAt",
    ],
    listSearchableFields: ["title", "channel", "youtubeId"],
    description:
      "YouTube videos that snippets are cut from. Added when a snippet is saved; the worker checks each one with YouTube.",
  },
  defaultSort: "-updatedAt",
  access: {
    read: verifiedStaffOnly,
    create: nobody,
    update: nobody,
    delete: verifiedAdminsOnly,
  },
  fields: [
    {
      name: "youtubeId",
      label: "YouTube id",
      type: "text",
      required: true,
      unique: true,
      index: true,
      admin: { readOnly: true },
    },
    { name: "title", type: "text", admin: { readOnly: true } },
    { name: "channel", type: "text", admin: { readOnly: true } },
    {
      name: "durationS",
      label: "Length (seconds)",
      type: "number",
      admin: {
        readOnly: true,
        description: "Known when the worker has a YouTube Data API key.",
      },
    },
    {
      name: "checkStatus",
      label: "Check",
      type: "select",
      required: true,
      defaultValue: "pending",
      index: true,
      options: VIDEO_CHECK_STATUSES.map((value) => ({
        value,
        label: VIDEO_CHECK_LABELS[value],
      })),
      admin: { readOnly: true, position: "sidebar" },
    },
    {
      name: "checkMessage",
      label: "Check result",
      type: "text",
      admin: { readOnly: true, position: "sidebar" },
    },
    {
      name: "checkedAt",
      label: "Checked",
      type: "date",
      admin: { readOnly: true, position: "sidebar" },
    },
    {
      // When the current check was asked for; the queued job carries the
      // same time, so the worker can tell a save that has not committed yet
      // from the video's previous check (content-store.ts).
      name: "checkRequestedAt",
      type: "date",
      admin: { hidden: true },
    },
    {
      name: "confirmedAt",
      label: "First found playable",
      type: "date",
      admin: {
        readOnly: true,
        position: "sidebar",
        description:
          "Snippets back published topics only once their video was found playable.",
      },
    },
  ],
  hooks: {
    beforeDelete: [
      keepWhileUsed("video", [{ collection: "snippets", field: "video" }]),
    ],
    afterChange: audit.afterChange,
    afterDelete: audit.afterDelete,
  },
};
