# 0007: Public pages, what they show, and how they are cached

- Date: 2026-10-17
- Status: Accepted; the public pages' caching and the thumbnails from
  YouTube's image server are superseded by [ADR 0014](0014-split-site-and-backend.md)

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
  - name and aliases;
  - photo, with its credit and licence;
  - links, and the Wikidata item.

  Anything else a profile says is held to the same standard as a topic:
  - The public part of a profile is a list of **statements**, one fact
    each. Every statement carries its own evidence (documents, images,
    archived web pages, or snippets, the same evidence rows topics use) and
    its own sources (references, each with the passage that supports it).
  - A statement is shown only while it passes the check for publishing a
    topic that names someone (`statementIsBacked` in `packages/domain`):
    - at least one piece of evidence;
    - at least one reference, every one confirmed;
    - every snippet's video found playable.

    Each statement is judged on its own; a statement that fails is left out
    and the others are still shown.
  - The check runs on every read, not on save. Individuals are not
    versioned, and editing a reference makes it "being checked" again,
    which hides the statements that cite it until the worker confirms it.
  - The one-line role or description, the bio, and the country roles with
    dates are notes for staff and are never shown publicly. To say any of
    them publicly, an admin adds it as a statement. The admin form says so.
  - A snippet in a statement names its speaker only when the speaker has a
    public page or is the person the profile is about; otherwise the clip is
    shown without the speaker's name.
  - Evidence and references that a profile statement uses cannot be
    deleted (409).
  - A file used as evidence for a shown statement is public, like topic
    evidence.

  A country page lists the people its listed topics name, in any of the
  three ways, not those whose profile mentions the country.
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

  Anything else answers 404, cached for a minute. Only ids of stored files
  reach the cached visibility check, so requests for made-up ids add nothing
  to the cache.
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
- Rolling back the profile-statements migration deletes the statements,
  their evidence rows, and their sources.
- A profile with many statements loads each statement's evidence and
  references in one batch, but still runs the evidence queries a topic page
  runs.
- Lists stop at 50 topics (12 on the home page) and say so. Paging arrives
  with week 8's search and filters.
