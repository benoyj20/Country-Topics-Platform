import { parseSentryDsn } from "@countrytopics/observability";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  browserEnvelopeForSentry,
  parseEnvelope,
  sentryEnvelopeUrl,
} from "@/error-reporting/envelope";

// Browser error reports passed on to Sentry (ADR 0012): the envelope
// handling, and the route against stand-ins for the configuration, the
// rate limit, and Sentry itself, so nothing reaches the real project.

const dsn = parseSentryDsn("https://serverkey@o123.ingest.us.sentry.io/4567");
if (!dsn) throw new Error("The test DSN must parse");
const config = { dsn, environment: "pilot" };

const encoder = new TextEncoder();
const lines = (...parts: unknown[]) =>
  encoder.encode(parts.map((part) => JSON.stringify(part)).join("\n"));

const browserEvent = {
  event_id: "abc",
  message: "TEST failed for member@example.test",
  user: { ip_address: "203.0.113.9" },
  request: {
    url: "https://site.example/topics/x?q=secret",
    headers: { Cookie: "session=1", "User-Agent": "TEST browser" },
  },
  breadcrumbs: [{ category: "console", message: "typed text" }],
};

describe("browser error envelopes", () => {
  it("pass on error events only, scrubbed, with the site's DSN and environment", () => {
    const envelope = browserEnvelopeForSentry(
      lines(
        { event_id: "abc", dsn: "https://site@errors.invalid/1" },
        { type: "session" },
        { status: "ok" },
        { type: "event" },
        browserEvent,
      ),
      config,
    );
    if (!envelope) throw new Error("Expected an envelope");
    const parsed = parseEnvelope(encoder.encode(envelope));
    expect(parsed?.header).toMatchObject({ event_id: "abc", dsn: dsn.dsn });
    expect(parsed?.items.map((item) => item.header)).toEqual([
      { type: "event" },
    ]);
    const event: unknown = JSON.parse(
      new TextDecoder().decode(parsed?.items[0]?.payload),
    );
    expect(event).toEqual({
      event_id: "abc",
      message: "TEST failed for [email]",
      request: {
        url: "https://site.example/topics/x",
        headers: { "User-Agent": "TEST browser" },
      },
      breadcrumbs: [],
      environment: "pilot",
    });
  });

  it("read items with a byte length, and refuse what is not an envelope", () => {
    const payload = JSON.stringify({ message: "TEST é" });
    const bytes = encoder.encode(
      `{}\n${JSON.stringify({ type: "event", length: encoder.encode(payload).length })}\n${payload}\n`,
    );
    expect(parseEnvelope(bytes)?.items).toHaveLength(1);
    expect(parseEnvelope(encoder.encode("not json"))).toBeNull();
    expect(
      parseEnvelope(encoder.encode(`{}\n{"type":"event","length":999}\n{}`)),
    ).toBeNull();
    expect(
      browserEnvelopeForSentry(lines({}, { type: "session" }, {}), config),
    ).toBeNull();
  });

  it("go to the project's envelope address", () => {
    expect(sentryEnvelopeUrl(config)).toBe(
      "https://o123.ingest.us.sentry.io/api/4567/envelope/",
    );
  });
});

describe("POST /api/v1/errors", () => {
  const sentry = vi.fn<typeof fetch>();
  let reportingOn = true;

  beforeEach(() => {
    vi.resetModules();
    reportingOn = true;
    sentry.mockReset();
    sentry.mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", sentry);
    vi.doMock("@/env", () => ({
      serverEnv: () => ({
        siteUrl: "http://localhost:3000",
        errorReporting: reportingOn ? config : undefined,
      }),
    }));
    vi.doMock("@/api/member", () => ({ rateLimited: async () => null }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("@/env");
    vi.doUnmock("@/api/member");
  });

  const post = async (origin: string, body: Uint8Array) => {
    const { POST } = await import("@/app/api/v1/errors/route");
    return POST(
      new Request("http://localhost:3000/api/v1/errors", {
        method: "POST",
        headers: { origin, "content-type": "text/plain" },
        body: Buffer.from(body),
      }),
    );
  };
  const report = lines({}, { type: "event" }, browserEvent);

  it("passes a report from the site on to Sentry", async () => {
    expect((await post("http://localhost:3000", report)).status).toBe(204);
    expect(sentry).toHaveBeenCalledTimes(1);
    const [url, init] = sentry.mock.calls[0] ?? [];
    expect(url).toBe(sentryEnvelopeUrl(config));
    expect(String(init?.body)).not.toContain("member@example.test");
  });

  it("refuses other sites and sends nothing while reporting is off", async () => {
    expect((await post("https://evil.example", report)).status).toBe(403);
    reportingOn = false;
    expect((await post("http://localhost:3000", report)).status).toBe(204);
    expect(sentry).not.toHaveBeenCalled();
  });
});
