import {
  DOCUMENT_MIME_TYPES,
  EVIDENCE_KIND_LABELS,
  EVIDENCE_KINDS,
  EVIDENCE_NOTE_MAX_LENGTH,
  EVIDENCE_TITLE_MAX_LENGTH,
  IMAGE_MIME_TYPES,
  URL_MAX_LENGTH,
} from "@countrytopics/domain";
import type { ArrayField } from "payload";

import { rows } from "@/array-rows";

import { httpUrl, optionalHttpUrl } from "./url-field";

// Evidence rows, shared by topics and the statements on individuals'
// profiles (ADR 0007): the same kinds, fields, and checks wherever evidence
// backs a published statement.

export function evidenceKind(siblingData: unknown): unknown {
  return siblingData && typeof siblingData === "object" && "kind" in siblingData
    ? siblingData.kind
    : undefined;
}

/** The evidence rows with the fields that do not apply to their kind cleared. */
export function tidyEvidenceRows(value: unknown): Record<string, unknown>[] {
  return rows(value).map((row) => {
    if (row.kind === "link") return { ...row, file: null, snippet: null };
    const notLink = { ...row, url: null, archiveUrl: null };
    return row.kind === "snippet"
      ? { ...notLink, file: null }
      : { ...notLink, snippet: null };
  });
}

/** The web pages among evidence rows, for the Wayback Machine. */
export function evidenceLinkUrls(value: unknown): unknown[] {
  return rows(value).flatMap((row) => (row.kind === "link" ? [row.url] : []));
}

/** An `evidence` array field: documents, images, web pages, and snippets. */
export function evidenceField(description: string): ArrayField {
  return {
    name: "evidence",
    type: "array",
    labels: { singular: "Evidence", plural: "Evidence" },
    admin: { description },
    fields: [
      {
        type: "row",
        fields: [
          {
            name: "kind",
            type: "select",
            required: true,
            defaultValue: "document",
            options: EVIDENCE_KINDS.map((value) => ({
              value,
              label: EVIDENCE_KIND_LABELS[value],
            })),
          },
          {
            name: "title",
            type: "text",
            maxLength: EVIDENCE_TITLE_MAX_LENGTH,
            // A snippet already has a caption, shown when this is empty.
            // This replaces Payload's text check, so it checks the length.
            validate: (
              value: unknown,
              { siblingData }: { siblingData: unknown },
            ) => {
              if (
                typeof value === "string" &&
                value.length > EVIDENCE_TITLE_MAX_LENGTH
              ) {
                return `Keep the title to ${EVIDENCE_TITLE_MAX_LENGTH} characters.`;
              }
              return value || evidenceKind(siblingData) === "snippet"
                ? true
                : "Give the evidence a title.";
            },
            admin: {
              description:
                "Such as 'Ministry press release, 3 May 2024'. Optional for snippets, which show their caption.",
            },
          },
        ],
      },
      {
        name: "file",
        type: "upload",
        relationTo: "media",
        required: true,
        // Images for image evidence, PDFs for documents; checked on save.
        filterOptions: ({ siblingData }) => ({
          mimeType: {
            in:
              evidenceKind(siblingData) === "image"
                ? IMAGE_MIME_TYPES
                : DOCUMENT_MIME_TYPES,
          },
        }),
        admin: {
          condition: (_, siblingData) => {
            const kind = evidenceKind(siblingData);
            return kind !== "link" && kind !== "snippet";
          },
        },
      },
      {
        name: "snippet",
        type: "relationship",
        relationTo: "snippets",
        required: true,
        index: true,
        admin: {
          condition: (_, siblingData) =>
            evidenceKind(siblingData) === "snippet",
          description:
            "A clip of a YouTube video with its transcript, made under Snippets.",
        },
      },
      {
        name: "url",
        label: "Link",
        type: "text",
        maxLength: URL_MAX_LENGTH,
        validate: (value: unknown) =>
          value ? httpUrl(value) : "Enter the page's link.",
        admin: {
          condition: (_, siblingData) => evidenceKind(siblingData) === "link",
        },
      },
      {
        name: "archiveUrl",
        label: "Copy in another archive",
        type: "text",
        maxLength: URL_MAX_LENGTH,
        validate: optionalHttpUrl,
        admin: {
          condition: (_, siblingData) => evidenceKind(siblingData) === "link",
          description:
            "Optional, such as an archive.today link, when the Wayback Machine cannot copy the page.",
        },
      },
      {
        name: "note",
        label: "What it shows",
        type: "textarea",
        maxLength: EVIDENCE_NOTE_MAX_LENGTH,
      },
    ],
  };
}
