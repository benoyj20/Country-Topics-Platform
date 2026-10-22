import type { AdminCollection } from "../admin-lists.ts";

// What each feature's list definitions are made of (ADR 0015). A feature
// defines its own collections' lists in its file here; admin-lists.ts
// combines them.

/** A field as a list reads it. Text covers Payload's text, textarea, and email. */
export type AdminField =
  | { kind: "text" }
  | { kind: "number" }
  | { kind: "date" }
  | { kind: "boolean" }
  | { kind: "select"; values: readonly string[] }
  | { kind: "relationship"; to: AdminCollection; hasMany?: boolean };

export const text = { kind: "text" } as const;
export const number = { kind: "number" } as const;
export const date = { kind: "date" } as const;
export const boolean = { kind: "boolean" } as const;
export const select = (values: readonly string[]) =>
  ({ kind: "select", values }) as const;
export const to = (collection: AdminCollection, hasMany = false) =>
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

/** One feature's lists, by collection. */
export type AdminLists = Partial<Record<AdminCollection, AdminList>>;

export const DEFAULT_LIMIT = 10;

export const created = { createdAt: date, updatedAt: date };
