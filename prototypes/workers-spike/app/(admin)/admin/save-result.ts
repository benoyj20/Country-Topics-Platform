// Reading the answer to a save from Payload's REST API: a refusal's
// messages, placed beside the fields they name as Payload's panel places
// them, and whether the body came back as it was sent.

export type SaveErrors = {
  /** Messages for the fields the form shows, by Payload's field path. */
  fields: Record<string, string[]>;
  /** Everything else, with the field's label when there is one. */
  general: string[];
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * The errors in a refused save's answer: Payload's `{ errors: [...] }`, in
 * which a validation error lists `{ path, label, message }` per field.
 */
export function saveErrors(
  status: number,
  answer: unknown,
  shownFields: ReadonlySet<string>,
): SaveErrors {
  const result: SaveErrors = { fields: {}, general: [] };
  const errors =
    isRecord(answer) && Array.isArray(answer.errors) ? answer.errors : [];
  for (const error of errors) {
    if (!isRecord(error)) continue;
    const fieldErrors =
      isRecord(error.data) && Array.isArray(error.data.errors)
        ? error.data.errors
        : [];
    let placed = false;
    for (const field of fieldErrors) {
      if (
        !isRecord(field) ||
        typeof field.path !== "string" ||
        typeof field.message !== "string"
      ) {
        continue;
      }
      placed = true;
      if (shownFields.has(field.path)) {
        (result.fields[field.path] ??= []).push(field.message);
      } else {
        const label =
          typeof field.label === "string" ? field.label : field.path;
        result.general.push(`${label}: ${field.message}`);
      }
    }
    if (!placed && typeof error.message === "string") {
      result.general.push(error.message);
    }
  }
  if (result.general.length === 0 && Object.keys(result.fields).length === 0) {
    result.general.push(`The backend refused the save (${status}).`);
  }
  return result;
}

/** JSON with every object's keys sorted, as PostgreSQL's jsonb reorders them. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    isRecord(inner) && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.entries(inner).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : inner,
  );
}
