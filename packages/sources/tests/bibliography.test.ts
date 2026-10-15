import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createBibliography } from "../src/bibliography.ts";
import {
  type Fetch,
  type SourceClient,
  SourceUnavailableError,
} from "../src/http.ts";

// Synthetic records shaped like each service's documented responses. The DOI
// prefix 10.5555 is Crossref's test prefix; the ISBN only has a valid check
// digit (it may belong to some real book, which these records do not describe).

type Route = { status?: number; body?: unknown };

function fakeFetch(routes: Record<string, Route>) {
  const requested: {
    url: string;
    userAgent: string | null;
    apiKey: string | null;
  }[] = [];
  const fetch: Fetch = async (input, init) => {
    const url = String(input);
    requested.push({
      url,
      userAgent: new Headers(init?.headers).get("User-Agent"),
      apiKey: new Headers(init?.headers).get("X-goog-api-key"),
    });
    const route = routes[url];
    if (!route) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(route.body ?? {}), {
      status: route.status ?? 200,
    });
  };
  return { fetch, requested };
}

const client = (fetch: Fetch): SourceClient => ({
  fetch,
  userAgent: "CountryTopicsPlatform/0.1 (test)",
  timeoutMs: 1_000,
});

const CROSSREF = "https://api.crossref.org/works/10.5555/synthetic-1";
const HANDLE = "https://doi.org/api/handles/10.5555/synthetic-1";
const ISBN = "9780000000064";
const OPEN_LIBRARY = `https://openlibrary.org/api/books?bibkeys=ISBN:${ISBN}&format=json&jscmd=data`;

describe("lookupDoi", () => {
  it("reads Crossref's record, stripping markup and keeping date precision", async () => {
    const { fetch, requested } = fakeFetch({
      [CROSSREF]: {
        body: {
          status: "ok",
          message: {
            DOI: "10.5555/SYNTHETIC-1",
            type: "journal-article",
            title: ["A <i>synthetic</i> study"],
            subtitle: ["for tests"],
            author: [
              { given: "Ada", family: "Example" },
              { name: "Example Consortium" },
            ],
            "container-title": ["Journal of Test Data"],
            publisher: "Test Publisher",
            issued: { "date-parts": [[2021, 3]] },
          },
        },
      },
    });
    const result = await createBibliography(client(fetch)).lookupDoi(
      "10.5555/synthetic-1",
    );
    assert.deepEqual(result, {
      found: true,
      metadata: {
        source: "Crossref",
        kind: "article",
        title: "A synthetic study: for tests",
        authors: ["Ada Example", "Example Consortium"],
        containerTitle: "Journal of Test Data",
        publisher: "Test Publisher",
        publishedDate: "2021-03",
      },
    });
    assert.equal(requested[0]?.userAgent, "CountryTopicsPlatform/0.1 (test)");
  });

  it("asks the DOI system about DOIs Crossref does not know", async () => {
    const { fetch } = fakeFetch({
      [HANDLE]: { body: { responseCode: 1, handle: "10.5555/synthetic-1" } },
    });
    assert.deepEqual(
      await createBibliography(client(fetch)).lookupDoi("10.5555/synthetic-1"),
      { found: true, metadata: { source: "doi.org", authors: [] } },
    );
  });

  it("reports not found when neither knows the DOI", async () => {
    const { fetch, requested } = fakeFetch({
      [HANDLE]: { status: 404, body: { responseCode: 100 } },
    });
    assert.deepEqual(
      await createBibliography(client(fetch)).lookupDoi("10.5555/synthetic-1"),
      { found: false },
    );
    assert.deepEqual(
      requested.map((request) => request.url),
      [CROSSREF, HANDLE],
    );
  });

  it("lets the DOI system answer when Crossref is down", async () => {
    const crossrefDown = fakeFetch({
      [CROSSREF]: { status: 503 },
      [HANDLE]: { body: { responseCode: 1 } },
    });
    assert.deepEqual(
      await createBibliography(client(crossrefDown.fetch)).lookupDoi(
        "10.5555/synthetic-1",
      ),
      { found: true, metadata: { source: "doi.org", authors: [] } },
    );
  });

  it("throws, rather than saying not found, when it cannot tell", async () => {
    const bothDown = fakeFetch({
      [CROSSREF]: { status: 503 },
      [HANDLE]: { status: 502 },
    });
    await assert.rejects(
      createBibliography(client(bothDown.fetch)).lookupDoi(
        "10.5555/synthetic-1",
      ),
      SourceUnavailableError,
    );
    const odd = fakeFetch({ [HANDLE]: { body: { unexpected: true } } });
    await assert.rejects(
      createBibliography(client(odd.fetch)).lookupDoi("10.5555/synthetic-1"),
      /doi\.org sent a response in an unexpected format/,
    );
    const offline: Fetch = async () => {
      throw new TypeError("fetch failed");
    };
    await assert.rejects(
      createBibliography(client(offline)).lookupDoi("10.5555/synthetic-1"),
      /doi\.org could not be reached/,
    );
  });
});

describe("lookupIsbn", () => {
  it("reads Open Library's record", async () => {
    const { fetch } = fakeFetch({
      [OPEN_LIBRARY]: {
        body: {
          [`ISBN:${ISBN}`]: {
            title: "A Synthetic Book",
            authors: [{ name: "Ada Example" }],
            publishers: [{ name: "Test Press" }],
            publish_date: "May 2004",
          },
        },
      },
    });
    assert.deepEqual(await createBibliography(client(fetch)).lookupIsbn(ISBN), {
      found: true,
      metadata: {
        source: "Open Library",
        kind: "book",
        title: "A Synthetic Book",
        authors: ["Ada Example"],
        publisher: "Test Press",
        publishedDate: "2004",
      },
    });
  });

  it("reports an ISBN Open Library does not know as not found, and throws when it is down", async () => {
    const unknown = fakeFetch({ [OPEN_LIBRARY]: { body: {} } });
    assert.deepEqual(
      await createBibliography(client(unknown.fetch)).lookupIsbn(ISBN),
      { found: false },
    );
    const down = fakeFetch({ [OPEN_LIBRARY]: { status: 500 } });
    await assert.rejects(
      createBibliography(client(down.fetch)).lookupIsbn(ISBN),
      /Open Library answered with an error \(500\)/,
    );
  });
});

describe("lookup hardening", () => {
  it("treats a connection that dies mid-answer as unavailable", async () => {
    const dying: Fetch = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"message":'));
            controller.error(new TypeError("terminated"));
          },
        }),
        { status: 200 },
      );
    await assert.rejects(
      createBibliography(client(dying)).lookupIsbn(ISBN),
      /Open Library stopped answering/,
    );
  });

  it("ignores a Crossref record for a different DOI", async () => {
    const { fetch } = fakeFetch({
      [CROSSREF]: {
        body: { message: { DOI: "10.5555/other", title: ["Another work"] } },
      },
      [HANDLE]: { status: 404, body: { responseCode: 100 } },
    });
    assert.deepEqual(
      await createBibliography(client(fetch)).lookupDoi("10.5555/synthetic-1"),
      { found: false },
    );
  });

  it("encodes dot segments so a DOI cannot point the request elsewhere", async () => {
    const { fetch, requested } = fakeFetch({});
    await createBibliography(client(fetch)).lookupDoi("10.5555/../works/x");
    assert.equal(
      requested[0]?.url,
      "https://api.crossref.org/works/10.5555/%2E%2E/works/x",
    );
  });
});

describe("Google Books backup", () => {
  const GOOGLE = `https://www.googleapis.com/books/v1/volumes?q=${ISBN}&maxResults=20`;
  const volume = (identifier: string, title: string) => ({
    volumeInfo: {
      title,
      authors: ["Ada Example"],
      publishedDate: "2004-05-01",
      industryIdentifiers: [{ type: "ISBN_13", identifier }],
    },
  });
  const withKey = (fetch: Fetch, errors: string[] = []) =>
    createBibliography(client(fetch), {
      googleBooksApiKey: "test-key",
      onBackupError: (message) => errors.push(message),
    });

  it("finds a book Open Library does not know, by exact ISBN, sending the key in a header", async () => {
    const { fetch, requested } = fakeFetch({
      [OPEN_LIBRARY]: { body: {} },
      [GOOGLE]: {
        body: {
          items: [
            volume("9780000000019", "Near match"),
            volume(ISBN, "Exact match"),
          ],
        },
      },
    });
    const result = await withKey(fetch).lookupIsbn(ISBN);
    assert.deepEqual(result, {
      found: true,
      metadata: {
        source: "Google Books",
        kind: "book",
        title: "Exact match",
        authors: ["Ada Example"],
        publisher: undefined,
        publishedDate: "2004-05-01",
      },
    });
    const google = requested.find((request) => request.url === GOOGLE);
    assert.equal(google?.apiKey, "test-key");
    assert.doesNotMatch(google?.url ?? "", /test-key/);
  });

  it("never counts a near match", async () => {
    const { fetch } = fakeFetch({
      [OPEN_LIBRARY]: { body: {} },
      [GOOGLE]: { body: { items: [volume("9780000000019", "Near match")] } },
    });
    assert.deepEqual(await withKey(fetch).lookupIsbn(ISBN), { found: false });
  });

  it("is not asked when Open Library finds the book, or without a key", async () => {
    const found = fakeFetch({
      [OPEN_LIBRARY]: { body: { [`ISBN:${ISBN}`]: { title: "Known" } } },
    });
    await withKey(found.fetch).lookupIsbn(ISBN);
    assert.equal(found.requested.length, 1);
    const noKey = fakeFetch({ [OPEN_LIBRARY]: { body: {} } });
    await createBibliography(client(noKey.fetch)).lookupIsbn(ISBN);
    assert.equal(noKey.requested.length, 1);
  });

  it("never makes the answer worse when it fails, and reports the failure", async () => {
    const errors: string[] = [];
    const busy = fakeFetch({
      [OPEN_LIBRARY]: { body: {} },
      [GOOGLE]: { status: 503 },
    });
    assert.deepEqual(await withKey(busy.fetch, errors).lookupIsbn(ISBN), {
      found: false,
    });
    const badKey = fakeFetch({
      [OPEN_LIBRARY]: { body: {} },
      [GOOGLE]: { status: 400 },
    });
    assert.deepEqual(await withKey(badKey.fetch, errors).lookupIsbn(ISBN), {
      found: false,
    });
    assert.deepEqual(errors, [
      "Google Books answered with an error (503).",
      "Google Books answered 400.",
    ]);
  });

  it("answers when Open Library is down, and otherwise keeps the outage", async () => {
    const rescued = fakeFetch({
      [OPEN_LIBRARY]: { status: 500 },
      [GOOGLE]: { body: { items: [volume(ISBN, "Exact match")] } },
    });
    const result = await withKey(rescued.fetch).lookupIsbn(ISBN);
    assert.equal(result.found && result.metadata.source, "Google Books");
    const bothDown = fakeFetch({
      [OPEN_LIBRARY]: { status: 500 },
      [GOOGLE]: { status: 503 },
    });
    await assert.rejects(
      withKey(bothDown.fetch).lookupIsbn(ISBN),
      /Open Library answered with an error/,
    );
  });
});
