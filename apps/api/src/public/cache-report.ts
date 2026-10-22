import { AsyncLocalStorage } from "node:async_hooks";

// Whether a read through the cached loaders (cached.ts) loaded its data
// afresh or found all of it in the shared cache. The page-data endpoints
// say so in a header, which the scale rehearsal checks: with one cache
// shared by every backend container, a purged page's data is loaded once,
// then the other containers find it (ADR 0013).

export const DATA_CACHE_HEADER = "X-Data-Cache";

const reads = new AsyncLocalStorage<{ loaded: boolean }>();

/** Called by a cached loader when it loads afresh, on a miss. */
export function noteLoaded(): void {
  const read = reads.getStore();
  if (read) read.loaded = true;
}

/** Runs `read`, then says whether any loader it called loaded afresh. */
export async function reportCache<T>(
  read: () => Promise<T>,
): Promise<{ value: T; cache: "HIT" | "MISS" }> {
  const store = { loaded: false };
  const value = await reads.run(store, read);
  return { value, cache: store.loaded ? "MISS" : "HIT" };
}
