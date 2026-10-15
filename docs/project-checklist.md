# Project and testing checklist

Status snapshot: 14 October 2026. This is the current implementation and
verification checklist; [the MVP plan](mvp-plan.md) describes what comes next.

A checked item means the stated work or verification was completed, with the
evidence noted. An unchecked item still needs that evidence, even when related
code exists. Update this file in the same PR that changes the status.

## Current working flow

YouTube link → oEmbed lookup on a local Node server → editor player with start and
end times → pasted transcript parsed into timed segments → visitor preview with a
lazy-loaded privacy-enhanced player and synced transcript highlighting.

The site itself (`apps/web`) so far has sign-in (Google and email links,
invite-only), roles, staff authenticator checks, the admin panel with countries,
categories, tags, individuals, and versioned topics with a change log, a
placeholder home page, and a health check; see Weeks 1 to 4 below.

The snippet flow is a standalone prototype in `prototypes/youtube-snippet`. It has no
database, accounts, or persistence beyond the browser's `localStorage`, and it is
plain JavaScript; the typed version is built into `apps/web` in MVP week 6.

## Repository setup

- [x] Rules for contributors and coding agents (`AGENTS.md`, `CONTRIBUTING.md`),
  adapted from the AgentWatch repository for a solo developer (2026-10-14).
- [x] pnpm workspace, root scripts, Makefile, `.editorconfig`, `.gitattributes`.
- [x] Compose services: PostgreSQL 17 with pgvector, Valkey, Mailpit; configuration
  validated with `docker compose config --quiet` (2026-10-14).
- [x] CI workflow with `javascript` and `infrastructure` jobs.
- [x] Repo-local Claude Code skills and review agents in `.claude/`.
- [x] CI passing on GitHub for the first PR (`javascript` and `infrastructure`, PR #1,
  2026-10-14).
- [x] `main` protected on GitHub by the "Protect main" ruleset: PR required,
  `javascript`, `infrastructure`, and `GitGuardian Security Checks` required and up
  to date, review threads resolved, linear history, no force pushes or deletion,
  admin bypass. Squash-only merges, PR title as the squash title, merged branches
  deleted automatically (2026-10-14).
- [x] Secret scanning: the GitGuardian GitHub App scans every PR; its check passed
  on PR #2 and is required on `main` (2026-10-14).
- [x] Local services started with `make infra-up` and healthy: PostgreSQL 17.11 with
  pgvector 0.8.7 (vector query ran), Valkey answering `PING` and set/get, Mailpit
  receiving a test email over SMTP (2026-10-14).
- [ ] `pnpm typecheck` and `pnpm build` checking real code (they have nothing to
  check until `apps/web` exists).

## YouTube snippet prototype (F4 feasibility)

- [x] Link parsing for watch, youtu.be, shorts, embed, live, bare id, `t=` and
  `start=` (unit tests, 2026-10-13).
- [x] Transcript parsing for YouTube's transcript panel, `m:ss text` lines, SRT and
  WebVTT, and clipping to the snippet range (unit tests, 2026-10-13).
- [x] oEmbed lookup: title and channel; missing or private videos reported
  (manual `curl` checks, 2026-10-13).
- [x] Page loads without script errors; demo fills the editor, validation, parsed
  transcript, and preview card; clicking a transcript line seeks the player and
  highlights that line (headless Edge, 2026-10-13).
- [x] Real-browser playback with synced highlighting, and the manual transcript
  workflow on a real video using YouTube's transcript panel (reported working by
  the developer, 2026-10-14).
- [ ] Each edge case confirmed in a real browser: stop at the end time, snap back
  when dragged before the start, Replay, and the "watch full video" link.
- [ ] Time taken per clip by an admin, measured on several real videos.
- [x] Data API lookup with a real `YOUTUBE_API_KEY` loaded from `.env`: for the demo
  video, `/api/video` returned source "oembed + data api", duration 19, embeddable,
  public, not age-restricted (`curl`), and the page showed "via oembed + data api"
  and 0:19 (headless Edge, 2026-10-14).
- [x] Default clip end from the video length: pasting the demo link with no end set
  gave 0:00–0:19, the start plus 30 seconds capped at the length (headless Edge,
  2026-10-14).
- [ ] Age-restricted detection verified with a real age-restricted video.
- [ ] Behavior for a video with embedding disabled, verified with a real example.

## MVP milestones

See [the MVP plan](mvp-plan.md) for weeks 0–12.

### Week 0: accounts

- [x] Google Cloud project on the developer's personal Google account (2026-10-14).
- [x] YouTube Data API v3 key, restricted to that API, working in the prototype
  (2026-10-14).
- [x] Google OAuth web client: Google accepted the client ID with the
  `http://localhost:3000/api/auth/callback/google` redirect URL and confirmed the
  secret through its token endpoint (2026-10-14). Sign-in itself is built in week 2.
- [ ] Email provider (Brevo or Resend) with a verified sender, needed before the pilot.
- [ ] Before the pilot: Google's Testing mode allows at most 100 listed test users,
  so either list every tester and admin (100 at most) or publish the consent
  screen to Production.
- [ ] Cloudflare account, needed by week 10 (Turnstile) and week 12 (tunnel).

### Week 1: site and admin skeleton

- [x] Next.js 16.3.8 and Payload 3.90.2 in `apps/web`, on PostgreSQL through
  Payload's Postgres adapter: UUIDv7 primary keys, timezone-aware timestamps,
  committed migrations with automatic schema push off, a read replica used only
  when `DATABASE_REPLICA_URL` differs from `DATABASE_URL`, GraphQL off, and
  server configuration checked at startup (2026-10-14).
- [x] Admin panel opens locally: `/admin` led to Payload's "create your first user"
  screen (headless Edge, 2026-10-14). The dev server listens on `127.0.0.1` only.
- [x] `GET /api/v1/health` returned 200 `{"status":"ok"}` with
  `Cache-Control: no-store`; the home page sends `noindex, nofollow` and has no
  horizontal scroll at 390 px; `/api/users` refuses anonymous requests; the
  GraphQL route returns 404 (`curl` and headless Edge, 2026-10-14).
- [x] With the database stopped when the server started, the health check returned
  503 `{"status":"unavailable"}` and recovered to `ok` once it was back; every page
  sends `frame-ancestors 'self'`, `X-Frame-Options: SAMEORIGIN`, and `nosniff`
  (`pnpm start`, which also listens on `127.0.0.1` only, 2026-10-14).
- [x] Unit tests (11) and integration tests (3) pass locally. The integration tests
  rebuilt `countrytopics_test` from the migrations, and the development database
  kept its data (2026-10-14).
- [x] `make env` adds missing variables to an existing `.env` without changing set
  values, and generates `PAYLOAD_SECRET` (tested on scratch copies, 2026-10-14).
- [x] CI runs lint, typecheck, unit and integration tests against a PostgreSQL
  service, the build, and a check that generated Payload files and migrations
  match the config: all passed on PR #5, with the integration tests applying the
  initial migration to the CI database (2026-10-14).
- [ ] The developer creates the first admin account at `/admin` and signs in.
- [ ] Not in week 1: an email adapter (Payload logs emails to the console until
  week 2), Redis use, and `apps/worker`.

### Week 2: sign-in, roles, staff verification, invite-only

See [ADR 0002](adr/0002-sign-in-and-roles.md) for the design.

- [x] Email-link sign-in end to end: the web app queued the email, the worker sent
  it through Mailpit, and opening the link signed the person in and created their
  profile with the invitation's role. A used link is refused (integration tests,
  2026-10-14).
- [x] Invite-only: an uninvited address gets the same response but no email, and
  Better Auth refuses to create its account (`NOT_INVITED`, shown on the sign-in
  page). `ADMIN_EMAILS` addresses become admins; invitations record who invited and
  when they were accepted (integration tests, 2026-10-14).
- [x] A profile made before Better Auth (the week 1 admin) is kept as an admin by
  the migration and linked by email on first sign-in, with no duplicate
  (integration test; the development database's existing account kept its admin
  role, 2026-10-14).
- [x] Staff verification: an admin without a confirmed code is refused by the
  admin panel and the REST API (403); setting up the authenticator alone is not
  enough; after the code, both work. Five wrong codes lock verification (429).
  Members see only their own profile and cannot change their role (403)
  (integration tests, 2026-10-14).
- [x] Real browser (headless Edge, production build on the test database): sign-in
  page, link sent, account page, authenticator QR code, code confirmed, admin panel
  with Users, Invitations, and Audit Logs, and the replaced sign-out button. The
  sign-in page has no horizontal scroll at 390 px. `make reset-2fa` removed the
  test admin's authenticator and setup worked again (2026-10-14).
- [x] Google sign-in starts at `accounts.google.com` with the registered redirect
  URL `SITE_URL/api/auth/callback/google` (integration test, 2026-10-14).
- [x] Account creation, profile edits and role changes, deletions, and
  invitation changes are written to the append-only audit log (integration tests,
  2026-10-14).
- [x] The committed migration matches Better Auth's schema for its options
  (integration test, 2026-10-14).
- [x] Hardening from the code review, each with an integration or unit test
  (2026-10-14): parallel wrong codes still lock verification; once set up, the
  authenticator cannot be read back, switched off, or replaced from a session;
  staff writes from another origin are refused while the same write from the site
  works; deleting a profile ends that person's sessions and their used invitation
  does not readmit them; accounts with unverified addresses are refused; sign-in
  redirects stay on the site (`//` and `/\` tricks rejected).
- [x] CI runs these tests with Valkey and Mailpit services: all passed on PR #6,
  applying the five migrations to the CI database (2026-10-14).
- [ ] The developer signs in with Google and with an email link, sets up an
  authenticator, and opens the admin panel.
- [ ] Not built yet: Apple sign-in, backup codes for staff, members editing their
  name, account deletion (week 11), and a real email provider (before the pilot).
  Better Auth's rate limits are on outside tests but not yet verified (week 10).

### Week 3: countries, categories, tags, individuals

See [ADR 0003](adr/0003-countries-and-individuals.md) for the design.

- [x] Countries: the migrations load all 249 ISO 3166-1 entries (Debian
  `iso-codes`, with UN M49 regions; Antarctica and Taiwan have no M49 region) with
  UUIDv7 keys. They cannot be created or deleted through the API, and their codes
  cannot change; an admin can edit the display name and region, and the edit is
  audited (integration tests, 2026-10-14).
- [x] Categories and tags: an empty slug is filled from the name (`-2` when it is
  taken), also when an existing slug is cleared; invalid slugs are refused; creates, edits, and deletes are audited with
  the deleted values kept (integration tests, 2026-10-14).
- [x] Access: visitors, members, and admins without a confirmed authenticator code
  cannot read countries, categories, tags, or individuals (403); verified
  moderators can read but not write; verified admins can write (integration
  tests, 2026-10-14).
- [x] Individuals: name, aliases, role or description, countries with a role and
  a partial-date period, bio, links, Wikidata ID, and slug, all audited. Bad or
  over-long links (`javascript:`, over 2048 characters), impossible dates, an end
  before the start, malformed Wikidata IDs, and a Wikidata ID already in use are
  refused (integration and unit tests, 2026-10-14).
- [x] Duplicate warning: the same name or alias, ignoring case, accents,
  punctuation, and word order, is refused until "This is a different person" is
  ticked, on create and when a clashing alias is added later; of two
  simultaneous saves of the same name, only one gets through (the test fails
  without the lock). Similar spellings and Wikidata matches are listed by
  `/api/individuals/possible-duplicates`, which only verified staff can call,
  is never cached, and marks the matches the save would refuse. Names in
  Devanagari or Japanese that differ only by a vowel sign or voicing mark are
  not treated as the same (integration and unit tests, 2026-10-14).
- [x] Every migration rolls back with `payload migrate:down` to an empty
  database and applies again (test database, 2026-10-14); the week 2
  `auth_tables` rollback was fixed on the way.
- [x] Real browser (headless Edge, production build on the test database): the
  dashboard groups Content and Administration; the countries list shows the
  seeded entries; typing an existing name shows the warning with a checkbox,
  saving without it is refused with "The following field is invalid: This is a
  different person", and saving with it works; a similar spelling shows an
  information notice without the checkbox; a new name saves with its slug filled
  in; a country row picked by typing "Kenya", with "2019-05" as its start, is
  still there after reloading; no horizontal scroll at 390 px; no browser errors
  (2026-10-14).
- [x] CI ran these tests and the migration drift check: all passed on PR #7,
  applying the eight migrations to the CI database (2026-10-14).
- [x] Five individuals in the development database: one added by the developer
  in the admin panel, and four added by script at the developer's request, with
  names, aliases, descriptions, offices, and dates taken from Wikidata
  (2026-10-14).
- [ ] Not built yet: public pages for countries and individuals (week 7).
  Topics link individuals since week 4, and photos with their licence came with
  uploads in week 5.

### Week 4: topics, workflow, versions, change log

See [ADR 0004](adr/0004-topics-and-versions.md) for the design.

- [x] Drafts save without the publishing checks, record who saved them, and can
  be marked ready for review (state "In review") (integration tests, 2026-10-14).
- [x] Publishing needs a summary, body text, and a country; links in the body
  must be `http`, `https`, or `mailto` (a `javascript:` link is refused); each
  individual is linked at most once per role (integration and unit tests,
  2026-10-14).
- [x] Lifecycle: first publish, a draft of changes that leaves the live version
  untouched, a second publish refused without a change note and accepted with
  one, archive, and restore. Each publish adds a change log entry with its note,
  admin, and version, and an audit entry; every version is kept (integration
  tests, 2026-10-14).
- [x] Nothing published disappears: a published topic cannot be deleted or
  unpublished (alone or in bulk); a version of a published topic can only be
  restored as a draft, through the REST API as the admin panel does it, and a
  draft version cannot be restored over it; a duplicate is a fresh draft; an
  individual, tag, or category used by any topic version cannot be deleted (409);
  change log entries cannot be created, edited, or deleted through the API. The
  guard tests failed when the guards were removed (integration tests,
  2026-10-14).
- [x] Publishing two topics together gives each its own change log entry; draft
  saves and restores are in the audit log (integration tests, 2026-10-14).
- [x] Access: visitors, members, and admins without a confirmed authenticator code
  cannot read topics or the change log (403); verified moderators can read
  topics and versions but not write (integration tests, 2026-10-14).
- [x] Every migration rolls back with `payload migrate:down` and applies again
  (test database, 2026-10-14).
- [x] Real browser (headless Edge, production build on the test database): a
  topic written in the editor with Kenya as its country and published (state
  "Published"); after editing the title, "Publish changes" without a note is
  refused ("The following field is invalid: Change note"), and with a note it
  publishes (state "Updated") and the note box empties; the Versions tab lists
  the current and the previous published version; the change log lists both
  entries; no browser errors (2026-10-14). Lists opened directly show related
  names (countries, topics); in the long scripted run they stayed on "Loading…"
  without making their requests, as headless timers stall.
- [x] CI ran these tests and the migration drift check: all passed on PR #8,
  applying the nine migrations to the CI database (2026-10-14).
- [x] The developer tested writing and publishing a topic in the admin panel
  (2026-10-14).
- [x] Evidence and references, and the rule that a topic naming individuals
  needs evidence and a confirmed reference, came in week 5 (below).

### Week 5: evidence, references, file storage, link archiving

See [ADR 0005](adr/0005-evidence-and-references.md) for the design.

- [x] Files: images (JPEG, PNG, WebP) and PDFs are stored in S3-compatible
  storage (SeaweedFS locally) and served only to staff, with
  `X-Content-Type-Options: nosniff` and `private, no-store`; a text file named
  `.png`, an SVG, and a file without a licence are refused; a file used by a
  topic or as an individual's photo cannot be deleted (409), and a PDF cannot be
  a photo (integration tests, 2026-10-14).
- [x] References: DOIs and ISBNs are normalised (doi.org links, ISBN-10 to
  ISBN-13 with check digits); a reference needs a DOI, an ISBN, or a link; the
  same DOI cannot be used twice; saving queues a check, and the check result
  cannot be set through a request. The worker's result is stored only for the
  identifiers it checked, so a late job for an old DOI cannot confirm a new one;
  "not found" and "could not finish" stay distinct (integration and unit tests,
  2026-10-14).
- [x] "Look up" fills a reference from its DOI or ISBN; only verified admins can
  call it, responses are not cached, and a service that does not answer gives a
  clear 503 (integration tests with a fake service, 2026-10-14).
- [x] Publishing: a topic that names an individual (in its people list or by a
  link in its text) needs evidence and a reference; every cited reference must
  be confirmed and have a passage; archiving a published topic is never blocked
  by a reference edited since; references cited by any topic version cannot be
  deleted (409) (integration and unit tests, 2026-10-14).
- [x] Evidence links are queued for the Wayback Machine from the first draft
  save; a link's first copy is never replaced; archived links can be read by
  staff but written only by the worker (integration tests, 2026-10-14).
- [x] Link checks reach only public addresses on ports 80 and 443 (also after
  redirects and for IP literals such as 169.254.169.254), follow at most five
  redirects, and tell gone pages (404) from sites that refuse bots (403) and
  busy ones (503) (unit tests against a local server, 2026-10-14).
- [x] The guard tests failed when the evidence rule, the identifier match on
  check results, and the keep-the-first-copy rule were removed (2026-10-14).
- [x] Every migration rolls back with `payload migrate:down` to an empty database
  and applies again (test database, 2026-10-14).
- [x] Live services, checked once by hand with public sample identifiers:
  Crossref (its sample DOI 10.5555/12345678), the DOI system (10.1000/182), Open
  Library (ISBN 978-0-306-40615-7), and the Wayback Machine's CDX index answered
  as the adapters expect. Two findings changed the design: the Wayback
  "availability" API answered "no copy" even for example.com, and Google Books
  refused keyless requests (shared quota exhausted) (2026-10-14).
- [x] Google Books as an optional ISBN backup with the developer's API key
  (`GOOGLE_BOOKS_API_KEY`): only an exact ISBN match counts, it is asked only
  when Open Library does not find the book or is down, and a failure (503, a
  refused key) never changes the answer (unit tests, 2026-10-15). Live, with
  the key, Google answered without errors but found none of four well-known
  ISBNs, so it rarely helps for now (2026-10-15).
- [x] Real browser (headless Edge, production build on the test database, the
  worker running against it): a PNG uploaded with its licence and served with
  the headers above; "Look up" filled a reference from Crossref and another from
  Open Library; a third reference with only a link; the worker confirmed all
  three against the live services; a topic naming an individual was refused
  without evidence ("The following fields are invalid (2): Evidence,
  References"), then published with a web page as evidence and a confirmed
  reference; the evidence row showed the Wayback Machine copy found by the
  worker. The only browser error was a server action cut off by the script's
  navigation (2026-10-15).
- [x] CI ran these tests and the migration drift check: all passed on PR #9,
  applying the ten migrations to the CI database and storing uploads in its
  SeaweedFS service (2026-10-15).
- [ ] The developer adds three references to a topic.
- [ ] Not built yet: video snippets and transcript excerpts as evidence (week 6).
- [ ] Optional, after the pilot (v2): fresh Wayback Machine copies of evidence
  links. The code is in place and off; it turns on with a free Internet Archive
  account's keys (`WAYBACK_ACCESS_KEY`, `WAYBACK_SECRET_KEY`). Until then the
  worker finds existing copies only.
