import * as z from "zod";

import { type AdminCollection, appendBrackets } from "./admin-lists.ts";

// Document locks (ADR 0014, phase 11), kept where Payload's panel keeps
// them: one record per document open in an editor, in Payload's
// `payload-locked-documents`, naming who opened it. While a lock is fresh,
// Payload refuses anyone else's save or delete of the document (423), so
// two editors cannot overwrite each other; every save of the document
// then clears its locks, and the editor takes its lock again. Locks are
// for verified staff only (apps/api's payload.config.ts).

export const LOCKS_PATH = "/api/payload-locked-documents";

/**
 * How long a lock holds after it was last refreshed: Payload's default,
 * which no collection changes (apps/api's tests check it).
 */
export const LOCK_DURATION_S = 300;

/** How often an open editor refreshes its lock, well inside the duration. */
export const LOCK_REFRESH_MS = 60_000;

/** The query string that finds the locks on one document, newest first. */
export function documentLockSearchParams(
  collection: AdminCollection,
  id: string,
): URLSearchParams {
  const params = new URLSearchParams({
    depth: "1",
    sort: "-updatedAt",
    limit: "1",
    "select[user]": "true",
    "select[updatedAt]": "true",
    "populate[users][email]": "true",
  });
  appendBrackets(params, "where", {
    and: [
      { "document.relationTo": { equals: collection } },
      { "document.value": { equals: id } },
    ],
  });
  return params;
}

/** The query string that finds the locks on any of a list's documents. */
export function listLocksSearchParams(
  collection: AdminCollection,
  ids: readonly string[],
): URLSearchParams {
  const params = new URLSearchParams({
    depth: "1",
    sort: "-updatedAt",
    limit: String(Math.max(ids.length, 1)),
    "select[document]": "true",
    "select[user]": "true",
    "select[updatedAt]": "true",
    "populate[users][email]": "true",
  });
  appendBrackets(params, "where", {
    and: [
      { "document.relationTo": { equals: collection } },
      { "document.value": { in: [...ids] } },
    ],
  });
  return params;
}

/** A polymorphic relation as Payload stores it: the collection and the record or its id. */
const Polymorphic = z.object({
  relationTo: z.string(),
  value: z.union([
    z.string(),
    z.looseObject({ id: z.string(), email: z.string().nullish() }),
  ]),
});

export const storedLockSchema = z.looseObject({
  id: z.string(),
  document: Polymorphic.nullish(),
  user: Polymorphic.nullish(),
  updatedAt: z.string(),
});
export type StoredLock = z.infer<typeof storedLockSchema>;

export const locksPageSchema = z.looseObject({
  docs: z.array(storedLockSchema),
});

/** Who holds a lock: their id, and their address when the reader may see it. */
export type LockHolder = { id: string; email: string | null };

export function lockHolder(lock: StoredLock): LockHolder | null {
  const value = lock.user?.value;
  if (!value) return null;
  return typeof value === "string"
    ? { id: value, email: null }
    : { id: value.id, email: value.email ?? null };
}

/** The document a lock is on, by its id. */
export function lockedDocument(lock: StoredLock): string | null {
  const value = lock.document?.value;
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

/** The backend's time from an answer's Date header; null when it sent none. */
export function backendTime(date: string | null): Date | null {
  const time = date ? Date.parse(date) : Number.NaN;
  return Number.isFinite(time) ? new Date(time) : null;
}

/**
 * Whether a lock still holds at `now`, by the backend's clock: Payload
 * stamps a lock with its own time, so `now` comes from the backend too
 * (an answer's Date header), never from a browser's clock.
 */
export function lockIsFresh(lock: StoredLock, now: Date): boolean {
  const refreshed = Date.parse(lock.updatedAt);
  return (
    Number.isFinite(refreshed) &&
    now.getTime() - refreshed <= LOCK_DURATION_S * 1_000
  );
}

/** The JSON body that locks a document for the person signed in. */
export function lockBody(
  collection: AdminCollection,
  id: string,
  user: string,
): Record<string, unknown> {
  return {
    document: { relationTo: collection, value: id },
    globalSlug: null,
    user: { relationTo: "users", value: user },
  };
}
