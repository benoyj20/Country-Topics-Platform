import type {
  ComparedField,
  SnippetValues,
  TopicValues,
} from "@countrytopics/contracts";

import {
  referenceFieldLabel,
  referenceFields,
  type ReferenceVersionValues,
} from "@/admin/features/references/versions";
import {
  snippetFieldLabel,
  snippetFields,
} from "@/admin/features/snippets/versions";
import { topicFieldLabel, topicFields } from "@/admin/features/topics/versions";

// Two versions of a record, field by field, as plain text (ADR 0014,
// phase 11): what a comparison shows side by side and marks the changes
// in. Each versioned feature turns its own versions into fields
// (features/*/versions.ts); this lists them, once each.

/** The two versions compared, of one collection. */
export type ComparedVersions =
  | { collection: "topics"; before: TopicValues; after: TopicValues }
  | {
      collection: "references";
      before: ReferenceVersionValues;
      after: ReferenceVersionValues;
    }
  | { collection: "snippets"; before: SnippetValues; after: SnippetValues };

/** The two versions' fields, in the editor's order, each as plain text. */
export function comparedFields(versions: ComparedVersions): ComparedField[] {
  let before: Record<string, string>;
  let after: Record<string, string>;
  let label: (key: string) => string;
  switch (versions.collection) {
    case "topics":
      before = topicFields(versions.before);
      after = topicFields(versions.after);
      label = topicFieldLabel;
      break;
    case "references":
      before = referenceFields(versions.before);
      after = referenceFields(versions.after);
      label = referenceFieldLabel;
      break;
    case "snippets":
      before = snippetFields(versions.before);
      after = snippetFields(versions.after);
      label = snippetFieldLabel;
      break;
  }
  return Object.keys(before).map((key) => ({
    key,
    label: label(key),
    before: before[key] ?? "",
    after: after[key] ?? "",
  }));
}
