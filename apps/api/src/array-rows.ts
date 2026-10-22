/**
 * The rows of an array field, or none: entries that are not objects (a
 * malformed request) are dropped. Typed arrays keep their row type. Not for
 * lists of related ids, such as a topic's countries at depth 0, which are
 * strings.
 */
export function rows<T extends object>(
  value: readonly T[] | null | undefined,
): T[];
export function rows(value: unknown): Record<string, unknown>[];
export function rows(value: unknown): object[] {
  return Array.isArray(value)
    ? value.filter(
        (row): row is object => Boolean(row) && typeof row === "object",
      )
    : [];
}
