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
  const requested: { url: string; userAgent: string | null }[] = [];
  const fetch: Fetch = async (input, init) => {
    const url = String(input);
    requested.push({
      url,
      userAgent: new Headers(init?.headers).get("User-Agent"),
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
