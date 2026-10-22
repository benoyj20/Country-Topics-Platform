import type { TopicValues } from "@countrytopics/contracts";
import {
  EVIDENCE_KIND_LABELS,
  PERSON_ROLE_LABELS,
  richTextPlainText,
  STANCE_LABELS,
} from "@countrytopics/domain";

import { textAt } from "../../field-text.ts";
import { recordName } from "../../record-name.ts";
import { TOPIC_TEXTS } from "./topic-text.ts";

// A topic's version, field by field, as plain text, for comparing two
// versions (registry/versions.ts). Related records are named as the
// editor names them; rows are one line each.

const yesNo = (value: boolean) => (value ? "Yes" : "No");

/** A topic version's fields, in the editor's order. */
export function topicFields(values: TopicValues): Record<string, string> {
  return {
    title: values.title,
    summary: values.summary,
    body: richTextPlainText(values.body),
    countries: values.countries.map(recordName).join(", "),
    category: values.category ? recordName(values.category) : "",
    tags: values.tags.map(recordName).join(", "),
    people: values.people
      .map(
        (row) =>
          `${row.individual ? recordName(row.individual) : "No individual"}, ${PERSON_ROLE_LABELS[row.role]}`,
      )
      .join("\n"),
    evidence: values.evidence
      .map((row) => {
        const what =
          row.kind === "link"
            ? row.url
            : row.kind === "snippet"
              ? row.snippet
                ? recordName(row.snippet)
                : "No snippet"
              : row.file
                ? recordName(row.file)
                : "No file";
        const title = row.title ? `${row.title}: ` : "";
        const note = row.note ? ` (${row.note})` : "";
        return `${EVIDENCE_KIND_LABELS[row.kind]}: ${title}${what}${note}`;
      })
      .join("\n"),
    references: values.references
      .map((row) => {
        const name = row.reference ? recordName(row.reference) : "No reference";
        const passage = row.passage ? `: "${row.passage}"` : "";
        const locator = row.locator ? `, ${row.locator}` : "";
        return `${name} (${STANCE_LABELS[row.stance]})${passage}${locator}`;
      })
      .join("\n"),
    readyForReview: yesNo(values.readyForReview),
    archived: yesNo(values.archived),
    slug: values.slug,
  };
}

/** A field's name, as the editor shows it. */
export const topicFieldLabel = (key: string) =>
  textAt(TOPIC_TEXTS, key)?.label ?? key;
