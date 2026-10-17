import { afterEach, describe, expect, it, vi } from "vitest";

import { PUBLIC_TAGS, purgePublicPages } from "@/public-cache";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("purgePublicPages", () => {
  it("lets a save outside a web request go ahead, without a purge", () => {
    // The real Next.js after(), which throws outside a request: a script
    // using Payload's local API must not fail because of the page cache.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => purgePublicPages([PUBLIC_TAGS.topics])).not.toThrow();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Public pages not purged (public:topics)"),
    );
  });

  it("does nothing without tags", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    purgePublicPages([]);
    expect(warn).not.toHaveBeenCalled();
  });
});
