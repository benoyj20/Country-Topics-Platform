import type { FieldTexts } from "../../field-text.ts";

// What the reference editor calls each field and what it says about it, as
// Payload's panel does (apps/api/src/collections/References.ts), for the
// editor and for comparing versions.

export const REFERENCE_TEXTS: FieldTexts = {
  doi: { label: "DOI" },
  isbn: { label: "ISBN" },
  url: {
    label: "Link",
    description:
      "Where to read it: the publisher's page or the report itself. Needed when there is no DOI or ISBN.",
  },
  kind: { label: "Kind" },
  publishedDate: { label: "Published" },
  title: { label: "Title" },
  authors: { label: "Authors", description: "One per line, as printed." },
  containerTitle: { label: "Journal, book, or website" },
  publisher: { label: "Publisher" },
};
