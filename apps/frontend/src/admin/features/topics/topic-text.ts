import { EVIDENCE_TEXTS, sourceTexts } from "../../evidence-text.ts";
import { fieldNameAt, type FieldTexts } from "../../field-text.ts";

// What the topic editor calls each field and what it says about it, as
// Payload's panel does (apps/api/src/collections/Topics.ts and
// evidence-field.ts).

export const TOPIC_TEXTS: FieldTexts = {
  title: { label: "Title" },
  summary: {
    label: "Summary",
    description: "One or two sentences, shown in lists and previews.",
  },
  body: { label: "Body" },
  countries: { label: "Countries" },
  category: { label: "Category" },
  tags: { label: "Tags" },
  people: {
    label: "Individuals",
    description:
      "Who the topic is about (subject), who is quoted (speaker), who provided information (source), or who is only mentioned.",
    row: "Individual",
    fields: {
      individual: { label: "Individual" },
      role: { label: "Role" },
    },
  },
  evidence: {
    label: "Evidence",
    description:
      "What shows it happened: documents, images, web pages (copied to the Wayback Machine), and video snippets. A topic that names individuals needs at least one.",
    row: "Evidence",
    fields: EVIDENCE_TEXTS,
  },
  references: {
    label: "References",
    description:
      "Papers, books, reports, and pages that support or contradict the topic, each with the passage that does. Only confirmed references can be published.",
    row: "Reference",
    fields: {
      ...sourceTexts(
        "The words in the reference that support, contradict, or explain the topic, quoted exactly.",
      ),
      stance: { label: "Stance" },
    },
  },
  changeNote: {
    label: "Change note",
    description:
      "Required when publishing changes to a published topic. Shown in its public change log.",
  },
  readyForReview: {
    label: "Ready for review",
    description: "Marks a draft as finished and waiting to be checked.",
  },
  archived: {
    label: "Archived",
    description:
      "Takes the topic out of lists when published; its page and history stay.",
  },
  slug: {
    label: "Slug",
    description:
      "Used in links. Filled from the title when left empty; changing it later breaks old links.",
  },
};

/** A form field's name in a list of messages, such as "Evidence 2, Link". */
export function fieldName(key: string): string {
  return fieldNameAt(TOPIC_TEXTS, key);
}
