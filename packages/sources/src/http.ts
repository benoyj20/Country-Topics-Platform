import type * as z from "zod";

export type Fetch = typeof fetch;

/** Bounds each request to an outside service. */
export const SOURCE_TIMEOUT_MS = 8_000;
/** Bibliographic records are a few kilobytes; anything far larger is wrong. */
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/**
 * An outside service could not answer now (timeout, network error, rate
 * limit, server error). Worth trying again later; it says nothing about
 * whether the record exists.
 */
export class SourceUnavailableError extends Error {
  constructor(source: string, reason: string) {
    super(`${source} ${reason}.`);
    this.name = "SourceUnavailableError";
  }
}

export type SourceClient = {
  fetch: Fetch;
  /** Identifies the site to services that ask for it, such as Crossref. */
  userAgent: string;
  timeoutMs: number;
};

/**
 * The User-Agent for outside services: Crossref, Open Library, and the
 * Internet Archive ask callers to say who they are and how to reach them.
 */
export function sourceUserAgent({
  siteUrl,
  contactEmail,
}: {
  siteUrl: string;
  contactEmail?: string;
}): string {
  const contact = [siteUrl, contactEmail ? `mailto:${contactEmail}` : null]
    .filter(Boolean)
    .join("; ");
  return `CountryTopicsPlatform/0.1 (${contact})`;
}

async function readLimited(
  response: Response,
  source: string,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    let chunk: Awaited<ReturnType<typeof reader.read>>;
    try {
      chunk = await reader.read();
    } catch {
      // The time limit ran out or the connection dropped mid-answer.
      throw new SourceUnavailableError(source, "stopped answering");
    }
    const { done, value } = chunk;
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new SourceUnavailableError(source, "sent an oversized response");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Parses a 200 response. One in an unexpected shape means the service
 * changed, not that the record is missing.
 */
export function parseOrUnavailable<T>(
  schema: z.ZodType<T>,
  body: unknown,
  source: string,
): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new SourceUnavailableError(
      source,
      "sent a response in an unexpected format",
    );
  }
  return parsed.data;
}

export type JsonResponse = {
  status: number;
  /** The parsed body of a 2xx response; null otherwise. */
  body: unknown;
};

/**
 * Requests JSON from a fixed, trusted host. Timeouts, network errors, 429,
 * and 5xx responses throw SourceUnavailableError; other statuses are returned
 * for the caller to interpret (such as 404 for an unknown DOI).
 */
export async function requestJson(
  client: SourceClient,
  source: string,
  url: string,
  init: {
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    body?: URLSearchParams;
  } = {},
): Promise<JsonResponse> {
  let response: Response;
  try {
    response = await client.fetch(url, {
      method: init.method ?? "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": client.userAgent,
        ...init.headers,
      },
      body: init.body,
      signal: AbortSignal.timeout(client.timeoutMs),
    });
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    throw new SourceUnavailableError(
      source,
      timedOut ? "did not answer in time" : "could not be reached",
    );
  }
  if (response.status === 429 || response.status >= 500) {
    await response.body?.cancel();
    throw new SourceUnavailableError(
      source,
      response.status === 429
        ? "is limiting requests"
        : `answered with an error (${response.status})`,
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    return { status: response.status, body: null };
  }
  const text = await readLimited(response, source);
  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    throw new SourceUnavailableError(
      source,
      "sent a response that is not JSON",
    );
  }
}
