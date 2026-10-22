import { describe, expect, it, vi } from "vitest";

import { checkHealth } from "@/health";

describe("checkHealth", () => {
  it("is ok when the database answers", async () => {
    const logError = vi.fn();

    await expect(
      checkHealth({ pingDatabase: async () => [], logError }),
    ).resolves.toBe("ok");
    expect(logError).not.toHaveBeenCalled();
  });

  it("is unavailable and logs the cause when the database query fails", async () => {
    const failure = new Error("connection refused");
    const logError = vi.fn();

    await expect(
      checkHealth({ pingDatabase: () => Promise.reject(failure), logError }),
    ).resolves.toBe("unavailable");
    expect(logError).toHaveBeenCalledWith(failure);
  });

  it("is unavailable when the database does not answer in time", async () => {
    vi.useFakeTimers();
    try {
      const logError = vi.fn();
      const result = checkHealth({
        pingDatabase: () => new Promise(() => {}),
        logError,
        timeoutMs: 3_000,
      });

      await vi.advanceTimersByTimeAsync(3_000);

      await expect(result).resolves.toBe("unavailable");
      expect(logError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("3000 ms"),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
