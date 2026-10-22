import * as z from "zod";

import { combine } from "./combine.ts";
import { LISTS as archives } from "./lists/archives.ts";
import { LISTS as audit } from "./lists/audit.ts";
import { LISTS as individuals } from "./lists/individuals.ts";
import { LISTS as media } from "./lists/media.ts";
import { LISTS as moderation } from "./lists/moderation.ts";
import { LISTS as people } from "./lists/people.ts";
import { LISTS as references } from "./lists/references.ts";
import { LISTS as snippets } from "./lists/snippets.ts";
import { LISTS as taxonomy } from "./lists/taxonomy.ts";
import { LISTS as topics } from "./lists/topics.ts";
import type { AdminField, AdminList } from "./lists/fields.ts";

export type { AdminField, AdminFilterKind, AdminList } from "./lists/fields.ts";

// The admin's lists (ADR 0014, phase 7), read from Payload's REST API: for
// each collection staff see in Payload's panel, the fields a list shows or
// filters by, as the backend stores them, and how a list is asked for. The
// frontend builds its requests from these, and the backend's tests check
// them against its collections, so a renamed field fails a test rather than
// a list. Each feature defines its own collections' lists in src/lists
// (ADR 0015); they are combined here, once each.

/** The 17 collections Payload's panel lists, in its order. */
export const ADMIN_COLLECTIONS = [
  "topics",
  "topic-changes",
  "references",
  "snippets",
  "videos",
  "media",
  "link-archives",
  "individuals",
  "countries",
  "categories",
  "tags",
  "comments",
  "comment-reports",
  "users",
  "invitations",
  "feedback",
  "audit-log",
] as const;
export type AdminCollection = (typeof ADMIN_COLLECTIONS)[number];

export function isAdminCollection(value: string): value is AdminCollection {
  return (ADMIN_COLLECTIONS as readonly string[]).includes(value);
}

export const ADMIN_LISTS: Record<AdminCollection, AdminList> = combine(
  "Admin lists",
  {
    topics,
    references,
    snippets,
    media,
    archives,
    individuals,
    taxonomy,
    moderation,
    people,
    audit,
  },
);

/** The page sizes a list offers, as Payload's panel does. */
export const ADMIN_LIST_LIMITS = [5, 10, 25, 50, 100] as const;

/** The furthest page a list goes to; beyond it, search or filter. */
export const ADMIN_LIST_MAX_PAGE = 1_000;

/** Related records a "related" filter matches by title, at most. */
export const ADMIN_RELATED_MATCHES_MAX = 100;

/** A condition on one field, as Payload's `where` takes it. */
export type AdminCondition =
  | { field: string; equals: string | boolean }
  | { field: string; in: readonly string[] }
  | { field: string; like: string }
  | { field: string; from?: string; to?: string }
  | { field: string; exists: boolean };

export type AdminListQuery = {
  search?: string;
  conditions: readonly AdminCondition[];
  /** Payload's sort string. */
  sort: string;
  page: number;
  limit: number;
};

type Where = Record<string, unknown>;

function conditionWhere(condition: AdminCondition): Where {
  const { field } = condition;
  if ("equals" in condition) return { [field]: { equals: condition.equals } };
  if ("in" in condition) return { [field]: { in: [...condition.in] } };
  if ("like" in condition) return { [field]: { like: condition.like } };
  if ("exists" in condition) return { [field]: { exists: condition.exists } };
  const range: Where = {};
  if (condition.from) range.greater_than_equal = condition.from;
  if (condition.to) range.less_than_equal = condition.to;
  return { [field]: range };
}

/** Payload's bracket notation: `where[and][0][title][like]=x`. */
export function appendBrackets(
  params: URLSearchParams,
  key: string,
  value: unknown,
): void {
  if (value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      appendBrackets(params, `${key}[${index}]`, item),
    );
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [name, item] of Object.entries(value)) {
      appendBrackets(params, `${key}[${name}]`, item);
    }
    return;
  }
  params.append(key, String(value));
}

/**
 * The records a list's search and filters match, as Payload's `where`:
 * what a bulk action over every match acts on.
 */
export function adminListWhere(
  collection: AdminCollection,
  query: Pick<AdminListQuery, "search" | "conditions">,
): { and: Where[] } {
  const list = ADMIN_LISTS[collection];
  const and: Where[] = [];
  const search = query.search?.trim();
  if (search) {
    and.push({
      or: list.search.map((field) => ({ [field]: { like: search } })),
    });
  }
  for (const condition of query.conditions) and.push(conditionWhere(condition));
  return { and };
}

/**
 * The query string of `GET /api/<collection>` for one page of a list:
 * only the list's fields, related records by their titles only, the
 * newest versions where the collection has drafts. `columns` are those
 * the staff member chose, when not the list's own.
 */
export function adminListSearchParams(
  collection: AdminCollection,
  query: AdminListQuery,
  columns: readonly string[] = ADMIN_LISTS[collection].columns,
): URLSearchParams {
  const list = ADMIN_LISTS[collection];
  const { and } = adminListWhere(collection, query);

  const params = new URLSearchParams();
  params.set("depth", "1");
  params.set("limit", String(query.limit));
  params.set("page", String(query.page));
  params.set("sort", query.sort);
  if (list.drafts) params.set("draft", "true");
  if (and.length > 0) appendBrackets(params, "where", { and });
  for (const field of new Set([
    list.title,
    ...columns,
    ...(list.extra ?? []),
  ])) {
    params.set(`select[${field}]`, "true");
  }
  for (const field of columns) {
    const definition = list.fields[field];
    if (definition?.kind === "relationship") {
      params.set(
        `populate[${definition.to}][${ADMIN_LISTS[definition.to].title}]`,
        "true",
      );
    }
  }
  return params;
}

/**
 * The query string that finds up to ADMIN_RELATED_MATCHES_MAX records of
 * `collection` whose title has `text`, for a "related" filter: the newest
 * titles, drafts included, as that collection's own list shows them.
 */
export function adminRelatedSearchParams(
  collection: AdminCollection,
  text: string,
): URLSearchParams {
  const { title, drafts } = ADMIN_LISTS[collection];
  const params = new URLSearchParams();
  params.set("depth", "0");
  params.set("limit", String(ADMIN_RELATED_MATCHES_MAX));
  if (drafts) params.set("draft", "true");
  params.set(`select[${title}]`, "true");
  appendBrackets(params, "where", { [title]: { like: text.trim() } });
  return params;
}

/** How many records a field's picker offers at a time. */
export const ADMIN_PICKER_MATCHES = 10;

/**
 * The query string of `GET /api/<collection>` for a field's picker: the
 * records whose searched fields have `text` (all of them when it is
 * empty), in the collection's own order, drafts included, with their
 * titles and the `extra` fields, among those `where` allows.
 */
export function adminPickerSearchParams(
  collection: AdminCollection,
  text: string,
  {
    extra = [],
    where,
  }: { extra?: readonly string[]; where?: Record<string, unknown> } = {},
): URLSearchParams {
  const list = ADMIN_LISTS[collection];
  const and: Where[] = where ? [where] : [];
  const search = text.trim();
  if (search) {
    and.push({
      or: list.search.map((field) => ({ [field]: { like: search } })),
    });
  }
  const params = new URLSearchParams();
  params.set("depth", "0");
  params.set("limit", String(ADMIN_PICKER_MATCHES));
  params.set("sort", list.defaultSort);
  if (list.drafts) params.set("draft", "true");
  for (const field of new Set([list.title, ...extra])) {
    params.set(`select[${field}]`, "true");
  }
  if (and.length > 0) appendBrackets(params, "where", { and });
  return params;
}

/** A related record as Payload sends it: its id, or the record when populated. */
export const Related = z.union([z.string(), z.looseObject({ id: z.string() })]);
export type RelatedValue = z.infer<typeof Related>;

/**
 * A related record as the admin shows it: its id, and its title, which is
 * null when only the id came (the reader may not see the record, or it was
 * removed), and empty when the record has none.
 */
export type RelatedRecord = { id: string; title: string | null };

function fieldSchema(field: AdminField): z.ZodType {
  switch (field.kind) {
    case "text":
      return z.string().nullish();
    case "number":
      return z.number().nullish();
    case "date":
      return z.string().nullish();
    case "boolean":
      return z.boolean().nullish();
    case "select":
      return z.enum(field.values as [string, ...string[]]).nullish();
    case "relationship":
      return field.hasMany ? z.array(Related).nullish() : Related.nullish();
  }
}

export type AdminRow = { id: string } & Record<string, unknown>;

/** One record of a list, with the fields it reads. */
export function adminRowSchema(
  collection: AdminCollection,
  columns: readonly string[] = ADMIN_LISTS[collection].columns,
): z.ZodType<AdminRow> {
  const list = ADMIN_LISTS[collection];
  const shape: Record<string, z.ZodType> = { id: z.string() };
  for (const field of new Set([list.title, ...columns])) {
    const definition = list.fields[field];
    if (definition) shape[field] = fieldSchema(definition);
  }
  for (const field of list.extra ?? []) shape[field] ??= z.string().nullish();
  return z.looseObject(shape) as unknown as z.ZodType<AdminRow>;
}

/** Payload's answer to a list request. */
export function adminPageSchema<T>(row: z.ZodType<T>) {
  return z.object({
    docs: z.array(row),
    totalDocs: z.number().int().nonnegative(),
    limit: z.number().int(),
    page: z.number().int().positive(),
    totalPages: z.number().int().nonnegative(),
    hasNextPage: z.boolean(),
    hasPrevPage: z.boolean(),
  });
}
export type AdminPage = z.infer<ReturnType<typeof adminPageSchema<AdminRow>>>;

/** A related record of `collection`, titled as its list titles it. */
export function recordOf(
  collection: AdminCollection,
  value: RelatedValue,
): RelatedRecord {
  if (typeof value === "string") return { id: value, title: null };
  const title = value[ADMIN_LISTS[collection].title];
  return { id: value.id, title: typeof title === "string" ? title : "" };
}

/** A related account, by its address; null when there is none. */
export function personOf(value: RelatedValue | null | undefined) {
  return value ? recordOf("users", value) : null;
}

/** recordOf for a value of any shape, or null when it is not a related record. */
export function relatedTitle(
  collection: AdminCollection,
  value: unknown,
): RelatedRecord | null {
  const parsed = Related.safeParse(value);
  return parsed.success ? recordOf(collection, parsed.data) : null;
}
