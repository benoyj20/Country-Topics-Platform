# 0007: Public pages, what they show, and how they are cached

- Date: 2026-10-17
- Status: Accepted

## Context

MVP week 7 opens the site to visitors: a home page, country pages, topic
pages, and individual pages. Until now every collection was staff-only.
AGENTS.md asks that:

- public GET responses set explicit cache headers and cache tags;
- publishing purges by tag;
- personal data loads through separate uncached requests;
- every published statement about a named individual has linked evidence
  and a reference.

[ADR 0003](0003-countries-and-individuals.md) said visitors would read
through `/api/v1` routes rather than Payload's REST API.
[ADR 0006](0006-snippets-and-transcripts.md) left open whether video
thumbnails should be served through the site.

## Decision

- **Pages, not a public JSON API, for now.** The site serves:
  - `/`
  - `/countries/[slug]`
  - `/topics/[slug]`
  - `/individuals/[slug]`
  - `/files/[id]`

  The pages are server-rendered from a read model (`apps/web/src/public/`)
  that loads with Payload's local API, overrides access, and picks every
  field by name into JSON types. Payload's own access rules stay staff-only,
  so its REST API still refuses visitors. No `/api/v1` route serves content
  yet. The first one comes when a client needs it, such as week 8's filters,
  and will reuse the same read model.
- **What is public.**
  - A topic is public once published. Visitors see its live version, never
    a later draft. An archived topic keeps its page, with a notice, and
    leaves every list.
  - An individual is public while a published topic names them, in any of
    three ways:
    - in its list of people;
    - by a link in its text;
    - as the speaker of a snippet it uses as evidence.

    Individuals whom no published topic names have no page. Publishing
    applies the same three ways: a topic that quotes a speaker in a snippet
    names them, so it needs evidence and a reference like any topic that
    names someone. This reverses ADR 0006's rule that a speaker does not
    count. A speaker cannot be added later to a snippet that a published
    topic without a reference uses.
  - A file is public while a published topic uses it as evidence, or while
    it is the photo of a public individual.
  - Links in a topic's text to anything that is not public are shown as
    plain text.
- **What a profile shows.** A public profile shows who the person is and the
  topics that name them:
  - name, aliases, and the one-line role or description;
  - photo, with its credit and licence;
  - links, and the Wikidata item.

  The bio and the country roles with dates are the profile's own statements
  about the person, so they need sources like any published statement. An
  admin adds **sources** to the profile: references, each with the passage
  that supports it, as topics cite them. The quoted passage from a checked
  source is the linked evidence. The rules for showing them:
  - The bio and roles are shown, with a "Sources for this profile" list,
    only while the profile cites at least one source and every cited
    reference is confirmed (`profileIsBacked` in `packages/domain`).
  - This is checked on every read, not when the profile is saved:
    individuals are not versioned, and editing a reference makes it "being
    checked" again, which hides the bio until the worker confirms it.
  - A reference that a profile cites cannot be deleted (409).

  The admin form describes these rules. A country page lists the people
  named by its topics, not those whose profile mentions the country.
- **A save that does not publish never changes the live version.** Payload
  writes the live topic for any update sent without `draft`, which would
  skip the change note, the change log, and the purge. Such an update is
  saved as a draft instead, so publishing is always explicit.
- **Topics record the individuals their text links to**
  (`linkedIndividuals`), so "which topics name this person" is one indexed
  query. The server keeps it on every save. The migration fills it in for
  existing topics and versions. Like the list of people, it keeps an
  individual from being deleted.
- **Caching: whole pages, refreshed on purge.** Pages use Next.js's
  incremental static regeneration (the model without Cache Components):
  - **When pages are rendered.** Topic, country, and individual pages are
    rendered on their first visit. The home page is rendered at build time.
  - **How long they last.** Every page and its data are kept for up to an
    hour (`revalidate = 3600`, `PUBLIC_REVALIDATE_S`).
  - **Headers.** Next.js sends
    `Cache-Control: s-maxage=3600, stale-while-revalidate=…`.
  - **Tags.** The read model is cached with `unstable_cache` and tagged with
    each collection it reads (`public:topics`, `public:individuals`, and so
    on). A page carries the tags of the data it used. Per-collection tags
    re-render more than necessary, but they cannot miss a dependency, and
    the site is small.
  - **What purges, and when.**
    - Publishing a topic purges `public:topics`; a draft save purges
      nothing.
    - Any change to individuals, countries, categories, tags, snippets,
      references, or files purges that collection's tag.
    - The purge (`revalidateTag` with `expire: 0`) runs in Next.js's
      `after()`, once the response is sent. Payload commits just before its
      route returns, while hooks run inside the transaction. Purging from
      the hook itself could let a visitor's request in between re-cache the
      old page.
    - Outside a web request (a script using Payload's local API) there is
      no page cache to reach: the save goes ahead without a purge, and the
      pages refresh within the hour.
    - The next visit renders the page again, so an admin who publishes sees
      the change at once.
  - Cache Components would change every route, including sign-in, the
    account page, and the admin panel; it can be reconsidered separately.
- **Files** are served by `/files/[id]`. Once the read model says a file is
  public, the route calls the storage plugin's own handler, as Payload's
  file route does after its access check. Storage keys, range requests, and
  revalidation (304) work the same. The route sets these headers:
  - the type checked on upload, and `nosniff`;
  - Payload's content security policy for uploads;
  - `Cache-Control: public, max-age=3600`.

  Anything else answers 404, cached for a minute.
- **Personal data stays out of cached pages.** The header's "Sign in" or
  "Your account" link comes from the session the browser asks for after
  loading. The change log shows each change's date, kind, and note, but not
  which staff member made it.
- **Video thumbnails** still load from YouTube's image server, which sets no
  cookies. The pilot is invite-only and not indexed. The decision is
  revisited with the consent banner after the pilot. The player itself still
  loads only on a click.

## Consequences

- **The cache belongs to one web process** (Next.js's default memory and
  disk cache). That is enough for the pilot's single web container. With two
  or more (week 11's scale rehearsal), a purge would reach only the instance
  that handled the save. The others would serve stale pages for up to an
  hour, and their caches would sit on local disk. That breaks AGENTS.md's
  "shared page cache in Redis" rule until a Redis cache handler (Next.js's
  `cacheHandler`: entries and tag times in Redis) replaces the default.
  Week 11 must add it before running two web containers.
- **Changes the site does not purge for** show within the hour:
  - the worker's results (a video found removed, a new archived copy);
  - edits made outside a web request, such as scripts.

  A removed video is also caught by the visitor's player, which then shows
  the transcript and a notice.
- **A CDN** in front of the site may keep a page for up to `s-maxage` after a
  purge. When Cloudflare is added (week 12), publishing should also purge
  the CDN by URL, or the shared-cache lifetime should be shortened.
- **A file taken out of a topic** can stay in browser and shared caches for
  up to an hour. Files are never deleted while anything uses them.
- `next build` renders the home page, so building needs the database. CI has
  one. A container image build (week 11) must provide one or render the home
  page on request.
- One set of sources backs the whole bio and every role; there is no
  per-sentence citation. An admin keeps the bio to what the sources say, as
  the field's description asks.
- Rolling back the profile-sources migration deletes the sources table and
  its rows.
- Lists stop at 50 topics (12 on the home page) and say so. Paging arrives
  with week 8's search and filters.
