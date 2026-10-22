import * as z from "zod";

// Reading a refused write from Payload's REST API, for the admin's editors
// (ADR 0014, phase 8): each message beside the field it names, as
// Payload's panel shows it, and everything else above the form.

/** A refused write's messages. */
export type Refusal = {
  /** Messages for fields the form shows, by the form's field key. */
  fields: Record<string, string[]>;
  /** Everything else, with the field's label when there is one. */
  general: string[];
};

// Payload's `{ errors: [...] }`, in which a validation error lists
// `{ path, label, message }` per field, and the frontend's own
// `{ error, problems }` (ApiError) when the backend was not reached.
const FieldError = z.object({
  path: z.string(),
  label: z.string().nullish(),
  message: z.string(),
});
const PayloadErrors = z.object({
  errors: z.array(
    z.looseObject({
      message: z.string().nullish(),
      data: z.looseObject({ errors: z.array(z.unknown()).nullish() }).nullish(),
    }),
  ),
});
const FrontendError = z.object({ error: z.string() });

/**
 * Payload's answer to a save or delete of a document that someone else
 * has open (ADR 0014, phase 11: document locks).
 */
export const LOCKED_STATUS = 423;

/** Payload's message for each locked document in a bulk answer. */
const LOCKED_PAYLOAD_MESSAGE = /is currently locked by another user/;

export const LOCKED_MESSAGE =
  "Someone else is editing this, so it was not saved. Take over editing to save your changes.";

/** A message from Payload, with its lock refusal said plainly. */
export function payloadMessage(message: string): string {
  return LOCKED_PAYLOAD_MESSAGE.test(message) ? LOCKED_MESSAGE : message;
}

/**
 * The messages of a refused write. `fieldOf` names the form's field for a
 * path Payload's error gives, such as `people.0.individual`, or null when
 * the form does not show it; its messages are then listed above the form.
 */
export function payloadRefusal(
  status: number,
  answer: unknown,
  fieldOf: (path: string) => string | null,
): Refusal {
  const refusal: Refusal = { fields: {}, general: [] };
  if (status === LOCKED_STATUS) {
    refusal.general.push(LOCKED_MESSAGE);
    return refusal;
  }
  const payload = PayloadErrors.safeParse(answer);
  for (const error of payload.success ? payload.data.errors : []) {
    let placed = false;
    for (const item of error.data?.errors ?? []) {
      const field = FieldError.safeParse(item);
      if (!field.success) continue;
      placed = true;
      const { path, label, message } = field.data;
      const key = fieldOf(path);
      if (key) (refusal.fields[key] ??= []).push(message);
      else refusal.general.push(`${label || path}: ${message}`);
    }
    if (!placed && error.message) refusal.general.push(error.message);
  }
  const frontend = FrontendError.safeParse(answer);
  if (frontend.success) refusal.general.push(frontend.data.error);
  if (
    refusal.general.length === 0 &&
    Object.keys(refusal.fields).length === 0
  ) {
    refusal.general.push(`The backend refused the save (${status}).`);
  }
  return refusal;
}
