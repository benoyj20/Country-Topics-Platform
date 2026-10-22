import {
  ADMIN_LIST_LIMITS,
  ADMIN_LIST_MAX_PAGE,
  ADMIN_LISTS,
  type AdminCollection,
  type AdminCondition,
  type AdminFilterKind,
} from "@countrytopics/contracts";
import { SEARCH_TEXT_MAX_LENGTH } from "@countrytopics/domain";

// A list's address and what it asks the backend for. The address uses
// Payload's panel's names (`search`, `sort`, `page`, `limit`), so its links
// keep working, plus one parameter per filter: the field's name, or
// `<field>.from` and `<field>.to` for dates. Anything it does not
// recognise is ignored, never passed on. The bare address, with nothing
// after the path, opens the list as the staff member last left it (ADR
// 0014, phase 11); links within a list never use it.

export type SearchParams = Record<string, string | string[] | undefined>;

export type FilterValue =
  | { field: string; kind: Exclude<AdminFilterKind, "dates">; value: string }
  | { field: string; kind: "dates"; from: string; to: string };

export type ListState = {
  search: string;
  sort: string;
  page: number;
  limit: number;
  /** The filters in use, with what was typed or chosen. */
  filters: FilterValue[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const YES_NO = ["yes", "no"];

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function isDay(value: string): boolean {
  if (!DAY.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/**
 * The fields a list can be sorted by: any it can show as a column, except
 * relations, as in Payload's panel.
 */
export function sortableFields(collection: AdminCollection): string[] {
  const { fields } = ADMIN_LISTS[collection];
  return Object.keys(fields).filter(
    (name) => fields[name]?.kind !== "relationship",
  );
}

function readSort(collection: AdminCollection, value: string): string {
  const { defaultSort } = ADMIN_LISTS[collection];
  if (value === defaultSort) return value;
  const field = value.startsWith("-") ? value.slice(1) : value;
  return sortableFields(collection).includes(field) ? value : defaultSort;
}

function readFilter(
  collection: AdminCollection,
  field: string,
  kind: AdminFilterKind,
  params: SearchParams,
): FilterValue | null {
  if (kind === "dates") {
    const from = first(params[`${field}.from`]);
    const to = first(params[`${field}.to`]);
    const valid = { from: isDay(from) ? from : "", to: isDay(to) ? to : "" };
    return valid.from || valid.to ? { field, kind, ...valid } : null;
  }
  const value = first(params[field]).slice(0, SEARCH_TEXT_MAX_LENGTH);
  if (!value) return null;
  const definition = ADMIN_LISTS[collection].fields[field];
  if (kind === "equals") {
    const allowed = definition?.kind === "select" ? definition.values : YES_NO;
    return allowed.includes(value) ? { field, kind, value } : null;
  }
  if (kind === "exists") {
    return YES_NO.includes(value) ? { field, kind, value } : null;
  }
  return { field, kind, value };
}

/** What a list's address asks for, with anything invalid left out. */
export function readListState(
  collection: AdminCollection,
  params: SearchParams,
): ListState {
  const list = ADMIN_LISTS[collection];
  const limit = Number(first(params.limit));
  const page = Number(first(params.page));
  return {
    search: first(params.search).slice(0, SEARCH_TEXT_MAX_LENGTH),
    sort: readSort(collection, first(params.sort)),
    limit: (ADMIN_LIST_LIMITS as readonly number[]).includes(limit)
      ? limit
      : list.defaultLimit,
    page:
      Number.isInteger(page) && page >= 1 && page <= ADMIN_LIST_MAX_PAGE
        ? page
        : 1,
    filters: Object.entries(list.filters).flatMap(([field, kind]) => {
      const filter = readFilter(collection, field, kind, params);
      return filter ? [filter] : [];
    }),
  };
}

/** The address of a list in `state`, page and all. */
export function listHref(
  collection: AdminCollection,
  state: ListState,
): string {
  const list = ADMIN_LISTS[collection];
  const params = new URLSearchParams();
  if (state.search) params.set("search", state.search);
  for (const filter of state.filters) {
    if (filter.kind === "dates") {
      if (filter.from) params.set(`${filter.field}.from`, filter.from);
      if (filter.to) params.set(`${filter.field}.to`, filter.to);
    } else {
      params.set(filter.field, filter.value);
    }
  }
  if (state.sort !== list.defaultSort) params.set("sort", state.sort);
  if (state.limit !== list.defaultLimit)
    params.set("limit", String(state.limit));
  if (state.page > 1) params.set("page", String(state.page));
  const query = params.toString();
  return `/admin/collections/${collection}${query ? `?${query}` : ""}`;
}

/**
 * A link to `state` from within its list: its address, but never the bare
 * one, which would open the list as last left instead.
 */
export function listLink(
  collection: AdminCollection,
  state: ListState,
): string {
  const href = listHref(collection, state);
  return href.includes("?") ? href : `${href}?page=1`;
}

/** What a list remembers of `state`: its address's query, without the page. */
export function listQuery(
  collection: AdminCollection,
  state: ListState,
): string {
  return new URL(
    listHref(collection, { ...state, page: 1 }),
    "http://admin",
  ).search.slice(1);
}

/** The sort after choosing `field`'s column: ascending, then descending. */
export function sortAfter(state: ListState, field: string): string {
  return state.sort === field ? `-${field}` : field;
}

/**
 * The filters as Payload's conditions. A "related" filter names a record
 * by id, or by title, in which case `related` holds the ids of the
 * records whose title matched.
 */
export function listConditions(
  collection: AdminCollection,
  state: ListState,
  related: ReadonlyMap<string, readonly string[]>,
): AdminCondition[] {
  const { fields } = ADMIN_LISTS[collection];
  return state.filters.map((filter): AdminCondition => {
    const { field } = filter;
    switch (filter.kind) {
      case "equals":
        return {
          field,
          equals:
            fields[field]?.kind === "boolean"
              ? filter.value === "yes"
              : filter.value,
        };
      case "contains":
        return { field, like: filter.value };
      case "related":
        return {
          field,
          in: isUuid(filter.value)
            ? [filter.value]
            : (related.get(field) ?? []),
        };
      case "exists":
        return { field, exists: filter.value === "yes" };
      case "dates":
        return {
          field,
          from: filter.from ? `${filter.from}T00:00:00.000Z` : undefined,
          to: filter.to ? `${filter.to}T23:59:59.999Z` : undefined,
        };
    }
  });
}
