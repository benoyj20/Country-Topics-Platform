import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkForwardedRequest,
  FORWARDING_HEADERS,
} from "@countrytopics/forwarding";

import { passThrough } from "../src/pass-through.ts";
import type { FrontendSettings } from "../src/settings.ts";
import { readFrontendSettings } from "../src/settings.ts";

const LOCAL: FrontendSettings = {
  environment: "local",
  siteUrl: "http://localhost:3000",
  backendUrl: "http://localhost:3002",
  forwardingKey: "test-forwarding-key-0123456789abcdef",
  purgeKey: "test-purge-key-0123456789abcdef0123",
};
const HOSTED: FrontendSettings = {
  environment: "production",
  siteUrl: "https://countrytopics.example",
  backendUrl: "https://api.countrytopics.example",
  forwardingKey: LOCAL.forwardingKey,
  purgeKey: LOCAL.purgeKey,
};

type Sent = { url: string; init: RequestInit & { duplex?: string } };

/** A stand-in for fetch that records what was sent and answers `answer`. */
function backend(answer: () => Response | Promise<Response>) {
  const sent: Sent[] = [];
  const send = (async (url: URL | string, init: RequestInit = {}) => {
    sent.push({ url: String(url), init });
    return answer();
  }) as typeof fetch;
  return { sent, send };
}

describe("the pass-through", () => {
  it("passes a request on signed, with its method, body, and cookies", async () => {
    const { sent, send } = backend(() => new Response("ok"));
    const request = new Request(
      "http://localhost:3000/api/v1/topics/x/comments?a=1",
      {
        method: "POST",
        headers: {
          cookie: "__Host-countrytopics.session_token=abc",
          origin: "http://localhost:3000",
          "content-type": "application/json",
          "accept-encoding": "gzip, br",
          // A client's copies of headers the backend would believe.
          "x-forwarded-for": "198.51.100.1",
          "x-forwarded-host": "evil.example",
          "cf-connecting-ip": "198.51.100.1",
          [FORWARDING_HEADERS.clientAddress]: "198.51.100.1",
          [FORWARDING_HEADERS.signature]: "forged",
        },
        body: JSON.stringify({ body: "TEST" }),
      },
    );
    const response = await passThrough(request, LOCAL, send);
    assert.equal(response.status, 200);

    const [{ url, init }] = sent as [Sent];
    assert.equal(url, "http://localhost:3002/api/v1/topics/x/comments?a=1");
    assert.equal(init.method, "POST");
    assert.equal(init.redirect, "manual");
    assert.equal(init.duplex, "half");
    assert.equal(await new Response(init.body).text(), '{"body":"TEST"}');
    const headers = new Headers(init.headers);
    assert.equal(
      headers.get("cookie"),
      "__Host-countrytopics.session_token=abc",
    );
    assert.equal(headers.get("origin"), "http://localhost:3000");
    assert.equal(headers.get("accept-encoding"), "identity");
    assert.equal(headers.get("x-forwarded-host"), "localhost:3000");
    assert.equal(headers.get("x-forwarded-proto"), "http");
    assert.equal(headers.get("x-forwarded-for"), null);
    assert.equal(headers.get("cf-connecting-ip"), null);
    // Locally everyone is 127.0.0.1, whatever the request says.
    assert.deepEqual(
      await checkForwardedRequest(
        LOCAL.forwardingKey,
        { method: "POST", pathAndQuery: "/api/v1/topics/x/comments?a=1" },
        headers,
      ),
      { ok: true, clientAddress: "127.0.0.1" },
    );
  });

  it("sends every request to the backend's host, whatever its path", async () => {
    const { sent, send } = backend(() => new Response("ok"));
    const request = new Request("http://localhost:3000/x");
    // A path a router might let through, which a URL would read as a host.
    Object.defineProperty(request, "url", {
      value: "http://localhost:3000/api//evil.example/steal?a=1",
    });
    await passThrough(request, LOCAL, send);
    const [{ url }] = sent as [Sent];
    assert.equal(new URL(url).origin, "http://localhost:3002");
    assert.equal(url, "http://localhost:3002/api//evil.example/steal?a=1");
  });

  it("signs a request without Next.js's _rsc parameter, which the backend's Next.js removes, and keeps it in the URL", async () => {
    const { sent, send } = backend(() => new Response("ok"));
    await passThrough(
      new Request("http://localhost:3000/api/v1/x?_rsc=abc", {
        headers: { rsc: "1" },
      }),
      LOCAL,
      send,
    );
    const [{ url, init }] = sent as [Sent];
    assert.equal(url, "http://localhost:3002/api/v1/x?_rsc=abc");
    const headers = new Headers(init.headers);
    assert.equal(headers.get("rsc"), "1");
    assert.equal(
      (
        await checkForwardedRequest(
          LOCAL.forwardingKey,
          { method: "GET", pathAndQuery: "/api/v1/x" },
          headers,
        )
      ).ok,
      true,
    );
  });

  it("signs Cloudflare's visitor address when deployed, and refuses a request without one", async () => {
    const { sent, send } = backend(() => new Response("ok"));
    await passThrough(
      new Request("https://countrytopics.example/api/v1/pages/home", {
        headers: { "cf-connecting-ip": "203.0.113.7" },
      }),
      HOSTED,
      send,
    );
    const [{ url, init }] = sent as [Sent];
    assert.equal(url, "https://api.countrytopics.example/api/v1/pages/home");
    assert.deepEqual(
      await checkForwardedRequest(
        HOSTED.forwardingKey,
        { method: "GET", pathAndQuery: "/api/v1/pages/home" },
        new Headers(init.headers),
      ),
      { ok: true, clientAddress: "203.0.113.7" },
    );

    const without = await passThrough(
      new Request("https://countrytopics.example/api/v1/pages/home"),
      HOSTED,
      send,
    );
    assert.equal(without.status, 400);
    assert.equal(sent.length, 1);
  });

  it("returns the backend's answer as it is, with every cookie and its redirect", async () => {
    const { send } = backend(() => {
      const headers = new Headers({
        location: "http://localhost:3002/account?x=1",
        "content-type": "text/plain",
        "cache-control": "private, no-store",
        connection: "keep-alive",
      });
      headers.append("set-cookie", "__Host-a=1; Path=/; Secure; HttpOnly");
      headers.append("set-cookie", "__Host-b=2; Path=/; Secure; HttpOnly");
      return new Response("moved", { status: 302, headers });
    });
    const response = await passThrough(
      new Request("http://localhost:3000/api/auth/magic-link/verify?token=t"),
      LOCAL,
      send,
    );
    assert.equal(response.status, 302);
    assert.deepEqual(response.headers.getSetCookie(), [
      "__Host-a=1; Path=/; Secure; HttpOnly",
      "__Host-b=2; Path=/; Secure; HttpOnly",
    ]);
    // A Location that names the backend names the site instead.
    assert.equal(
      response.headers.get("location"),
      "http://localhost:3000/account?x=1",
    );
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("connection"), null);
    assert.equal(await response.text(), "moved");

    for (const location of [
      "/sign-in",
      "https://accounts.google.com/o/oauth2",
    ]) {
      const other = await passThrough(
        new Request("http://localhost:3000/api/auth/x"),
        LOCAL,
        backend(
          () => new Response(null, { status: 302, headers: { location } }),
        ).send,
      );
      assert.equal(other.headers.get("location"), location);
    }
    const protocolRelative = await passThrough(
      new Request("http://localhost:3000/api/auth/x"),
      LOCAL,
      backend(
        () =>
          new Response(null, {
            status: 302,
            headers: { location: "//localhost:3002/account" },
          }),
      ).send,
    );
    assert.equal(
      protocolRelative.headers.get("location"),
      "http://localhost:3000/account",
    );
  });

  it("passes on /api and /files only, never the purge", async () => {
    const { sent, send } = backend(() => new Response("ok"));
    for (const path of [
      "/api/v1/pages/home",
      "/api/auth/get-session",
      "/files/x",
    ]) {
      const response = await passThrough(
        new Request(`http://localhost:3000${path}`),
        LOCAL,
        send,
      );
      assert.equal(response.status, 200, path);
    }
    assert.equal(sent.length, 3);
    for (const path of [
      "/api/revalidate",
      "/api/revalidate/x",
      "/admin",
      "/topics/x",
      "/apis",
      "/",
    ]) {
      const response = await passThrough(
        new Request(`http://localhost:3000${path}`),
        LOCAL,
        send,
      );
      assert.equal(response.status, 404, path);
    }
    assert.equal(sent.length, 3);
  });

  it("reads a path as the backend's router does, so no spelling reaches another", async () => {
    const { sent, send } = backend(() => new Response("ok"));
    for (const path of [
      // Percent-encoded, as the backend decodes it.
      "/api/%72evalidate",
      "/%61pi%2Frevalidate",
      // Dot segments, which URL parsing resolves, or the backend might.
      "/api/..%2Fadmin",
      "/files/.%2E/admin",
      "/api/%2E%2E%2Fadmin",
    ]) {
      const request = new Request("http://localhost:3000/api/x");
      Object.defineProperty(request, "url", {
        value: `http://localhost:3000${path}`,
      });
      const response = await passThrough(request, LOCAL, send);
      assert.equal(response.status, 404, path);
    }
    const unreadable = await passThrough(
      new Request("http://localhost:3000/api/%E0%A4%A"),
      LOCAL,
      send,
    );
    assert.equal(unreadable.status, 400);
    assert.equal(sent.length, 0);
  });

  it("says when the backend cannot be reached, or takes too long", async () => {
    const down = backend(() => {
      throw new TypeError("fetch failed");
    });
    const api = await passThrough(
      new Request("http://localhost:3000/api/v1/pages/home"),
      LOCAL,
      down.send,
    );
    assert.equal(api.status, 502);
    // The shape of every /api refusal (packages/contracts' ApiError).
    const body = await api.json();
    assert.match(body.error, /not available right now/);
    assert.deepEqual(body.problems, []);
    const file = await passThrough(
      new Request("http://localhost:3000/files/x"),
      LOCAL,
      down.send,
    );
    assert.equal(file.status, 502);
    assert.match(file.headers.get("content-type") ?? "", /text\/plain/);

    const slow = (async (_url: URL | string, init: RequestInit = {}) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      })) as typeof fetch;
    const late = await passThrough(
      new Request("http://localhost:3000/api/v1/x"),
      LOCAL,
      slow,
      20,
    );
    assert.equal(late.status, 504);
  });
});

describe("the frontend's settings", () => {
  const valid = {
    SITE_URL: "http://localhost:3000",
    BACKEND_URL: "http://localhost:3002/",
    FORWARDING_KEY: "f".repeat(32),
    PURGE_KEY: "p".repeat(32),
  };

  it("read the site, the backend, and the key", () => {
    assert.deepEqual(readFrontendSettings(valid), {
      environment: "local",
      siteUrl: "http://localhost:3000",
      backendUrl: "http://localhost:3002",
      forwardingKey: "f".repeat(32),
      purgeKey: "p".repeat(32),
      contactEmail: undefined,
      siteOperator: undefined,
    });
  });

  it("read who runs the site, for the legal pages, and refuse a bad address", () => {
    const settings = readFrontendSettings({
      ...valid,
      SITE_OPERATOR: " TEST Operator ",
      CONTACT_EMAIL: "test-contact@example.test",
    });
    assert.equal(settings.siteOperator, "TEST Operator");
    assert.equal(settings.contactEmail, "test-contact@example.test");
    assert.throws(
      () => readFrontendSettings({ ...valid, CONTACT_EMAIL: "not an address" }),
      /CONTACT_EMAIL must be empty or an email address/,
    );
  });

  it("refuse a short key, the same address twice, or another environment's backend", () => {
    assert.throws(
      () => readFrontendSettings({ ...valid, FORWARDING_KEY: "short" }),
      /FORWARDING_KEY must be at least 32/,
    );
    assert.throws(
      () => readFrontendSettings({ ...valid, PURGE_KEY: "" }),
      /PURGE_KEY must be at least 32/,
    );
    assert.throws(
      () => readFrontendSettings({ ...valid, PURGE_KEY: valid.FORWARDING_KEY }),
      /PURGE_KEY must differ from FORWARDING_KEY/,
    );
    assert.throws(
      () => readFrontendSettings({ ...valid, BACKEND_URL: valid.SITE_URL }),
      /BACKEND_URL must differ/,
    );
    assert.throws(
      () =>
        readFrontendSettings({
          ...valid,
          BACKEND_URL: "https://api.countrytopics.example",
        }),
      /BACKEND_URL must be a service on this machine/,
    );
    assert.throws(
      () =>
        readFrontendSettings({
          ...valid,
          APP_ENV: "production",
          SITE_URL: "https://countrytopics.example",
          BACKEND_URL: "http://localhost:3002",
        }),
      /BACKEND_URL must not point at this machine/,
    );
  });
});
