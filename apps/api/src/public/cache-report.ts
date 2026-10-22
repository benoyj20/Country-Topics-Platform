import { AsyncLocalStorage } from "node:async_hooks";

// Whether a read through the cached loaders (cached.ts) loaded its data
// afresh or found it in the shared cache. The page-data endpoints say so in
// a header, which the scale rehearsal checks: with one cache shared by
// every API container, a purged page's data is loaded once, then the other
// containers find it (ADR 0013).
//
// Judged by the answer itself: on a miss, Next.js's unstable_cache returns
// the very value the loader made, and on a hit a copy parsed from the
// cache. A stale hit returns the stale copy while the loader runs again in
// the background, so that run does not count.

export const DATA_CACHE_HEADER = "X-Data-Cache";

type Read = { cached: boolean; loaded: unknown[] };

const reads = new AsyncLocalStorage<Read>();

/** Called by a cached loader whenever it is asked. */
export function noteRead(): void {
  const read = reads.getStore();
  if (read) read.cached = true;
}

/** Called with what a cached loader loaded afresh; returns it. */
export function noteLoaded<T>(value: T): T {
  reads.getStore()?.loaded.push(value);
  return value;
}

/**
 * Runs `read`, then says whether its answer was loaded afresh ("MISS") or
 * came from the shared cache ("HIT"); null when no cached loader was asked.
 */
export async function reportCache<T>(
  read: () => Promise<T>,
): Promise<{ value: T; cache: "HIT" | "MISS" | null }> {
  const store: Read = { cached: false, loaded: [] };
  const value = await reads.run(store, read);
  if (!store.cached) return { value, cache: null };
  return { value, cache: store.loaded.includes(value) ? "MISS" : "HIT" };
}
