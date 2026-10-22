import {
  COMMENT_REPORT_REASONS,
  COMMENT_REPORT_STATUSES,
  COMMENT_STATUSES,
  FEEDBACK_KINDS,
  FEEDBACK_STATUSES,
  LICENCES,
  LINK_ARCHIVE_STATUSES,
  MEDIA_MIME_TYPES,
  REFERENCE_CHECK_STATUSES,
  REFERENCE_KINDS,
  ROLES,
  TOPIC_CHANGE_KINDS,
  TOPIC_STATES,
  VIDEO_CHECK_STATUSES,
} from "@countrytopics/domain";
import * as z from "zod";

// The admin's lists (ADR 0014, phase 7), read from Payload's REST API: for
// each collection staff see in Payload's panel, the fields a list shows or
// filters by, as the backend stores them, and how a list is asked for. The
// frontend builds its requests from these, and the backend's tests check
// them against its collections, so a renamed field fails a test rather than
// a list.

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

/** A field as a list reads it. Text covers Payload's text, textarea, and email. */
export type AdminField =
  | { kind: "text" }
  | { kind: "number" }
  | { kind: "date" }
  | { kind: "boolean" }
  | { kind: "select"; values: readonly string[] }
  | { kind: "relationship"; to: AdminCollection; hasMany?: boolean };

const text = { kind: "text" } as const;
const number = { kind: "number" } as const;
const date = { kind: "date" } as const;
const boolean = { kind: "boolean" } as const;
const select = (values: readonly string[]) =>
  ({ kind: "select", values }) as const;
const to = (collection: AdminCollection, hasMany = false) =>
  ({ kind: "relationship", to: collection, hasMany }) as const;

/** How a list may be filtered by one field. */
export type AdminFilterKind =
  /** One of a select's values, or yes or no. */
  | "equals"
  /** Text the field contains, words in any order. */
  | "contains"
  /** Records related to one record, by id, or to those whose title matches. */
  | "related"
  /** From and to dates, inclusive. */
  | "dates"
  /** Whether the field has a value. */
  | "exists";

export type AdminList = {
  /** The field Payload's panel titles records with (`useAsTitle`). */
  title: string;
  /** Every field a list shows or filters by. */
  fields: Record<string, AdminField>;
  /** The columns, in order; the first links to the record. */
  columns: readonly string[];
  /** Searched together, as the panel's search box does. */
  search: readonly string[];
  filters: Readonly<Record<string, AdminFilterKind>>;
  /** Payload's sort: fields, "-" for descending, comma-separated. */
  defaultSort: string;
  defaultLimit: number;
  /** Lists the newest version, a draft or not, as the panel does. */
  drafts: boolean;
  /** Who may read it: verified staff, or verified admins only. */
  readers: "staff" | "admins";
  /** Read as well, for the list's own use: a file's thumbnail. */
  extra?: readonly string[];
};

const DEFAULT_LIMIT = 10;

const created = { createdAt: date, updatedAt: date };

export const ADMIN_LISTS: Record<AdminCollection, AdminList> = {
  topics: {
    title: "title",
    fields: {
      title: text,
      summary: text,
      state: select(TOPIC_STATES),
      countries: to("countries", true),
      category: to("categories"),
      tags: to("tags", true),
      readyForReview: boolean,
      archived: boolean,
      ...created,
    },
    columns: ["title", "state", "countries", "updatedAt"],
    search: ["title", "summary"],
    filters: {
      state: "equals",
      countries: "related",
      category: "related",
      tags: "related",
      readyForReview: "equals",
      archived: "equals",
      updatedAt: "dates",
    },
    defaultSort: "-updatedAt",
    defaultLimit: DEFAULT_LIMIT,
    drafts: true,
    readers: "staff",
  },
  "topic-changes": {
    title: "note",
    fields: {
      topic: to("topics"),
      kind: select(TOPIC_CHANGE_KINDS),
      note: text,
      actor: to("users"),
      ...created,
    },
    columns: ["topic", "kind", "note", "createdAt"],
    search: ["note"],
    filters: {
      topic: "related",
      kind: "equals",
      actor: "related",
      createdAt: "dates",
    },
    defaultSort: "-createdAt",
    defaultLimit: DEFAULT_LIMIT,
    drafts: false,
    readers: "staff",
  },
  references: {
    title: "title",
    fields: {
      title: text,
      kind: select(REFERENCE_KINDS),
      checkStatus: select(REFERENCE_CHECK_STATUSES),
      authors: text,
      doi: text,
      isbn: text,
      ...created,
    },
    columns: ["title", "kind", "checkStatus", "updatedAt"],
    search: ["title", "authors", "doi", "isbn"],
    filters: { kind: "equals", checkStatus: "equals", updatedAt: "dates" },
    defaultSort: "-updatedAt",
    defaultLimit: DEFAULT_LIMIT,
    drafts: false,
    readers: "staff",
  },
  snippets: {
    title: "caption",
    fields: {
      caption: text,
      transcriptText: text,
      speaker: to("individuals"),
      video: to("videos"),
      language: text,
      ...created,
    },
    columns: ["caption", "speaker", "video", "updatedAt"],
    search: ["caption", "transcriptText"],
    filters: { speaker: "related", video: "related", language: "contains" },
    defaultSort: "-updatedAt",
    defaultLimit: DEFAULT_LIMIT,
    drafts: false,
    readers: "staff",
  },
  videos: {
    title: "title",
    fields: {
      title: text,
      channel: text,
      youtubeId: text,
      checkStatus: select(VIDEO_CHECK_STATUSES),
      durationS: number,
      checkedAt: date,
      ...created,
    },
    columns: ["title", "channel", "checkStatus", "durationS", "checkedAt"],
    search: ["title", "channel", "youtubeId"],
    filters: { checkStatus: "equals", checkedAt: "dates" },
    defaultSort: "-updatedAt",
    defaultLimit: DEFAULT_LIMIT,
    drafts: false,
    readers: "staff",
  },
  media: {
    title: "alt",
    fields: {
      filename: text,
      alt: text,
      licence: select(LICENCES),
      credit: text,
      mimeType: select(MEDIA_MIME_TYPES),
      ...created,
    },
    columns: ["filename", "alt", "licence", "updatedAt"],
    search: ["alt", "filename", "credit"],
    filters: { licence: "equals", mimeType: "equals", updatedAt: "dates" },
    defaultSort: "-createdAt",
    defaultLimit: DEFAULT_LIMIT,
    drafts: false,
    readers: "staff",
    extra: ["mimeType", "url"],
  },
  "link-archives": {
    title: "url",
    fields: {
      url: text,
      status: select(LINK_ARCHIVE_STATUSES),
      capturedAt: date,
      checkedAt: date,
      ...created,
    },
    columns: ["url", "status", "capturedAt", "checkedAt"],
    search: ["url"],
    filters: { status: "equals", checkedAt: "dates" },
    defaultSort: "-checkedAt",
    defaultLimit: DEFAULT_LIMIT,
    drafts: false,
    readers: "staff",
  },
  individuals: {
    title: "name",
    fields: {
      name: text,
      summary: text,
      wikidataId: text,
      ...created,
    },
    columns: ["name", "summary", "updatedAt"],
    search: ["name", "summary"],
    filters: { wikidataId: "exists", updatedAt: "dates" },
    defaultSort: "name",
    defaultLimit: DEFAULT_LIMIT,
    drafts: false,
    readers: "staff",
  },
  countries: {
    title: "name",
    fields: {
      name: text,
      code: text,
      isoName: text,
      region: text,
      subregion: text,
      ...created,
    },
    columns: ["name", "code", "region", "subregion"],
    search: ["name", "code", "isoName"],
    filters: { region: "contains", subregion: "contains" },
    defaultSort: "name",
    defaultLimit: 50,
    drafts: false,
    readers: "staff",
  },
  categories: {
    title: "name",
    fields: { name: text, slug: text, ...created },
    columns: ["name", "slug", "updatedAt"],
    search: ["name", "slug"],
    filters: {},
    defaultSort: "name",
    defaultLimit: DEFAULT_LIMIT,
    drafts: false,
    readers: "staff",
  },
  tags: {
    title: "name",
    fields: { name: text, slug: text, ...created },
    columns: ["name", "slug", "updatedAt"],
    search: ["name", "slug"],
    filters: {},
    defaultSort: "name",
    defaultLimit: DEFAULT_LIMIT,
    drafts: false,
    readers: "staff",
  },
  comments: {
    title: "body",
    fields: {
      body: text,
      topic: to("topics"),
      author: to("users"),
      status: select(COMMENT_STATUSES),
      locked: boolean,
      parent: to("comments"),
      ...created,
    },
    columns: ["body", "topic", "author", "status", "createdAt"],
    search: ["body"],
    filters: {
      status: "equals",
      topic: "related",
      author: "related",
      locked: "equals",
      parent: "exists",
      createdAt: "dates",
    },
    defaultSort: "-createdAt",
    defaultLimit: DEFAULT_LIMIT,
    drafts: false,
    readers: "staff",
  },
  "comment-reports": {
    title: "reason",
    fields: {
      comment: to("comments"),
      reason: select(COMMENT_REPORT_REASONS),
      note: text,
      status: select(COMMENT_REPORT_STATUSES),
      ...created,
    },
    columns: ["comment", "reason", "note", "status", "createdAt"],
    search: ["note"],
    filters: {
      status: "equals",
      reason: "equals",
      comment: "related",
      createdAt: "dates",
    },
    defaultSort: "status,-createdAt",
    defaultLimit: DEFAULT_LIMIT,
    drafts: false,
    readers: "staff",
  },
  users: {
    title: "email",
    fields: {
      email: text,
      name: text,
      displayName: text,
      role: select(ROLES),
      ...created,
    },
    columns: ["email", "name", "role", "createdAt"],
    search: ["email", "name", "displayName"],
    filters: { role: "equals", createdAt: "dates" },
    defaultSort: "-createdAt",
    defaultLimit: DEFAULT_LIMIT,
    drafts: false,
    // Everyone reads their own account; admins read all of them.
    readers: "staff",
  },
  invitations: {
    title: "email",
    fields: {
      email: text,
      role: select(ROLES),
      acceptedAt: date,
      ...created,
    },
    columns: ["email", "role", "acceptedAt", "createdAt"],
    search: ["email"],
    filters: { role: "equals", acceptedAt: "exists", createdAt: "dates" },
    defaultSort: "-createdAt",
    defaultLimit: DEFAULT_LIMIT,
    drafts: false,
    readers: "admins",
  },
  feedback: {
    title: "message",
    fields: {
      message: text,
      kind: select(FEEDBACK_KINDS),
      page: text,
      status: select(FEEDBACK_STATUSES),
      author: to("users"),
      ...created,
    },
    columns: ["message", "kind", "page", "status", "createdAt"],
    search: ["message", "page"],
    filters: {
      status: "equals",
      kind: "equals",
      author: "related",
      createdAt: "dates",
    },
    defaultSort: "status,-createdAt",
    defaultLimit: DEFAULT_LIMIT,
    drafts: false,
    readers: "staff",
  },
  "audit-log": {
    title: "action",
    fields: {
      action: text,
      actor: to("users"),
      targetCollection: text,
      targetId: text,
      ...created,
    },
    columns: ["action", "actor", "targetCollection", "targetId", "createdAt"],
    search: ["action", "targetCollection", "targetId"],
    filters: {
      actor: "related",
      targetCollection: "contains",
      createdAt: "dates",
    },
    defaultSort: "-createdAt",
    defaultLimit: DEFAULT_LIMIT,
    drafts: false,
    readers: "admins",
  },
};

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
