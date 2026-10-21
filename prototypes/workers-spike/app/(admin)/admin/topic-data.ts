import type { SerializedEditorState } from "lexical";

import { isRecord } from "./save-result";

// The topic and country data the editor shows, as Payload's REST API sends
// them with depth=0, and the checks that an answer has that shape. Kept out
// of the "use client" form so the server can call the checks.

export type EditableTopic = {
  id: string;
  title?: string | null;
  summary?: string | null;
  slug?: string | null;
  body?: SerializedEditorState | null;
  countries?: string[] | null;
  changeNote?: string | null;
  _status?: "draft" | "published" | null;
  state?: string | null;
  firstPublishedAt?: string | null;
};

export type CountryOption = { id: string; name: string };

export type TopicRow = {
  id: string;
  title?: string | null;
  state?: string | null;
  _status?: string | null;
  updatedAt: string;
};

const optionalString = (value: unknown) =>
  value === undefined || value === null || typeof value === "string";

export function isEditableTopic(value: unknown): value is EditableTopic {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    [
      "title",
      "summary",
      "slug",
      "changeNote",
      "_status",
      "state",
      "firstPublishedAt",
    ].every((field) => optionalString(value[field])) &&
    (value.body === undefined ||
      value.body === null ||
      (isRecord(value.body) && isRecord(value.body.root))) &&
    (value.countries === undefined ||
      value.countries === null ||
      (Array.isArray(value.countries) &&
        value.countries.every((id) => typeof id === "string")))
  );
}

export function isCountryOption(value: unknown): value is CountryOption {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string"
  );
}

export function isTopicRow(value: unknown): value is TopicRow {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.updatedAt === "string" &&
    ["title", "state", "_status"].every((field) => optionalString(value[field]))
  );
}

/** The topic the answer to a save holds, or null when it holds none. */
export function savedTopic(answer: unknown): EditableTopic | null {
  return isRecord(answer) && isEditableTopic(answer.doc) ? answer.doc : null;
}
