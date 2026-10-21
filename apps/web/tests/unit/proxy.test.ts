import {
  FORWARDING_HEADERS,
  signForwardedRequest,
} from "@countrytopics/forwarding";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const settings = vi.hoisted(() => ({
  forwardingKey: "test-forwarding-key-0123456789abcdef",
  panelOrigin: "http://localhost:3002" as string | undefined,
}));
vi.mock("@/env", () => ({ serverEnv: () => settings }));

const { proxy } = await import("@/proxy");

const BACKEND = "http://localhost:3002";

async function signed(path: string, method = "GET", address = "203.0.113.7") {
  return signForwardedRequest(
    settings.forwardingKey,
    { method, pathAndQuery: path },
    address,
  );
}

function request(
  path: string,
  init: { method?: string; headers?: HeadersInit } = {},
) {
  return new NextRequest(`${BACKEND}${path}`, init);
}

/** Whether the proxy let the request through to the routes. */
const passed = (response: Response) =>
  response.headers.get("x-middleware-next") === "1";

describe("the backend's proxy", () => {
  beforeEach(() => {
    settings.panelOrigin = "http://localhost:3002";
  });

  it("lets through requests the frontend signed, and nothing it did not", async () => {
    const path = "/api/v1/topics?country=kenya";
    expect(
      passed(await proxy(request(path, { headers: await signed(path) }))),
    ).toBe(true);

    for (const headers of [
      {},
      await signed("/api/v1/account"),
      await signed(path, "POST"),
      {
        ...(await signed(path)),
        [FORWARDING_HEADERS.clientAddress]: "198.51.100.1",
      },
    ]) {
      const response = await proxy(request(path, { headers }));
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("covers the path without Next.js's _rsc parameter", async () => {
    const response = await proxy(
      request("/topics/x?_rsc=abc", { headers: await signed("/topics/x") }),
    );
    expect(passed(response)).toBe(true);
  });

  it("answers the health check unsigned", async () => {
    expect(passed(await proxy(request("/api/v1/health")))).toBe(true);
  });

  it("lets Payload's panel in locally, unsigned, and never anywhere else", async () => {
    const panelRequests = [
      request("/admin"),
      request("/admin/collections/topics"),
      request("/api/topics/1", {
        method: "PATCH",
        headers: { origin: "http://localhost:3002" },
      }),
      request("/api/users/me", {
        headers: { referer: "http://localhost:3002/admin" },
      }),
    ];
    for (const panel of panelRequests) {
      expect(passed(await proxy(panel))).toBe(true);
    }
    // From the site's origin, or with a signature header it did not make.
    expect(
      (
        await proxy(
          request("/api/topics", {
            headers: { origin: "http://localhost:3000" },
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await proxy(
          request("/admin", {
            headers: { [FORWARDING_HEADERS.clientAddress]: "203.0.113.7" },
          }),
        )
      ).status,
    ).toBe(401);

    settings.panelOrigin = undefined;
    for (const panel of [
      request("/admin"),
      request("/api/users/me", {
        headers: { referer: "http://localhost:3002/admin" },
      }),
    ]) {
      expect((await proxy(panel)).status).toBe(401);
    }
  });

  it("says when a signature has expired", async () => {
    const path = "/api/v1/pages/home";
    const old = await signForwardedRequest(
      settings.forwardingKey,
      { method: "GET", pathAndQuery: path },
      "203.0.113.7",
      Date.now() - 6 * 60 * 1000,
    );
    const response = await proxy(request(path, { headers: old }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error:
        "This request's signature has expired, or the clocks of the frontend and this backend differ by more than 5 minutes.",
    });
  });
});
