"use client";

import {
  type AdminCollection,
  backendTime,
  documentLockSearchParams,
  LOCK_REFRESH_MS,
  lockBody,
  type LockHolder,
  lockHolder,
  lockIsFresh,
  LOCKS_PATH,
  locksPageSchema,
  type StoredLock,
} from "@countrytopics/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import * as z from "zod";

// An editor's lock on its document (ADR 0014, phase 11), as Payload's
// panel takes one: while it is fresh, the backend refuses anyone else's
// save, so two editors cannot overwrite each other. The lock is refreshed
// while the editor is open, taken again after each save (which clears
// it), and given up when the editor closes.

export type LockState =
  /** Not locking: a new record, or one the reader may not edit. */
  | { kind: "off" }
  | { kind: "taking" }
  | { kind: "mine" }
  /**
   * Someone else holds it; the editor is read only until they leave or
   * the reader takes over. `tookOver` when they took it from the reader.
   */
  | { kind: "theirs"; holder: LockHolder | null; tookOver: boolean }
  /** The locks could not be reached: saving still works, unprotected. */
  | { kind: "failed" };

const Created = z.looseObject({ doc: z.looseObject({ id: z.string() }) });

async function readLock(
  collection: AdminCollection,
  id: string,
): Promise<{ lock: StoredLock | null; now: Date | null }> {
  const response = await fetch(
    `${LOCKS_PATH}?${documentLockSearchParams(collection, id)}`,
    { credentials: "same-origin", cache: "no-store" },
  );
  if (!response.ok) throw new Error(`Locks answered ${response.status}.`);
  const { docs } = locksPageSchema.parse(await response.json());
  return {
    lock: docs[0] ?? null,
    now: backendTime(response.headers.get("date")),
  };
}

/** Takes the lock: the one on record when there is one, else a new one. */
async function takeLock(
  collection: AdminCollection,
  id: string,
  user: string,
  existing: StoredLock | null,
): Promise<string> {
  const body = JSON.stringify(lockBody(collection, id, user));
  const response = await fetch(
    existing ? `${LOCKS_PATH}/${existing.id}` : LOCKS_PATH,
    {
      method: existing ? "PATCH" : "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body,
    },
  );
  if (!response.ok) throw new Error(`Locking answered ${response.status}.`);
  return Created.parse(await response.json()).doc.id;
}

export function useDocumentLock({
  collection,
  id,
  user,
  enabled,
}: {
  collection: AdminCollection;
  id: string | null;
  /** The reader's account id. */
  user: string | null;
  enabled: boolean;
}): {
  state: LockState;
  /** Takes the lock from whoever holds it. */
  takeOver: () => Promise<void>;
  /**
   * Takes the lock again after the reader's own save, which clears it.
   * The save went through, so nobody else held it then; anyone who took
   * it since only just opened the record.
   */
  relock: () => void;
} {
  const active = enabled && id !== null && user !== null;
  const [state, setState] = useState<LockState>(
    active ? { kind: "taking" } : { kind: "off" },
  );
  const held = useRef<string | null>(null);
  const running = useRef(false);
  // Counts the take-overs: a refresh begun before the latest one is
  // outdated by the time it is answered, and is dropped.
  const takeOvers = useRef(0);

  /**
   * Checks who holds the lock, and takes it when nobody else does: on
   * opening, on each refresh, and after a save. `force` takes it anyway.
   */
  const check = useCallback(
    async (force = false) => {
      // A take-over goes ahead even while a refresh runs.
      if (!active || id === null || user === null) return;
      if (running.current && !force) return;
      running.current = true;
      const round = force ? ++takeOvers.current : takeOvers.current;
      const outdated = () => round !== takeOvers.current;
      try {
        const { lock, now } = await readLock(collection, id);
        if (outdated()) return;
        const holder = lock ? lockHolder(lock) : null;
        // Without the backend's time, a lock is taken to be fresh.
        const fresh = lock !== null && (now === null || lockIsFresh(lock, now));
        if (!force && lock && holder?.id !== user && fresh) {
          const tookOver = held.current !== null;
          held.current = null;
          setState({ kind: "theirs", holder, tookOver });
          return;
        }
        const taken = await takeLock(collection, id, user, lock);
        if (outdated()) return;
        held.current = taken;
        setState({ kind: "mine" });
      } catch {
        if (outdated()) return;
        setState((current) =>
          current.kind === "theirs" ? current : { kind: "failed" },
        );
      } finally {
        if (!outdated() || force) running.current = false;
      }
    },
    [active, collection, id, user],
  );

  useEffect(() => {
    if (!active) return;
    void check();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, LOCK_REFRESH_MS);
    const release = () => {
      const lock = held.current;
      if (!lock) return;
      held.current = null;
      // Sent as the page goes away, so the next editor need not wait.
      void fetch(`${LOCKS_PATH}/${lock}`, {
        method: "DELETE",
        credentials: "same-origin",
        keepalive: true,
      }).catch(() => {});
    };
    window.addEventListener("pagehide", release);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", release);
      release();
    };
  }, [active, check]);

  return {
    state: active ? state : { kind: "off" },
    takeOver: () => check(true),
    relock: () => void check(true),
  };
}
