import {
  LINK_ARCHIVE_STATUSES,
  type LinkArchiveStatus,
} from "@countrytopics/domain";
import type { CollectionConfig } from "payload";

import { nobody, verifiedStaffOnly } from "@/access";

const STATUS_LABELS: Record<LinkArchiveStatus, string> = {
  archived: "Archived",
  not_archived: "No copy",
  failed: "Could not check",
};

// Wayback Machine copies of links that topics use as evidence or that
// references point to, one record per link. Only the worker writes them
// (packages/jobs, content-store.ts); a link with no record is still waiting.
export const LinkArchives: CollectionConfig = {
  slug: "link-archives",
  labels: { singular: "Archived link", plural: "Archived links" },
  admin: {
    group: "Content",
    useAsTitle: "url",
    defaultColumns: ["url", "status", "capturedAt", "checkedAt"],
    description:
      "Filled in by the worker: copies of evidence links and reference links in the Wayback Machine.",
  },
  defaultSort: "-checkedAt",
  access: {
    read: verifiedStaffOnly,
    create: nobody,
    update: nobody,
    delete: nobody,
  },
  fields: [
    {
      name: "url",
      label: "Link",
      type: "text",
      required: true,
      unique: true,
      maxLength: 2048,
    },
    {
      name: "status",
      type: "select",
      required: true,
      options: LINK_ARCHIVE_STATUSES.map((value) => ({
        value,
        label: STATUS_LABELS[value],
      })),
    },
    { name: "archiveUrl", label: "Archived copy", type: "text" },
    { name: "capturedAt", label: "Copy taken", type: "date" },
    { name: "message", type: "text" },
    { name: "checkedAt", label: "Checked", type: "date" },
  ],
};
