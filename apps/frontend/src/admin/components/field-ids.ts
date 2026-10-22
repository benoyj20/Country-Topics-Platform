/** The ids an input's aria-describedby lists: its description and its messages. */
export function describedBy(
  id: string,
  { description, invalid }: { description?: string; invalid?: boolean },
): string | undefined {
  const ids = [
    description ? `${id}-description` : null,
    invalid ? `${id}-error` : null,
  ].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}
