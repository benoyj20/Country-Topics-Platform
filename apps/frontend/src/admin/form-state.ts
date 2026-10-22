import type { Refusal } from "@countrytopics/contracts";

// An editor's form between saves: rows moved and removed, a refusal's
// messages cleared as the fields they name change, and the values kept
// when a save is answered while the form was being changed.

/** `rows` with the row at `from` moved to `to`. */
export function moveRow<T>(rows: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= rows.length || from === to) return [...rows];
  const moved = [...rows];
  const [row] = moved.splice(from, 1);
  if (row !== undefined) moved.splice(to, 0, row);
  return moved;
}

/** `rows` with `patch` applied to the row at `index`. */
export function patchRow<T>(
  rows: readonly T[],
  index: number,
  patch: Partial<T>,
): T[] {
  return rows.map((row, at) => (at === index ? { ...row, ...patch } : row));
}

/**
 * The refusal without the messages for `key`; with `rows`, as when an
 * array's rows are moved or removed, without its rows' messages too:
 * their numbers no longer point at the same rows.
 */
export function clearMessages(
  refusal: Refusal,
  key: string,
  { rows = false }: { rows?: boolean } = {},
): Refusal {
  const fields = Object.fromEntries(
    Object.entries(refusal.fields).filter(
      ([field]) => field !== key && !(rows && field.startsWith(`${key}.`)),
    ),
  );
  return { ...refusal, fields };
}

/** Each message of a refusal for the fields, in the form's order. */
export function fieldMessages(
  refusal: Refusal,
  order: readonly string[],
): [string, string][] {
  const position = (key: string) => {
    const index = order.indexOf(key.split(".")[0] ?? key);
    return index === -1 ? order.length : index;
  };
  return Object.entries(refusal.fields)
    .sort(
      ([a], [b]) =>
        position(a) - position(b) ||
        a.localeCompare(b, undefined, { numeric: true }),
    )
    .flatMap(([key, messages]) =>
      messages.map((message): [string, string] => [key, message]),
    );
}

type Fields = Record<string, unknown>;

const isFields = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * `current` with the ids the backend gave rows that were new when `sent`
 * was saved, in every array, however deep, so that saving again keeps
 * them. A saved row is matched by its id; a new one to the one sent as
 * itself or, with no rows added or removed since, to the new one sent in
 * its place.
 */
export function withRowIds<T>(current: T, sent: T, stored: T): T {
  if (Array.isArray(current) && Array.isArray(sent) && Array.isArray(stored)) {
    const rows: unknown[] = current.map((row: unknown, index) => {
      if (!isFields(row)) return row;
      const at = row.id
        ? sent.findIndex(
            (other: unknown) => isFields(other) && other.id === row.id,
          )
        : sent.includes(row)
          ? sent.indexOf(row)
          : current.length === sent.length
            ? index
            : -1;
      const sentRow: unknown = at === -1 ? undefined : sent[at];
      const storedRow: unknown = at === -1 ? undefined : stored[at];
      if (!isFields(sentRow) || !isFields(storedRow)) return row;
      // A new row is never matched to one that was already saved.
      if (!row.id && sentRow.id) return row;
      const nested = withRowIds(row, sentRow, storedRow);
      return row.id || !storedRow.id ? nested : { ...nested, id: storedRow.id };
    });
    // The same rows as `current`, so the same type.
    return rows as T;
  }
  if (isFields(current) && isFields(sent) && isFields(stored)) {
    const kept: Fields = { ...current };
    for (const [key, value] of Object.entries(current)) {
      if (Array.isArray(value)) {
        kept[key] = withRowIds(value, sent[key], stored[key]);
      }
    }
    // `current` with some of its arrays' rows given ids: the same type.
    return kept as T;
  }
  return current;
}

/**
 * The form's values once a save is answered: what the backend stored when
 * nothing changed while it ran (as `saved` tells); otherwise what was typed
 * since, with the new rows' ids.
 */
export function valuesAfterAnswer<T>(
  current: T,
  sent: T,
  stored: T,
  saved: (values: T) => string,
): T {
  if (saved(current) === saved(sent)) return stored;
  return withRowIds(current, sent, stored);
}
