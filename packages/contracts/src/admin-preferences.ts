import * as z from "zod";

import { ADMIN_LISTS, type AdminCollection } from "./admin-lists.ts";

// What the admin remembers per staff member (ADR 0014, phase 11): each
// list's columns, and its search, filters, sort, and page size as they
// left them, kept in Payload's `payload-preferences`, which only their own
// account reads or writes. The panel's own preferences use other keys.

export const PREFERENCES_PATH = "/api/payload-preferences";

/** The preference that holds one list's settings. */
export function listPreferenceKey(collection: AdminCollection): string {
  return `admin-list-${collection}`;
}

/** The longest list address kept: far more than its filters can make. */
export const LIST_QUERY_MAX_LENGTH = 2_000;

export type ListPreference = {
  /** The list's address after its path, without the page: `search=x&sort=title`. */
  query: string;
  /** The columns chosen, in the list's order; null for the list's own. */
  columns: string[] | null;
};

export const EMPTY_LIST_PREFERENCE: ListPreference = {
  query: "",
  columns: null,
};

const storedListPreference = z.object({
  query: z.string().max(LIST_QUERY_MAX_LENGTH).catch(""),
  columns: z.array(z.string()).nullish().catch(null),
});

/**
 * The columns `chosen` allows on `collection`'s list, in the list's order
 * of fields; null when none of them is a column it can show, or when they
 * are its own columns.
 */
export function listColumns(
  collection: AdminCollection,
  chosen: readonly string[] | null | undefined,
): string[] | null {
  if (!chosen) return null;
  const list = ADMIN_LISTS[collection];
  const wanted = new Set(chosen);
  const columns = Object.keys(list.fields).filter((field) => wanted.has(field));
  if (columns.length === 0) return null;
  const own = [...list.columns].sort().join(",");
  return [...columns].sort().join(",") === own ? null : columns;
}

/**
 * A stored preference as a list uses it: anything it cannot use (another
 * shape, columns the list no longer has) is left out, so a list always
 * opens.
 */
export function readListPreference(
  collection: AdminCollection,
  value: unknown,
): ListPreference {
  const parsed = storedListPreference.safeParse(value);
  if (!parsed.success) return EMPTY_LIST_PREFERENCE;
  return {
    query: parsed.data.query,
    columns: listColumns(collection, parsed.data.columns),
  };
}

/** Payload's answer to `GET /api/payload-preferences/<key>`: `value` is null when none is kept. */
export const preferenceAnswerSchema = z.looseObject({
  value: z.unknown().nullish(),
});
