import * as z from "zod";

import {
  adminPageSchema,
  ADMIN_LISTS,
  appendBrackets,
  Related,
} from "./admin-lists.ts";
import { recordSearchParams } from "./admin-records.ts";
import { storedReferenceSchema } from "./admin-references.ts";
import { storedSnippetSchema } from "./admin-snippets.ts";

// The versions Payload keeps of references and snippets (ADR 0014, phase
// 11), as its panel lists, compares, and restores them: every save is
// kept, and restoring one saves it as the record again. Topics keep
// versions with drafts and change notes (admin-topics.ts); a topic's
// version is restored as a draft, then published.

export const VERSIONED_COLLECTIONS = [
  "topics",
  "references",
  "snippets",
] as const;
export type VersionedCollection = (typeof VERSIONED_COLLECTIONS)[number];

export function isVersioned(value: string): value is VersionedCollection {
  return (VERSIONED_COLLECTIONS as readonly string[]).includes(value);
}

/** How many versions a page of a record's history lists. */
export const VERSIONS_PER_PAGE = 20;

/** How many versions a comparison offers to compare with. */
export const COMPARED_VERSIONS_MAX = 50;

/**
 * The query string of `GET /api/<collection>/versions` for a page of a
 * record's history, newest first, with each version's title.
 */
export function versionsSearchParams(
  collection: VersionedCollection,
  parent: string,
  page: number,
  { limit = VERSIONS_PER_PAGE }: { limit?: number } = {},
): URLSearchParams {
  const params = new URLSearchParams({
    "where[parent][equals]": parent,
    sort: "-updatedAt",
    depth: "0",
    limit: String(limit),
    page: String(page),
    "select[createdAt]": "true",
    "select[updatedAt]": "true",
    "select[latest]": "true",
    [`select[version][${ADMIN_LISTS[collection].title}]`]: "true",
  });
  if (collection === "topics") params.set("select[version][_status]", "true");
  return params;
}

/** The query string that finds the version saved just before `before`. */
export function previousVersionSearchParams(
  parent: string,
  before: string,
): URLSearchParams {
  const params = new URLSearchParams({
    sort: "-updatedAt",
    depth: "0",
    limit: "1",
    "select[updatedAt]": "true",
  });
  appendBrackets(params, "where", {
    and: [{ parent: { equals: parent } }, { updatedAt: { less_than: before } }],
  });
  return params;
}

export function versionRowSchema(collection: VersionedCollection) {
  return z.looseObject({
    id: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    latest: z.boolean().nullish(),
    version: z.looseObject({
      [ADMIN_LISTS[collection].title]: z.string().nullish(),
      _status: z.enum(["draft", "published"]).nullish(),
    }),
  });
}
export type VersionRow = z.infer<ReturnType<typeof versionRowSchema>>;

export function versionsPageSchema(collection: VersionedCollection) {
  return adminPageSchema(versionRowSchema(collection));
}

/** The query string of `GET /api/<collection>/versions/<id>`, for one version whole. */
export function versionSearchParams(): URLSearchParams {
  return recordSearchParams([]);
}

const versionDates = {
  createdAt: z.string().nullish(),
  updatedAt: z.string().nullish(),
};

const versionFields = {
  id: z.string(),
  parent: Related,
  createdAt: z.string(),
  updatedAt: z.string(),
};
const recordFields = { id: true, createdAt: true, updatedAt: true } as const;

export const referenceVersionSchema = z.looseObject({
  ...versionFields,
  version: storedReferenceSchema.omit(recordFields).extend(versionDates),
});

export const snippetVersionSchema = z.looseObject({
  ...versionFields,
  version: storedSnippetSchema.omit(recordFields).extend(versionDates),
});

/** The record a version belongs to, by its id. */
export function versionParent(version: {
  parent: z.infer<typeof Related>;
}): string {
  return typeof version.parent === "string"
    ? version.parent
    : version.parent.id;
}

/**
 * The query string of `POST /api/<collection>/versions/<id>`, which
 * restores a version: as the topic's newest draft, or as the record itself.
 * Not narrowed with `select`, which the hooks after it would be given.
 */
export function restoreSearchParams(
  collection: VersionedCollection,
): URLSearchParams {
  const params = new URLSearchParams({ depth: "0" });
  if (collection === "topics") params.set("draft", "true");
  return params;
}

/** One field of two versions, as a comparison shows it: plain text each. */
export type ComparedField = {
  key: string;
  label: string;
  before: string;
  after: string;
};
