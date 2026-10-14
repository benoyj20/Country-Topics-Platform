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
});
