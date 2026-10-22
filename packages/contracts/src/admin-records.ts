import * as z from "zod";

// What the admin's record editors share (ADR 0014, phases 8 and 9): rows
// of array fields, optional text, how a record is read with what its form
// shows of related records, and which of the form's fields a refusal's
// path names.

/** A row of an array field; `id` is Payload's, absent until first saved. */
export type Row = { id?: string };

/** A stored row's id, for a row the form keeps. */
export const rowId = (id: string | null | undefined) => (id ? { id } : {});

/** Empty optional text is saved as no value, as Payload stores a field never filled. */
export const optionalText = (value: string) => (value.trim() ? value : null);

export const storedText = z.string().nullish();

/** Payload's message for a required field left empty. */
export const REQUIRED_MESSAGE = "This field is required.";

/** Where Payload serves a stored file's content. */
const MEDIA_FILE_PATH = "/api/media/file/";

/**
 * A stored file's address on this site. Payload names a file by its
 * address under its serverURL, which locally is the backend's own; the
 * admin opens it through this site's /api, with the staff member's cookie.
 * Null for any other address.
 */
export function mediaFilePath(url: string | null | undefined): string | null {
  if (!url) return null;
  const base = "http://site.invalid";
  if (!URL.canParse(url, base)) return null;
  const { pathname, search } = new URL(url, base);
  return pathname.startsWith(MEDIA_FILE_PATH) ? `${pathname}${search}` : null;
}

/** When a record was made and last changed, shown beside its form. */
export type RecordDates = { createdAt: string; updatedAt: string };

export const recordDates = {
  createdAt: z.string(),
  updatedAt: z.string(),
};

/** What a related record shows in a form, by collection. */
export const RELATED_FIELDS = {
  countries: ["name"],
  categories: ["name"],
  tags: ["name"],
  individuals: ["name"],
  media: ["alt", "filename", "mimeType", "url"],
  snippets: ["caption"],
  references: ["title", "checkStatus"],
  users: ["email"],
  videos: ["title", "youtubeId"],
} as const satisfies Record<string, readonly string[]>;

/**
 * The query string that reads a record for its form, and that a save is
 * answered with: only `fields`, with related records at depth 1 by what
 * the form shows of them (RELATED_FIELDS).
 */
export function recordSearchParams(
  fields: readonly string[],
  { depth = 1 }: { depth?: number } = {},
): URLSearchParams {
  const params = new URLSearchParams({ depth: String(depth) });
  for (const field of fields) params.set(`select[${field}]`, "true");
  if (depth > 0) {
    for (const [collection, shown] of Object.entries(RELATED_FIELDS)) {
      for (const field of shown) {
        params.set(`populate[${collection}][${field}]`, "true");
      }
    }
  }
  return params;
}

/** The answer to a save that was not refused: the record as `schema` reads it. */
export function savedRecordSchema<T>(schema: z.ZodType<T>) {
  return z.looseObject({ doc: schema });
}

/**
 * The collections whose records the admin duplicates (ADR 0014, phase 11),
 * as Payload's panel does: those made in the admin, except files and
 * invitations, whose copy would be the same file or the same address, and
 * individuals, whose copy would be the same person (the backend's check
 * for possible duplicates refuses it).
 * The backend gives a copy its own slug, and a topic's copy is a fresh
 * draft (apps/web's Topics).
 */
export const DUPLICATED_COLLECTIONS = [
  "topics",
  "references",
  "snippets",
  "categories",
  "tags",
] as const;
export type DuplicatedCollection = (typeof DUPLICATED_COLLECTIONS)[number];

export function isDuplicated(value: string): value is DuplicatedCollection {
  return (DUPLICATED_COLLECTIONS as readonly string[]).includes(value);
}

/**
 * The query string of `POST /api/<collection>/<id>/duplicate`, answered
 * at depth 0. Not narrowed with `select`: the hooks after the copy is made,
 * such as its audit entry, are given the record as the request selects it.
 */
export function duplicateSearchParams(): URLSearchParams {
  return new URLSearchParams({ depth: "0" });
}

export const duplicateAnswerSchema = savedRecordSchema(
  z.looseObject({ id: z.string() }),
);

/**
 * A form's fields, for naming the one a refusal's path points at: each
 * field is true or, for an array, the fields of its rows.
 */
export type FieldTree = { readonly [field: string]: true | FieldTree };

/**
 * The form's field for a path a refusal names, such as `name`,
 * `aliases.0.name`, or `statements.1.evidence.0.url`; the array's own path
 * for a message about the whole array or one of its rows; null for any
 * other path, whose message is listed above the form.
 */
export function fieldOfTree(tree: FieldTree, path: string): string | null {
  const parts = path.split(".");
  const shown: string[] = [];
  let node: true | FieldTree = tree;
  for (let at = 0; at < parts.length; at++) {
    const part = parts[at];
    if (node === true || part === undefined) return null;
    const next: true | FieldTree | undefined = node[part];
    if (next === undefined) return null;
    shown.push(part);
    node = next;
    if (node === true) continue;
    const index = parts[at + 1];
    // The array itself, or one of its rows.
    if (index === undefined || at + 1 === parts.length - 1) {
      return index === undefined || /^\d+$/.test(index)
        ? shown.join(".")
        : null;
    }
    if (!/^\d+$/.test(index)) return null;
    shown.push(index);
    at++;
  }
  return node === true ? shown.join(".") : null;
}
