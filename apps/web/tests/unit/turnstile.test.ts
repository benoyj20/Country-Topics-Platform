import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TURNSTILE_HEADER, turnstilePlugins } from "@/auth/turnstile";

// The Turnstile plugin as configured for the site, against a local stand-in
// for Cloudflare's siteverify endpoint: tokens are checked on the email
// sign-in request only, and a missing or refused token stops it.

const PASSING_TOKEN = "token-that-passes";
let server: Server;
let verifyUrl: string;
const received: unknown[] = [];

beforeAll(async () => {
  server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => (body += chunk.toString()));
    request.on("end", () => {
      const parsed: unknown = JSON.parse(body);
      received.push(parsed);
      const success =
        typeof parsed === "object" &&
        parsed !== null &&
        "response" in parsed &&
        parsed.response === PASSING_TOKEN;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ success }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  verifyUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

function plugin() {
  const [captcha] = turnstilePlugins(
    { siteKey: "site-key", secretKey: "secret-key" },
    verifyUrl,
  );
  if (!captcha) throw new Error("Turnstile is configured, so it is on");
  return captcha;
}

const silent = { error: () => undefined, warn: () => undefined };

/** Runs the plugin's request check as Better Auth would; undefined lets it through. */
async function check(path: string, token?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set(TURNSTILE_HEADER, token);
  const request = new Request(`http://localhost:3000/api/auth${path}`, {
    method: "POST",
    headers,
    body: "{}",
  });
  // The plugin reads only the base path and the logger from Better Auth's
  // context; the rest of it is not needed here.
  const context = { options: {}, logger: silent } as unknown as Parameters<
    NonNullable<ReturnType<typeof plugin>["onRequest"]>
  >[1];
  const result = await plugin().onRequest?.(request, context);
  return result && "response" in result ? result.response.status : undefined;
}

describe("Turnstile on sign-in", () => {
  it("is off without keys", () => {
    expect(turnstilePlugins(undefined)).toEqual([]);
  });

  it("refuses an email link request without a token or with a refused one", async () => {
    expect(await check("/sign-in/magic-link")).toBe(400);
    expect(await check("/sign-in/magic-link", "token-that-fails")).toBe(403);
  });

  it("lets a request through when Cloudflare accepts its token", async () => {
    received.length = 0;
    expect(await check("/sign-in/magic-link", PASSING_TOKEN)).toBeUndefined();
    expect(received).toEqual([
      expect.objectContaining({
        secret: "secret-key",
        response: PASSING_TOKEN,
      }),
    ]);
  });

  it("leaves other endpoints alone", async () => {
    expect(await check("/sign-in/social")).toBeUndefined();
    expect(await check("/magic-link/verify")).toBeUndefined();
  });
});
