import type { SnippetValues } from "@countrytopics/contracts";
import { formatTime } from "@countrytopics/domain";

import { textAt } from "../../field-text.ts";
import { recordName } from "../../record-name.ts";
import { SNIPPET_TEXTS, TIMEBASE_LABELS } from "./snippet-text.ts";

// A snippet's version, field by field, as plain text, for comparing two
// versions (registry/versions.ts).

/** A snippet version's fields, in the editor's order. */
export function snippetFields(values: SnippetValues): Record<string, string> {
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

/** A field's name, as the editor shows it. */
export const snippetFieldLabel = (key: string) =>
  textAt(SNIPPET_TEXTS, key)?.label ?? key;
