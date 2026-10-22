import {
  type Refusal,
  type TopicValues,
  topicSaveBody,
} from "@countrytopics/contracts";

// The topic form's state between saves: rows moved and removed, a
// refusal's messages cleared as the fields they name change, and whether
// anything is unsaved.

/** `rows` with the row at `from` moved to `to`. */
export function moveRow<T>(rows: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= rows.length || from === to) return [...rows];
  const moved = [...rows];
  const [row] = moved.splice(from, 1);
  if (row !== undefined) moved.splice(to, 0, row);
  return moved;
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

/**
 * What the form would save, besides the body, for telling whether
 * anything changed since the last save.
 */
export function savedForm(values: TopicValues): string {
  return JSON.stringify(topicSaveBody({ ...values, body: null }, false));
}

/**
 * The form's values once a save is answered. When nothing changed while it
 * ran, what the backend stored (`stored`); otherwise what was typed since,
 * with the ids the backend gave rows that were new, so that saving again
 * does not add them twice.
 */
export function valuesAfterAnswer(
  current: TopicValues,
  sent: TopicValues,
  stored: TopicValues,
): TopicValues {
  if (savedForm(current) === savedForm(sent)) return stored;
  const withIds = <T extends { id?: string }>(
    rows: T[],
    sentRows: T[],
    storedRows: T[],
  ): T[] =>
    rows.map((row, index) => {
      if (row.id) return row;
      // The same row as sent, or, with no rows added or removed since,
      // the row in its place.
      const at = sentRows.includes(row)
        ? sentRows.indexOf(row)
        : rows.length === sentRows.length
          ? index
          : -1;
      const id = at === -1 || sentRows[at]?.id ? undefined : storedRows[at]?.id;
      return id ? { ...row, id } : row;
    });
  return {
    ...current,
    people: withIds(current.people, sent.people, stored.people),
    evidence: withIds(current.evidence, sent.evidence, stored.evidence),
    references: withIds(current.references, sent.references, stored.references),
  };
}
