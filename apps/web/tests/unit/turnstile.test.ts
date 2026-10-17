import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TURNSTILE_HEADER, turnstilePlugins } from "@/auth/turnstile";

// The Turnstile plugin as configured for the site, against a local stand-in
// for Cloudflare's siteverify endpoint: tokens are checked on the email
// sign-in request only, a missing or refused token stops it, and a real
// key's token must come from the sign-in widget on this site.

const SITE_URL = "http://localhost:3000";
const REAL_SECRET = "0x4AAAAAAAtest-real-secret";
const TEST_SECRET = "1x0000000000000000000000000000000AA";

// What the stand-in answers for each token, as Cloudflare would.
const ANSWERS: Record<string, Record<string, unknown>> = {
  good: { success: true, action: "sign-in", hostname: "localhost" },
  "other-action": { success: true, action: "comment", hostname: "localhost" },
  "other-host": { success: true, action: "sign-in", hostname: "evil.example" },
  // Test keys' answers name no action and Cloudflare's example hostname.
  "test-key": { success: true, hostname: "example.com" },
};

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
      const token =
        typeof parsed === "object" &&
        parsed !== null &&
        "response" in parsed &&
        typeof parsed.response === "string"
          ? parsed.response
          : "";
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(ANSWERS[token] ?? { success: false }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  verifyUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

function plugin(secretKey = REAL_SECRET) {
  const [captcha] = turnstilePlugins(
    { siteKey: "site-key", secretKey },
    SITE_URL,
    verifyUrl,
  );
  if (!captcha) throw new Error("Turnstile is configured, so it is on");
  return captcha;
}

const silent = { error: () => undefined, warn: () => undefined };

/** Runs the plugin's request check as Better Auth would; undefined lets it through. */
async function check(path: string, token?: string, secretKey?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set(TURNSTILE_HEADER, token);
  const request = new Request(`${SITE_URL}/api/auth${path}`, {
    method: "POST",
    headers,
    body: "{}",
  });
  const captcha = plugin(secretKey);
  // The plugin reads only the base path and the logger from Better Auth's
  // context; the rest of it is not needed here.
  const context = { options: {}, logger: silent } as unknown as Parameters<
    NonNullable<typeof captcha.onRequest>
  >[1];
  const result = await captcha.onRequest?.(request, context);
  return result && "response" in result ? result.response.status : undefined;
}

describe("Turnstile on sign-in", () => {
  it("is off without keys", () => {
    expect(turnstilePlugins(undefined, SITE_URL)).toEqual([]);
  });

  it("refuses an email link request without a token or with a refused one", async () => {
    expect(await check("/sign-in/magic-link")).toBe(400);
    expect(await check("/sign-in/magic-link", "refused")).toBe(403);
  });

  it("lets a request through when Cloudflare accepts its token", async () => {
    received.length = 0;
    expect(await check("/sign-in/magic-link", "good")).toBeUndefined();
    expect(received).toEqual([
      expect.objectContaining({ secret: REAL_SECRET, response: "good" }),
    ]);
  });

  it("refuses a token from another widget or site under the same key", async () => {
    expect(await check("/sign-in/magic-link", "other-action")).toBe(403);
    expect(await check("/sign-in/magic-link", "other-host")).toBe(403);
  });

  it("accepts Cloudflare's test keys' answers, which name no action", async () => {
    expect(
      await check("/sign-in/magic-link", "test-key", TEST_SECRET),
    ).toBeUndefined();
    expect(await check("/sign-in/magic-link", "test-key")).toBe(403);
  });

  it("leaves other endpoints alone", async () => {
    expect(await check("/sign-in/social")).toBeUndefined();
    expect(await check("/magic-link/verify")).toBeUndefined();
  });
});
