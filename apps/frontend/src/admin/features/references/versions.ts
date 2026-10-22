import type { ReferenceValues } from "@countrytopics/contracts";
import {
  REFERENCE_CHECK_LABELS,
  REFERENCE_KIND_LABELS,
  type ReferenceCheckStatus,
} from "@countrytopics/domain";

import { textAt } from "../../field-text.ts";
import { REFERENCE_TEXTS } from "./reference-text.ts";

// A reference's version, field by field, as plain text, for comparing two
// versions (registry/versions.ts).

/** A reference's fields as a version keeps them, with its check. */
export type ReferenceVersionValues = ReferenceValues & {
  checkStatus: ReferenceCheckStatus;
};

/** A reference version's fields, in the editor's order. */
export function referenceFields(
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

/** A field's name, as the editor shows it; the check is not a field there. */
export const referenceFieldLabel = (key: string) =>
  textAt(REFERENCE_TEXTS, key)?.label ??
  (key === "checkStatus" ? "Check" : key);
