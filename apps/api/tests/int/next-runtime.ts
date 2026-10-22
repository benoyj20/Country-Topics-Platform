import { vi } from "vitest";

// The public pages' cache lives in Next.js: Payload's hooks purge it with
// after() and revalidateTag(), and the read model caches with
// unstable_cache(), all of which work only inside a Next.js request. The
// tests call Payload and the route handlers directly, so these stand-ins run
// a purge at once and record its tags, and load without caching.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    void task();
  },
}));

vi.mock("next/cache", async (importOriginal) => {
  const { purgedTags } = await import("./purged-tags");
  return {
    ...(await importOriginal<typeof import("next/cache")>()),
    revalidateTag: (tag: string) => {
      purgedTags.push(tag);
    },
    unstable_cache: <T>(load: T) => load,
  };
});
