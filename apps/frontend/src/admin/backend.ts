import "server-only";

import {
  ADMIN_LISTS,
  ADMIN_RELATED_MATCHES_MAX,
  type AdminCollection,
  adminListSearchParams,
  adminListWhere,
  type AdminPage,
  adminPageSchema,
  adminRelatedSearchParams,
  adminRowSchema,
  EMPTY_LIST_PREFERENCE,
  type ListPreference,
  listLocksSearchParams,
  listPreferenceKey,
  lockedDocument,
  lockHolder,
  lockIsFresh,
  LOCKS_PATH,
  locksPageSchema,
  preferenceAnswerSchema,
  PREFERENCES_PATH,
  readListPreference,
  relatedTitle,
} from "@countrytopics/contracts";
import * as z from "zod";

import { BackendError, readBackend, readBackendAt } from "@/backend/request";
import { visitorRead } from "@/backend/visitor";

import { isUuid, listConditions, type ListState } from "./list-state";

// The admin's reads from Payload's REST API, as the staff member: their
// cookie and address go with each, so the backend's access rules decide
// what they see, as they do for Payload's panel.

/** GETs `path` from the backend as the staff member; null when it answers 404. */
export async function readAsStaff<T>(
  path: string,
  schema: z.ZodType<T>,
): Promise<T | null> {
  return readBackend(path, schema, await visitorRead());
}

const Ids = z.object({ docs: z.array(z.object({ id: z.string() })) });

/** A "related" filter typed as text: the records whose title matched. */
export type RelatedMatch = {
  field: string;
  /** As many as ADMIN_RELATED_MATCHES_MAX; the list may then miss some. */
  ids: string[];
};

async function relatedMatches(
  collection: AdminCollection,
  state: ListState,
): Promise<RelatedMatch[]> {
  const { fields } = ADMIN_LISTS[collection];
  const typed = state.filters.filter(
    (filter) => filter.kind === "related" && !isUuid(filter.value),
  );
  return Promise.all(
    typed.map(async (filter) => {
      const definition = fields[filter.field];
      if (definition?.kind !== "relationship" || filter.kind === "dates") {
        return { field: filter.field, ids: [] };
      }
      const path = `/api/${definition.to}?${adminRelatedSearchParams(definition.to, filter.value)}`;
      const answer = await readAsStaff(path, Ids);
      return {
        field: filter.field,
        ids: (answer?.docs ?? []).map((doc) => doc.id),
      };
    }),
  );
}

export type ListAnswer = {
  page: AdminPage;
  /** Related filters whose title matched so many records some may be left out. */
  capped: string[];
  /**
   * The records the search and filters match, as Payload's `where`, for a
   * bulk action over all of them; null when a related filter was capped,
   * so the list may not show them all.
   */
  where: Record<string, unknown> | null;
};

function emptyPage(state: ListState): AdminPage {
  return {
    docs: [],
    totalDocs: 0,
    limit: state.limit,
    page: 1,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false,
  };
}

/**
 * One page of a list as `state` asks for it, with `columns`: the staff
 * member's choice, or the list's own.
 */
export async function readList(
  collection: AdminCollection,
  state: ListState,
  columns: readonly string[] = ADMIN_LISTS[collection].columns,
): Promise<ListAnswer> {
  const matches = await relatedMatches(collection, state);
  const capped = matches
    .filter((match) => match.ids.length >= ADMIN_RELATED_MATCHES_MAX)
    .map((match) => match.field);
  // A title that matched nothing leaves nothing to list.
  if (matches.some((match) => match.ids.length === 0)) {
    return { page: emptyPage(state), capped, where: null };
  }
  const query = {
    search: state.search,
    conditions: listConditions(
      collection,
      state,
      new Map(matches.map((match) => [match.field, match.ids])),
    ),
    sort: state.sort,
    page: state.page,
    limit: state.limit,
  };
  const path = `/api/${collection}?${adminListSearchParams(collection, query, columns)}`;
  const page = await readAsStaff(
    path,
    adminPageSchema(adminRowSchema(collection, columns)),
  );
  if (!page) throw new BackendError(path, 404);
  return {
    page,
    capped,
    where: capped.length > 0 ? null : adminListWhere(collection, query),
  };
}

/**
 * What the staff member remembers of a list: its columns, and how they
 * last left it. A list still opens, as its own, when the preference
 * cannot be read.
 */
export async function readListSettings(
  collection: AdminCollection,
): Promise<ListPreference> {
  const path = `${PREFERENCES_PATH}/${listPreferenceKey(collection)}`;
  try {
    const answer = await readAsStaff(path, preferenceAnswerSchema);
    return readListPreference(collection, answer?.value);
  } catch (error) {
    console.error(
      `Reading ${path} failed:`,
      error instanceof Error ? error.message : error,
    );
    return EMPTY_LIST_PREFERENCE;
  }
}

/**
 * Who else is editing each of a list's records (document locks), by the
 * record's id: their address when the reader may see it. Judged by the
 * backend's clock, which stamped the locks; the reader's own are left out.
 * None when the locks cannot be read.
 */
export async function readListLocks(
  collection: AdminCollection,
  ids: readonly string[],
  reader: string,
): Promise<Record<string, string | null>> {
  if (ids.length === 0) return {};
  const path = `${LOCKS_PATH}?${listLocksSearchParams(collection, ids)}`;
  let read;
  try {
    read = await readBackendAt(path, locksPageSchema, await visitorRead());
  } catch (error) {
    // The list still opens, without saying who is editing what; each
    // editor checks its record's lock as it opens.
    console.error(
      `Reading ${LOCKS_PATH} failed:`,
      error instanceof Error ? error.message : error,
    );
    return {};
  }
  const { answer, now } = read;
  const editing: Record<string, string | null> = {};
  for (const lock of answer?.docs ?? []) {
    const document = lockedDocument(lock);
    const holder = lockHolder(lock);
    if (!document || !holder || holder.id === reader) continue;
    if (now && !lockIsFresh(lock, now)) continue;
    // The newest lock on each record, as Payload judges them.
    if (!(document in editing)) editing[document] = holder.email;
  }
  return editing;
}

/** One record's title, or null when there is no such record. */
export async function readRecordTitle(
  collection: AdminCollection,
  id: string,
): Promise<{ id: string; title: string | null } | null> {
  if (!isUuid(id)) return null;
  const { title, drafts } = ADMIN_LISTS[collection];
  const params = new URLSearchParams({
    depth: "0",
    [`select[${title}]`]: "true",
  });
  if (drafts) params.set("draft", "true");
  const record = await readAsStaff(
    `/api/${collection}/${id}?${params}`,
    z.looseObject({ id: z.string() }),
  );
  return record ? relatedTitle(collection, record) : null;
}
