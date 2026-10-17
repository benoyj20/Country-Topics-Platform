import { URL_MAX_LENGTH } from "@countrytopics/domain";
import type { CollectionConfig } from "payload";

import { verifiedAdminsOnly, verifiedStaffOnly } from "@/access";
import { auditHooks } from "@/audit";
import { LICENCE_LABELS } from "@/content-labels";
import { PUBLIC_TAGS, purgeOnChange } from "@/public-cache";
import { reindexTopicsOnChange } from "@/search-index";

import { keepWhileUsed } from "./topic-references";
import { optionalHttpUrl } from "./url-field";

/** Photos and pictures; no SVG, which can carry scripts. */
export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const DOCUMENT_MIME_TYPES = ["application/pdf"];
/** Larger files belong on their publisher's site, linked and archived. */
export const UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

// F3 evidence files (documents and images) and F2 photos of individuals,
// stored in S3-compatible storage (ADR 0005), never on the web server's disk.
// Payload serves files to staff only; visitors get the files that public
// pages show through /files/[id] (ADR 0007).
const audit = auditHooks({
  collection: "media",
  action: "media",
  snapshot: (doc) => ({
    filename: doc.filename,
    mimeType: doc.mimeType,
    filesize: doc.filesize,
    alt: doc.alt,
    licence: doc.licence,
    credit: doc.credit ?? null,
    sourceUrl: doc.sourceUrl ?? null,
  }),
});

export const Media: CollectionConfig = {
  slug: "media",
  labels: { singular: "File", plural: "Files" },
  admin: {
    group: "Content",
    useAsTitle: "alt",
    defaultColumns: ["filename", "alt", "licence", "updatedAt"],
    description:
      "Documents and images used as evidence, and photos of individuals. Record the licence of every file.",
  },
  access: {
    read: verifiedStaffOnly,
    create: verifiedAdminsOnly,
    update: verifiedAdminsOnly,
    delete: verifiedAdminsOnly,
  },
  upload: {
    // Payload checks the file's content, not just its name, against these.
    mimeTypes: [...IMAGE_MIME_TYPES, ...DOCUMENT_MIME_TYPES],
    // Uploads come from the admin's computer only; the server never fetches
    // a pasted URL.
    pasteURL: false,
    modifyResponseHeaders: ({ headers }) => {
      // Browsers must use the stored type, and staff-only files must not sit
      // in shared caches.
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Cache-Control", "private, no-store");
      return headers;
    },
  },
  fields: [
    {
      name: "alt",
      label: "Description",
      type: "text",
      required: true,
      maxLength: 300,
      admin: {
        description:
          "What the file shows or contains, for people who cannot see it and for search.",
      },
    },
    {
      name: "licence",
      type: "select",
      required: true,
      options: Object.entries(LICENCE_LABELS).map(([value, label]) => ({
        value,
        label,
      })),
      admin: {
        description:
          "Only upload files we may publish (AGENTS.md: licensed photos only).",
      },
    },
    {
      name: "credit",
      type: "text",
      maxLength: 300,
      admin: {
        description:
          "Author or owner, as the licence asks, such as 'Photo: A. Example / CC BY 4.0'.",
      },
    },
    {
      name: "sourceUrl",
      label: "Source link",
      type: "text",
      maxLength: URL_MAX_LENGTH,
      validate: optionalHttpUrl,
      admin: {
        description: "Where the file came from, so others can check it.",
      },
    },
  ],
  hooks: purgeOnChange(PUBLIC_TAGS.media, {
    beforeDelete: [
      keepWhileUsed("file", [
        { collection: "topics", field: "evidence.file" },
        { collection: "individuals", field: "photo" },
        { collection: "individuals", field: "statements.evidence.file" },
      ]),
    ],
    afterChange: [
      ...audit.afterChange,
      // Whether a file can be shown decides its topics' evidence kinds.
      reindexTopicsOnChange("media", {
        searched: (doc) => [doc.filename, doc.mimeType],
        topicsShowing: async (_req, id) => ({
          "evidence.file": { equals: id },
        }),
      }),
    ],
    afterDelete: audit.afterDelete,
  }),
};
