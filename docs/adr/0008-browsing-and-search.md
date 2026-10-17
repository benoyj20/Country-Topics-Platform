# 0008: Browsing, filters, and search

- Date: 2026-10-17
- Status: Accepted

## Context

MVP week 8 adds F1: visitors browse every listed topic with filters,
sorting, and full-text search, and every filter state is a link that opens
the same results elsewhere. [ADR 0001](0001-initial-architecture.md) put
search on PostgreSQL full text behind a search adapter, to be replaced by
Meilisearch or OpenSearch when facet load requires it. AGENTS.md asks that:

- search indexing goes through the queue and runs in the worker;
- search indexes can be rebuilt from PostgreSQL;
- external services, search among them, sit behind adapters in `packages/`;
- reads that can use a replica go through the read connection;
- public GET responses set explicit cache headers.

[ADR 0007](0007-public-pages-and-caching.md) left `/api/v1` for the first
client that needs it, and lists stopping at 50 topics until paging came with
search.

## Decision

- **A search adapter in `packages/search`.**
  - `TopicSearchIndex` stores one document per listed topic. It filters on
    facets, ranks text, sorts, and pages with cursors. Any engine can
    implement it.
  - The PostgreSQL implementation keeps the documents in a
    `search_topics` table. Facets are arrays with GIN indexes, and the text
    is a weighted `tsvector`:
    - A: the title;
    - B: the summary, and the names of the topic's countries, category,
      tags, and people (with aliases);
    - C: the body's text;
    - D: evidence titles, snippet captions, and the clips' transcript lines.
  - Search words go through `websearch_to_tsquery` with the English
    configuration, so quotes, `or`, and `-word` work, and no input can cause
    a syntax error.
  - The table is a copy, not the source of truth. It has no foreign keys,
    and Payload's schema does not describe it; the migration creates it,
    with `search_topic_removals`, which remembers the version at which each
    topic left the index.
- **A document holds what the public pages show.**
  - Only listed topics are indexed: published and not archived.
  - The people a topic names come in the three ways ADR 0007 defines: its
    people, links in its text, and snippet speakers.
  - Evidence counts only while its file, snippet, or address exists.
  - Only a clip's own transcript lines are indexed, never pasted text
    outside the clip.
  - The integration tests compare each person's filter results with their
    public page.
- **The worker builds and writes documents.**
  - Publishing a topic queues a `search` job with the topic's id.
  - A change to something a document shows queues the published topics that
    show it:
    - a renamed person, country, category, or tag;
    - a snippet's speaker, language, caption, or transcript;
    - a file's name or type, which decides whether it can be shown.

    Draft saves queue nothing. The source query lists, beside each table it
    reads, that a hook must watch the fields it uses.
  - The worker reads each topic from the database as it is when the job
    runs. A listed topic is added or replaced; any other is removed.
  - Jobs are queued inside the save's transaction. Each carries the saved
    row's `updatedAt`, and the worker waits until the row shows it, as
    reference and video checks do.
  - Every document carries a version: the latest `updatedAt` of the topic
    and of every row it shows (countries, category, tags, people, snippets,
    files), so a rename makes a newer version too.
  - The index never replaces a newer version with an older one, nor removes
    a newer one. A removal is remembered with its version, so a job that
    read the topic before it was archived cannot add it back. Writes for one
    topic hold a per-topic advisory lock, so two workers, or two jobs at a
    time in one, cannot interleave them.
  - The worker rebuilds the whole index when it starts, which fills the
    table after the migration, and then every hour. A rebuild skips
    documents whose version has not changed, and removes documents of topics
    that are no longer listed.
  - The worker runs two search jobs at a time, so a publish is not held up
    behind a rebuild.
  - Unlike checks, a lost index job does not fail the save. It is logged,
    and the next rebuild catches up.
- **Visitors read through `GET /api/v1/topics`.**
  - It takes the same parameters as the page:
    - `q`;
    - `country`, `category`, `tag`, `person` (slugs), `evidence`, and
      `language`, each repeatable;
    - `references=1`, `from`, and `to`;
    - `sort`: `relevance`, `newest`, `updated`, or `referenced`;
    - `cursor`, for later pages.
  - It answers 400 with a list of problems for values that are not valid,
    for parameters it does not know, and for a cursor it did not issue.
  - It answers only the canonical form of a request: the same request
    written another way (order, repeats, defaults, the case of a language
    code) is redirected (308) to its canonical address. A request can then
    only miss the cache by asking for something different, and the page
    always asks in the canonical form.
  - Language codes are compared in lower case: the index stores them so.
  - Results come 20 to a page. The first page also has the total and each
    facet's counts. A facet is counted under every other filter but its
    own, so choosing a value never shrinks its own facet to that value.
  - Values within a facet match any; facets together must all match. A slug
    that matches no record matches no topics rather than being ignored.
  - The read model turns slugs into the index's ids and ids into names. The
    response contains no ids.
  - A `person` slug for someone without a public page matches nothing, and
    the response never shows their name.
  - The search reads use their own small pool on `DATABASE_REPLICA_URL`
    when set, with a five-second statement timeout.
- **Caching.**
  - The API answers with
    `Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=300`
    and is never kept in Next.js's cache. The worker updates the index and
    cannot purge Next.js's cache, so shared caches keep a response for at
    most a minute.
  - The lists of countries, categories, and tags that browsing labels with
    are cached in Next.js and purged by tag, like the pages.
  - The `/topics` page itself is the same for everyone and is cached like
    the other public pages.
- **The URL is the state.**
  - `/topics` reads its filters from the address and asks the API.
  - Filter and sort changes replace the address, and a new search adds a
    history entry. Both go through the browser's history API, which
    Next.js passes to `useSearchParams` without asking the server again.
  - Each change starts from the current address, so quick clicks in a row
    add up.
  - Every request has one canonical address: fixed parameter order, sorted
    values, and defaults left out. Equal filters share one URL and one
    cache entry. The page corrects a hand-edited address to that form and
    says which parts it left out or changed (a "from" date after "to" is
    swapped). Choosing a date that contradicts the other one clears the
    other.
  - Countries are grouped by region. On narrow screens the filters start
    folded.
  - "Copy link" copies the address.
  - The home page has a search box, and country, profile, and home lists
    link to `/topics` with their filter when they stop short.
- **Not yet.** "Most discussed" and "trending" need comments (week 9).
  Search-as-you-type, highlighted matches, and stemming for languages other
  than English are left for later.

## Consequences

- **Indexing delay.** A newly published topic appears in search after the
  worker indexes it: about half a second in the browser test, most of it
  the first retry while the publish commits. The topic page itself updates
  at once.
- **When the index is behind.** If a job is lost (Redis was down when the
  save queued it, or lost its data), search lags until the next hourly
  rebuild.
- **Clock skew between web containers.** Clocks that differ between web
  containers could make a job see an older version as current. The hourly
  rebuild corrects that too.
- **Every visit queries the database.** Results are not cached by Next.js,
  so each first-page visit runs one search and one facet query (a union of
  eight counts). The queries are indexed, which is enough for the pilot.
  The facet counts are the first thing to move to Meilisearch, behind the
  same adapter, when load requires it.
- **No rate limit yet.** Each new set of search words misses every cache.
  The search pool has four connections and a five-second statement
  timeout, so a flood of searches can make search answer 503 for a while,
  but it cannot hold more of the database than that. Rate limits come in
  week 10, and Cloudflare in week 12.
- **Facet limits.** Facets list their 100 most common values. A chosen value
  outside them shows without a count.
- **Pages need JavaScript.** Browsing needs it; without it, the page says
  so and points to the country pages.
- **One configuration.** The English text search configuration applies to
  all content. Names and words in other languages still match exactly, but
  are not stemmed.
- **Rolling back** the migration drops `search_topics`. Nothing is lost:
  applying it again and starting the worker rebuilds it.
- **Rebuild cost.** A rebuild reads every listed topic in batches of 100.
  At the pilot's size it takes well under a second.
