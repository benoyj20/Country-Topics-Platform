import type {
  ComparedField,
  ReferenceValues,
  SnippetValues,
  TopicValues,
} from "@countrytopics/contracts";
import {
  EVIDENCE_KIND_LABELS,
  formatTime,
  PERSON_ROLE_LABELS,
  REFERENCE_CHECK_LABELS,
  REFERENCE_KIND_LABELS,
  type ReferenceCheckStatus,
  richTextPlainText,
  STANCE_LABELS,
} from "@countrytopics/domain";

import { textAt } from "../field-text.ts";
import { recordName } from "../record-name.ts";
import {
  REFERENCE_TEXTS,
  SNIPPET_TEXTS,
  TIMEBASE_LABELS,
} from "../records/record-texts.ts";
import { TOPIC_TEXTS } from "../topics/topic-text.ts";

// Two versions of a record, field by field, as plain text (ADR 0014,
// phase 11): what a comparison shows side by side and marks the changes
// in. Related records are named as their editors name them; rows are one
// line each.

/** A reference's fields as a version keeps them, with its check. */
export type ReferenceVersionValues = ReferenceValues & {
  checkStatus: ReferenceCheckStatus;
};

/** The two versions compared, of one collection. */
export type ComparedVersions =
  | { collection: "topics"; before: TopicValues; after: TopicValues }
  | {
      collection: "references";
      before: ReferenceVersionValues;
      after: ReferenceVersionValues;
    }
  | { collection: "snippets"; before: SnippetValues; after: SnippetValues };

const yesNo = (value: boolean) => (value ? "Yes" : "No");

function topicFields(values: TopicValues): Record<string, string> {
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

function referenceFields(
  values: ReferenceVersionValues,
): Record<string, string> {
  return {
    doi: values.doi,
    isbn: values.isbn,
    url: values.url,
    kind: REFERENCE_KIND_LABELS[values.kind],
    publishedDate: values.publishedDate,
    title: values.title,
    authors: values.authors,
    containerTitle: values.containerTitle,
    publisher: values.publisher,
    checkStatus: REFERENCE_CHECK_LABELS[values.checkStatus],
  };
}

function snippetFields(values: SnippetValues): Record<string, string> {
  return {
    caption: values.caption,
    youtubeId: values.youtubeId,
    startS: values.startS === null ? "" : formatTime(values.startS, true),
    endS: values.endS === null ? "" : formatTime(values.endS, true),
    speaker: values.speaker ? recordName(values.speaker) : "",
    language: values.language,
    transcriptText: values.transcriptText,
    transcriptTimebase: TIMEBASE_LABELS[values.transcriptTimebase],
  };
}

const EXTRA_LABELS: Record<string, string> = { checkStatus: "Check" };

/** The two versions' fields, in the editor's order, each as plain text. */
export function comparedFields(versions: ComparedVersions): ComparedField[] {
  let before: Record<string, string>;
  let after: Record<string, string>;
  let label: (key: string) => string;
  switch (versions.collection) {
    case "topics":
      before = topicFields(versions.before);
      after = topicFields(versions.after);
      label = (key) => textAt(TOPIC_TEXTS, key)?.label ?? key;
      break;
    case "references":
      before = referenceFields(versions.before);
      after = referenceFields(versions.after);
      label = (key) =>
        textAt(REFERENCE_TEXTS, key)?.label ?? EXTRA_LABELS[key] ?? key;
      break;
    case "snippets":
      before = snippetFields(versions.before);
      after = snippetFields(versions.after);
      label = (key) => textAt(SNIPPET_TEXTS, key)?.label ?? key;
      break;
  }
  return Object.keys(before).map((key) => ({
    key,
    label: label(key),
    before: before[key] ?? "",
    after: after[key] ?? "",
  }));
}
