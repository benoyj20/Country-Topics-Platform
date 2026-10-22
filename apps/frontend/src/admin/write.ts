import {
  duplicateAnswerSchema,
  type DuplicatedCollection,
  duplicateSearchParams,
  payloadRefusal,
  type Refusal,
  savedRecordSchema,
} from "@countrytopics/contracts";
import type * as z from "zod";

// The editors' writes, from the browser through this site's /api to
// Payload's REST API, with the staff member's cookie. The backend's hooks
// and access rules decide what may be saved; a refusal comes back with
// its messages, each on the form's field when the form shows it.

export type Written<T> =
  { ok: true; result: T } | { ok: false; refusal: Refusal };

export type FieldOf = (path: string) => string | null;

const UNREACHABLE: Refusal = {
  fields: {},
  general: [
    "The backend could not be reached, so this may not have been saved. Reload the page to see what was.",
  ],
};

/** Sends a write: JSON, or a form when it carries a file. */
async function send(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<{ status: number; answer: unknown } | null> {
  const form = body instanceof FormData;
  try {
    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      // A form's type, with its boundary, is set by the browser.
      headers:
        body === undefined || form
          ? {}
          : { "content-type": "application/json" },
      body: body === undefined ? undefined : form ? body : JSON.stringify(body),
    });
    return {
      status: response.status,
      answer: await response.json().catch(() => null),
    };
  } catch {
    return null;
  }
}

/**
 * Sends a write: its answer, or the refusal with its messages on the
 * fields `fieldOf` names.
 */
export async function write(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body: unknown,
  fieldOf: FieldOf,
): Promise<Written<unknown>> {
  const sent = await send(method, path, body);
  if (!sent) return { ok: false, refusal: UNREACHABLE };
  if (sent.status < 200 || sent.status > 299) {
    return {
      ok: false,
      refusal: payloadRefusal(sent.status, sent.answer, fieldOf),
    };
  }
  return { ok: true, result: sent.answer };
}

/** A write's answer, read by `schema`. */
export function answerOf<T>(
  written: Written<unknown>,
  schema: z.ZodType<T>,
): Written<T> {
  if (!written.ok) return written;
  const parsed = schema.safeParse(written.result);
  if (parsed.success) return { ok: true, result: parsed.data };
  return {
    ok: false,
    refusal: {
      fields: {},
      general: [
        "The backend saved this but did not send it back. Reload the page before saving again.",
      ],
    },
  };
}

/** A save's request: its JSON body, or a form when it carries a file. */
export type SaveRequest<T> = {
  collection: string;
  /** Null for a new record. */
  id: string | null;
  /** What the answer holds (packages/contracts). */
  query: URLSearchParams;
  body: unknown;
  fieldOf: FieldOf;
  /** The record in the answer, as Payload sends it. */
  schema: z.ZodType<T>;
};

/**
 * A save: `POST /api/<collection>` for a new record, `PATCH` for one that
 * exists, its answer's record read by `schema`, then by `read`.
 */
export async function saveRecord<T, R>(
  { collection, id, query, body, fieldOf, schema }: SaveRequest<T>,
  read: (doc: T) => R,
): Promise<Written<R>> {
  const path = id
    ? `/api/${collection}/${encodeURIComponent(id)}?${query}`
    : `/api/${collection}?${query}`;
  const answer = answerOf(
    await write(id ? "PATCH" : "POST", path, body, fieldOf),
    savedRecordSchema(schema),
  );
  return answer.ok ? { ok: true, result: read(answer.result.doc) } : answer;
}

/** Deletes a record; the backend refuses one that others still use. */
export async function deleteRecord(
  collection: string,
  id: string,
  fieldOf: FieldOf,
): Promise<Written<null>> {
  const written = await write(
    "DELETE",
    `/api/${collection}/${encodeURIComponent(id)}`,
    undefined,
    fieldOf,
  );
  return written.ok ? { ok: true, result: null } : written;
}

/**
 * Duplicates a record, as Payload's panel does (`POST .../duplicate`): the
 * copy's id. The backend gives the copy its own slug, and a topic's copy
 * is a fresh draft.
 */
export async function duplicateRecord(
  collection: DuplicatedCollection,
  id: string,
): Promise<Written<string>> {
  const answer = answerOf(
    await write(
      "POST",
      `/api/${collection}/${encodeURIComponent(id)}/duplicate?${duplicateSearchParams()}`,
      undefined,
      () => null,
    ),
    duplicateAnswerSchema,
  );
  return answer.ok ? { ok: true, result: answer.result.doc.id } : answer;
}
