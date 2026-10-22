import type { FieldTexts } from "./field-text.ts";

// What evidence rows and source rows call their fields, as Payload's panel
// does (apps/web/src/collections/evidence-field.ts), wherever they back a
// published statement: in topics and on individuals' profiles.

export const EVIDENCE_TEXTS: FieldTexts = {
  kind: { label: "Kind" },
  title: {
    label: "Title",
    description:
      "Such as 'Ministry press release, 3 May 2024'. Optional for snippets, which show their caption.",
  },
  file: { label: "File" },
  snippet: {
    label: "Snippet",
    description:
      "A clip of a YouTube video with its transcript, made under Snippets.",
  },
  url: { label: "Link" },
  archiveUrl: {
    label: "Copy in another archive",
    description:
      "Optional, such as an archive.today link, when the Wayback Machine cannot copy the page.",
  },
  note: { label: "What it shows" },
};

/** A source row's fields; each form says what its passage supports. */
export function sourceTexts(passage: string): FieldTexts {
  return {
    reference: { label: "Reference" },
    passage: { label: "Passage", description: passage },
    locator: { label: "Page or section" },
  };
}
