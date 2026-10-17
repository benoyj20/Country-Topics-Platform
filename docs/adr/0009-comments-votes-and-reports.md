# 0009: Comments, votes, and reports

- Date: 2026-10-17
- Status: Accepted

## Context

MVP week 9 adds the first part of F6: members discuss a topic in two
levels, vote on comments, sort them, and report the ones that break the
rules. Moderation (hiding, locking, acting on reports), rate limits,
Turnstile, link limits for new accounts, and reply notifications come in
week 10.

This is the first content that members write. Until now every write went
through the admin panel and Payload's access rules, which are staff-only.
AGENTS.md asks that:

- roles are enforced on the server for every write;
- personal data loads through separate uncached requests;
- public GET responses set explicit cache headers;
- lists use cursor pagination and indexed queries.

[ADR 0007](0007-public-pages-and-caching.md) caches topic pages for an hour
and purges them on publish. [ADR 0008](0008-browsing-and-search.md) left
"Most discussed" for when comments exist.

## Decision

- **Three Payload collections, written through `/api/v1`.**
  - The collections are `comments`, `comment-votes`, and
    `comment-reports`. Payload owns their schema and migrations, and lets
    verified staff read comments and reports in the admin panel. Votes are
    hidden there.
  - Payload's own API refuses every write to them, and refuses members
    any read.
  - Members write through `/api/v1` route handlers. The rules live in
    `apps/web/src/comments/store.ts`, which runs parameterised SQL on the
    collections' tables, and in `packages/domain` (`comments.ts`).
- **Two levels.**
  - A comment with no parent starts a thread. A reply's parent must be a
    thread in the same topic.
  - "Reply" on a reply answers its thread, so discussions never go deeper.
- **Who can do what.**
  - Anyone can read the comments of a published topic, archived ones
    included.
  - Any signed-in account can comment, reply, vote, and report. Staff have
    no extra powers here yet.
  - Members cannot vote on or report their own comments.
  - Staff cannot hide or remove a comment yet; that is week 10's
    moderation. Nothing is deployed and no tester is invited before the
    pilot (week 12), so no one can post until then except the developer.
  - An archived topic's discussion is closed: no new comments or votes
    (409). Its comments can still be reported.
  - Topics that were never published have no discussion (404).
- **Public names.**
  - A member chooses a display name before their first comment. It is the
    only thing about the author a comment shows.
  - Their email, sign-in name, and account id never appear in an answer.
  - Names are 2 to 40 letters, digits, spaces, and `. ' _ -`, in any
    script, so a name cannot hide text.
  - Names that could pass for staff or the site are refused: any with the
    word admin, administrator, moderator, mod, staff, or official, or with
    "Country Topics". So are the page's own stand-ins for a name ("You",
    "Former member", "Deleted account", "Anonymous").
  - Changing it changes it on past comments. The change is in the audit
    log, with the member as the actor.
  - Names are not unique. Impersonation is a moderation matter (week 10).
- **Comments are plain text.**
  - The server tidies a comment: it normalises Unicode (NFC), keeps line
    breaks, trims trailing spaces and runs of blank lines, and removes
    control and bidirectional override characters.
  - Comments are 1 to 5,000 characters.
  - The page shows the text as text, never as HTML or links. Links come
    with the link limits in week 10.
- **Votes.**
  - A vote is up (1) or down (-1); 0 takes it back.
  - Each comment keeps its score (up votes minus down votes), changed in
    the same transaction as the vote by a relative update.
  - A lock per member and comment makes two votes at once from one member
    count once. A unique index on (comment, voter) backs it.
  - Votes do not change a comment's `updatedAt`, so they never re-index
    the topic.
- **Reports.**
  - A report has a reason (spam, abuse, misleading, off topic, or
    something else) and a note of up to 500 characters. The note is
    required for "something else".
  - A member reports a comment once; reporting it again changes nothing
    (200).
  - Reports change nothing that visitors see until moderation arrives.
- **Sorting and paging.**
  - Threads sort by top (score, then newest), newest, or oldest. Replies
    are always oldest first.
  - Each page has 20 threads, each with its first 5 replies. The rest of
    a thread's replies load 50 at a time.
  - Paging uses keyset cursors on compound indexes. A score that changes
    between pages can make "top" repeat or skip a comment; dates and ids
    never change.
- **The API.**
  - Public lists:
    - `GET /api/v1/topics/[slug]/comments?sort=&cursor=` gives a page of
      threads, the topic's comment count, and whether it is open.
    - `GET /api/v1/comments/[id]/replies?cursor=` gives more replies.
    - Both answer only canonical requests, as `GET /api/v1/topics` does:
      unknown parameters get 400, and another spelling a 308.
    - Both send
      `public, max-age=0, s-maxage=15, stale-while-revalidate=60`.
  - Personal, `private, no-store`, read from the primary database:
    - `GET /api/v1/account/comments?ids=` gives the reader's votes,
      reports, and own comments among up to 200 ids, and their display
      name. Visitors get an empty answer.
  - Writes:
    - `POST /api/v1/topics/[slug]/comments` posts a comment or a reply.
    - `PUT /api/v1/comments/[id]/vote` sets a vote.
    - `POST /api/v1/comments/[id]/reports` sends a report.
    - `PUT /api/v1/account/display-name` sets the display name.
  - Every write needs the site's own origin (the same check as Payload's
    sign-in strategy) and a session. It takes JSON only (415 otherwise),
    up to a size limit (413; the body is never read past it), with fields
    checked by zod (400).
  - Errors have one shape: `{ error, problems, code? }`. Clients act on
    `code`, such as `display-name-required` or `closed`.
- **The page.** The topic page stays cached as ADR 0007 describes. Its
  discussion loads in the browser:
  - the list comes from the public API;
  - the reader's part comes from the personal one;
  - what the reader posts or votes shows at once, without asking for the
    list again;
  - visitors see the comments and a link to sign in.
- **Most discussed.**
  - Search documents carry each topic's comment count, replies included,
    and `/topics` sorts by it ("Most discussed").
  - A new comment queues the topic for the search index.
  - A document's version includes its comments' latest `updatedAt`.
  - Comments, votes, and reports take their timestamps from the web
    process, as Payload does for every other table, not from the
    database's `now()`. A version compares timestamps across tables, and
    two clocks would let an older document win.
  - The migration adds the column and its index to `search_topics`.
- **Reads and writes.**
  - Public lists read through one small pool on the read connection, which
    search now shares (`apps/web/src/read-pool.ts`: six connections,
    five-second statement timeout).
  - Writes, and the reader's own state, use Payload's pool on the primary.

## Consequences

- **No rate limits yet.** A signed-in member can post or vote as fast as
  they like until week 10. Each comment also queues one search job. The
  pilot is invite-only, and week 10's limits must come before it starts.
- **Caching.**
  - A shared cache in front of the site (Cloudflare, week 12) may show a
    list up to 15 seconds old, and up to a minute stale while it
    refreshes.
  - The writer always sees their own changes.
  - Locally there is no shared cache.
  - Replies show at once on the replier's page; others see them on their
    next load.
- **Deleting an account** (week 11) keeps its comments, which then show no
  name, its votes in the scores, and its reports. Week 11 decides whether
  deletion should also remove or anonymise the comments' text.
- **Hiding comments** (week 10) must exclude hidden comments from lists,
  counts, and the search count, and change the comment's `updatedAt` so
  the topic is re-indexed.
- **Not built yet:**
  - editing or deleting one's own comment;
  - @mentions;
  - per-country and site-wide discussion threads;
  - "trending" (it needs a measure of recent activity);
  - staff badges next to names.
- Rolling back the migration drops the comments, votes, and reports, the
  display names, and the search index's comment counts.
