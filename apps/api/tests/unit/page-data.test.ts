import { afterEach, describe, expect, it, vi } from "vitest";

import { noteLoaded } from "@/public/cache-report";
import { pageDataResponse, slugPageData } from "@/public/page-data";

describe("page data answers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("send the data, unkept by shared caches", async () => {
    const response = await pageDataResponse(
      () => Promise.resolve({ name: "TEST" }),
      "missing",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ name: "TEST" });
  });

  it("say whether the data was loaded afresh or found in the shared cache", async () => {
    const found = await pageDataResponse(
      () => Promise.resolve({ name: "TEST" }),
      "missing",
    );
    expect(found.headers.get("x-data-cache")).toBe("HIT");
    const loaded = await pageDataResponse(async () => {
      await Promise.resolve();
      // As a cached loader does on a miss, after an await.
      noteLoaded();
      return { name: "TEST" };
    }, "missing");
    expect(loaded.headers.get("x-data-cache")).toBe("MISS");
  });

  it("answer 404 when there is nothing public", async () => {
    const response = await pageDataResponse(
      () => Promise.resolve(null),
      "No TEST page.",
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "No TEST page." });
  });

  it("answer 503 when loading fails, and report the error itself", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("TEST database down");
    const response = await pageDataResponse(
      () => Promise.reject(failure),
      "missing",
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(await response.json())).not.toContain(
      "TEST database",
    );
    expect(logged).toHaveBeenCalledWith("Page data failed:", failure);
  });

  it("never load a malformed slug", async () => {
    const load = vi.fn(() => Promise.resolve({ name: "TEST" }));
    const get = slugPageData(load, "missing");
    for (const slug of ["../account", "Not-A-Slug", ""]) {
      const response = await get(new Request("http://localhost/"), {
        params: Promise.resolve({ slug }),
      });
      expect(response.status).toBe(404);
    }
    expect(load).not.toHaveBeenCalled();
    const found = await get(new Request("http://localhost/"), {
      params: Promise.resolve({ slug: "test-page" }),
    });
    expect(found.status).toBe(200);
    expect(load).toHaveBeenCalledWith("test-page");
  });
});
