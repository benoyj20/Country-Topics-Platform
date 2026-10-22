import {
  REFERENCE_CHECK_STATUSES,
  REFERENCE_KINDS,
  type ReferenceCheckStatus,
  type ReferenceKind,
} from "@countrytopics/domain";
import * as z from "zod";

import {
  type FieldTree,
  fieldOfTree,
  optionalText,
  type RecordDates,
  recordDates,
  recordSearchParams,
  storedText,
} from "./admin-records.ts";

// The admin's reference editor (ADR 0014, phase 9): a paper, book, report,
// or web page that topics cite, found by its DOI, ISBN, or link. "Look up"
// fills empty fields from the registry that holds the DOI or ISBN; whether
// a reference is confirmed is decided by the worker's check after each
// save, shown beside the form.

export type ReferenceValues = {
  doi: string;
  isbn: string;
  url: string;
  kind: ReferenceKind;
  publishedDate: string;
  title: string;
  authors: string;
  containerTitle: string;
  publisher: string;
};

/** Set by the backend and the worker only. */
export type ReferenceStatus = RecordDates & {
  checkStatus: ReferenceCheckStatus;
  checkMessage: string | null;
  checkedAt: string | null;
};

export type EditorReference = {
  id: string;
  values: ReferenceValues;
  status: ReferenceStatus;
};

export const EMPTY_REFERENCE: ReferenceValues = {
  doi: "",
  isbn: "",
  url: "",
  kind: "article",
  publishedDate: "",
  title: "",
  authors: "",
  containerTitle: "",
  publisher: "",
};

/** The query string of `GET /api/references/<id>`, and of a save. */
export function referenceSearchParams(): URLSearchParams {
  return recordSearchParams(
    [
      // The empty form has every field the editor shows.
      ...(Object.keys(EMPTY_REFERENCE) as (keyof ReferenceValues)[]),
      "checkStatus",
      "checkMessage",
      "checkedAt",
      "createdAt",
      "updatedAt",
    ],
    { depth: 0 },
  );
}

export const storedReferenceSchema = z.looseObject({
  id: z.string(),
  doi: storedText,
  isbn: storedText,
  url: storedText,
  kind: z.enum(REFERENCE_KINDS).nullish(),
  publishedDate: storedText,
  title: storedText,
  authors: storedText,
  containerTitle: storedText,
  publisher: storedText,
  checkStatus: z.enum(REFERENCE_CHECK_STATUSES),
  checkMessage: storedText,
  checkedAt: storedText,
  ...recordDates,
});
export type StoredReference = z.infer<typeof storedReferenceSchema>;

export function editorReference(stored: StoredReference): EditorReference {
  return {
    id: stored.id,
    values: {
      doi: stored.doi ?? "",
      isbn: stored.isbn ?? "",
      url: stored.url ?? "",
      kind: stored.kind ?? "article",
      publishedDate: stored.publishedDate ?? "",
      title: stored.title ?? "",
      authors: stored.authors ?? "",
      containerTitle: stored.containerTitle ?? "",
      publisher: stored.publisher ?? "",
    },
    status: {
      checkStatus: stored.checkStatus,
      checkMessage: stored.checkMessage ?? null,
      checkedAt: stored.checkedAt ?? null,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
    },
  };
}

/**
 * The JSON body of a save: `POST /api/references` for a new one, `PATCH
 * /api/references/<id>` for one that exists. The backend normalises the
 * DOI and ISBN, and checks the reference again when they or the link change.
 */
export function referenceSaveBody(
  values: ReferenceValues,
): Record<string, unknown> {
  return {
    doi: optionalText(values.doi),
    isbn: optionalText(values.isbn),
    url: optionalText(values.url),
    kind: values.kind,
    publishedDate: optionalText(values.publishedDate),
    title: values.title,
    authors: optionalText(values.authors),
    containerTitle: optionalText(values.containerTitle),
    publisher: optionalText(values.publisher),
  };
}

const REFERENCE_FIELDS: FieldTree = Object.fromEntries(
  Object.keys(EMPTY_REFERENCE).map((field) => [field, true]),
);

export function referenceFieldOf(path: string): string | null {
  return fieldOfTree(REFERENCE_FIELDS, path);
}

/**
 * The query string of `GET /api/references/lookup`: the DOI when there is
 * one, else the ISBN; null when the form has neither.
 */
export function referenceLookupSearchParams(
  values: Pick<ReferenceValues, "doi" | "isbn">,
): URLSearchParams | null {
  const doi = values.doi.trim();
  const isbn = values.isbn.trim();
  if (doi) return new URLSearchParams({ doi });
  if (isbn) return new URLSearchParams({ isbn });
  return null;
}

export const referenceLookupSchema = z.union([
  z.object({
    found: z.literal(true),
    doi: z.string().nullable(),
    isbn: z.string().nullable(),
    metadata: z.object({
      source: z.string(),
      kind: z.enum(REFERENCE_KINDS).optional(),
      title: z.string().optional(),
      authors: z.array(z.string()),
      containerTitle: z.string().optional(),
      publisher: z.string().optional(),
      publishedDate: z.string().optional(),
    }),
  }),
  z.object({
    found: z.literal(false),
    doi: z.string().nullable(),
    isbn: z.string().nullable(),
  }),
  z.object({ error: z.string() }),
]);
export type ReferenceLookup = z.infer<typeof referenceLookupSchema>;

/** The fields "Look up" may fill, in the form's order. */
const LOOKED_UP = [
  "title",
  "authors",
  "containerTitle",
  "publisher",
  "publishedDate",
] as const;

/**
 * The form after a lookup found a record: the identifier as the backend
 * will save it, and the empty fields filled from the record. Nothing the
 * admin typed is replaced; the kind is set only while there is no title.
 */
export function referenceAfterLookup(
  values: ReferenceValues,
  found: Extract<ReferenceLookup, { found: true }>,
): { values: ReferenceValues; filled: (keyof ReferenceValues)[] } {
  const { metadata } = found;
  const next = { ...values };
  if (values.doi.trim() && found.doi) next.doi = found.doi;
  else if (values.isbn.trim() && found.isbn) next.isbn = found.isbn;
  const record: Record<(typeof LOOKED_UP)[number], string | undefined> = {
    title: metadata.title,
    authors: metadata.authors.join("\n") || undefined,
    containerTitle: metadata.containerTitle,
    publisher: metadata.publisher,
    publishedDate: metadata.publishedDate,
  };
  const filled: (keyof ReferenceValues)[] = [];
  for (const field of LOOKED_UP) {
    const value = record[field];
    if (value && !values[field].trim()) {
      next[field] = value;
      filled.push(field);
    }
  }
  if (metadata.kind && !values.title.trim()) next.kind = metadata.kind;
  return { values: next, filled };
}
