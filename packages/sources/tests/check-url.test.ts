import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { isPublicAddress } from "../src/addresses.ts";
import { checkUrl } from "../src/check-url.ts";

describe("isPublicAddress", () => {
  it("refuses loopback, private, link-local, and reserved addresses", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "::1",
      "::",
      "fe80::1",
      "fd00::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "::7f00:1",
      "::ffff:0:a9fe:a9fe",
      "fec0::1",
      "2001:db8::1",
      "not an address",
    ]) {
      assert.equal(isPublicAddress(address), false, address);
    }
  });

  it("accepts public addresses", () => {
    for (const address of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) {
      assert.equal(isPublicAddress(address), true, address);
    }
  });
});

describe("checkUrl", () => {
  let server: Server;
  let base: string;
  const userAgent = "CountryTopicsPlatform/0.1 (test)";
  // The test server listens on loopback at a random port, both of which the
  // real check refuses; these options allow exactly that and nothing else.
  const local = {
    userAgent,
    isAllowedAddress: (address: string) =>
      address === "127.0.0.1" || address === "::1" || isPublicAddress(address),
    isAllowedPort: () => true,
  };

  before(async () => {
    server = createServer((request, response) => {
      const routes: Record<string, () => void> = {
        "/ok": () => response.writeHead(200).end("page"),
        "/gone": () => response.writeHead(404).end(),
        "/forbidden": () => response.writeHead(403).end(),
        "/busy": () => response.writeHead(503).end(),
        "/redirect": () => response.writeHead(302, { Location: "/ok" }).end(),
        "/bad-redirect": () =>
          response.writeHead(301, { Location: "http://[bad" }).end(),
        "/loop": () => response.writeHead(302, { Location: "/loop" }).end(),
        "/to-metadata": () =>
          response
            .writeHead(302, { Location: "http://169.254.169.254/latest" })
            .end(),
        "/user-agent": () =>
          response
            .writeHead(request.headers["user-agent"] === userAgent ? 200 : 400)
            .end(),
      };
      (routes[request.url ?? ""] ?? (() => response.writeHead(500).end()))();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const { port } = server.address() as AddressInfo;
    base = `http://localhost:${port}`;
  });

  after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("resolves a page, following redirects, and says who is asking", async () => {
    for (const path of ["/ok", "/redirect", "/user-agent"]) {
      assert.equal(
        (await checkUrl(`${base}${path}`, local)).outcome,
        "resolved",
        path,
      );
    }
  });

  it("tells pages that are gone from sites that refuse bots or are busy", async () => {
    assert.deepEqual(await checkUrl(`${base}/gone`, local), {
      outcome: "not_found",
      message: "The page was not found (404).",
    });
    assert.equal(
      (await checkUrl(`${base}/forbidden`, local)).outcome,
      "resolved",
    );
    assert.match(
      (await checkUrl(`${base}/forbidden`, local)).message ?? "",
      /refuses automated access \(403\)/,
    );
    assert.equal((await checkUrl(`${base}/busy`, local)).outcome, "failed");
    assert.deepEqual(await checkUrl(`${base}/loop`, local), {
      outcome: "failed",
      message: "The link redirects too many times.",
    });
  });

  it("reports a redirect to an invalid address", async () => {
    assert.deepEqual(await checkUrl(`${base}/bad-redirect`, local), {
      outcome: "not_found",
      message: "The site redirects to an invalid address.",
    });
  });

  it("refuses a redirect to a private address", async () => {
    assert.deepEqual(await checkUrl(`${base}/to-metadata`, local), {
      outcome: "not_found",
      message: "The link points to a private or local network address.",
    });
  });

  it("refuses unusual ports, credentials, and other schemes before connecting", async () => {
    assert.match(
      (await checkUrl(`${base}/ok`, { userAgent })).message ?? "",
      /unusual port/,
    );
    assert.match(
      (await checkUrl("https://user:secret@example.org/", { userAgent }))
        .message ?? "",
      /password/,
    );
    assert.equal(
      (await checkUrl("ftp://example.org/file", { userAgent })).outcome,
      "not_found",
    );
    assert.equal(
      (await checkUrl("not a url", { userAgent })).outcome,
      "not_found",
    );
  });

  it("refuses private addresses, by name, literal, or redirect", async () => {
    for (const url of [
      "http://localhost/",
      "http://127.0.0.1/",
      "http://[::1]/",
      "http://169.254.169.254/latest/meta-data/",
    ]) {
      assert.deepEqual(
        await checkUrl(url, { userAgent }),
        {
          outcome: "not_found",
          message: "The link points to a private or local network address.",
        },
        url,
      );
    }
  });
});
