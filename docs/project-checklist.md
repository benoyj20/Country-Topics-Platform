# Project and testing checklist

Status snapshot: 17 October 2026. This is the current implementation and
verification checklist; [the MVP plan](mvp-plan.md) describes what comes next.

A checked item means the stated work or verification was completed, with the
evidence noted. An unchecked item still needs that evidence, even when related
code exists. Update this file in the same PR that changes the status.

## Current working flow

In the admin panel: YouTube link → editor player (loaded on click) with start and
end times → pasted transcript parsed into timed segments → visitor preview with a
lazy-loaded privacy-enhanced player and synced transcript highlighting → save →
the worker checks the video with YouTube → the snippet is used as topic evidence.

The site itself (`apps/web`) so far has sign-in (Google and email links,
invite-only), roles, staff authenticator checks, the admin panel with countries,
categories, tags, individuals, versioned topics with a change log, evidence and
references, video snippets, public pages for visitors (home, countries,
topics, individuals, and the files they show), browsing and search of every
topic at `/topics`, members' comments with replies, votes, and reports,
moderation in the admin panel, rate and link limits, Turnstile on the email
sign-in form, in-app notifications, account deletion and data download,
feedback, draft privacy policy and terms, daily backups with a checked
restore, error reporting to Sentry, and a health check; see Weeks 1 to 11
below.

The snippet flow began as a standalone prototype in `prototypes/youtube-snippet`
(plain JavaScript, no database); its typed version is in the site since MVP week 6.

## Repository setup

- [x] Rules for contributors and coding agents (`AGENTS.md`, `CONTRIBUTING.md`),
  adapted from the AgentWatch repository for a solo developer (2026-10-14).
- [x] pnpm workspace, root scripts, Makefile, `.editorconfig`, `.gitattributes`.
- [x] Compose services: PostgreSQL 17 with pgvector, Valkey, Mailpit; configuration
  validated with `docker compose config --quiet` (2026-10-14). pgvector was
  dropped in the split's phase 0 (ADR 0014).
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
- [ ] Cloudflare account, needed before the pilot: real Turnstile keys (built in
  week 10, off until set) and the tunnel (week 12).

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
- [x] The developer signs in with Google and with an email link, sets up an
  authenticator, and opens the admin panel (Google sign-in with an
  authenticator reported done by the developer, 2026-10-16, the part still
  open after week 2).
- [ ] Not built yet: Apple sign-in, backup codes for staff, members editing their
  name, and a real email provider (before the pilot). Better Auth's rate
  limits were verified in week 10, and account deletion was built in week 11
  (see there).

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
- [x] Public pages for countries and individuals came in week 7 (below);
  profiles show who a person is, the topics that name them, and only the
  profile statements that carry their own evidence and confirmed sources;
  the one-line description, bio, and country roles are staff notes.

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
- [x] Fixed in week 6: a check queued by saving a reference again (one "not
  found" or "could not finish", or with changed identifiers) could be dropped
  when the worker ran before the save committed, leaving the reference "being
  checked". The save now stores the request's time and the job carries the
  same value, so the worker waits until the save is visible without comparing
  clocks; the worker also queues every waiting check again when it starts
  (integration test that fails without the fix, 2026-10-16).
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
- [x] The developer uploaded a file, added three references (DOI, ISBN, and
  link, each confirmed by the worker), and published and then archived a TEST
  topic with evidence; this found that the change note could not be typed
  in, which is fixed with a regression test (2026-10-16).
- [x] Video snippets and their transcripts as evidence came in week 6 (below).
- [ ] Optional, after the pilot (v2): fresh Wayback Machine copies of evidence
  links. The code is in place and off; it turns on with a free Internet Archive
  account's keys (`WAYBACK_ACCESS_KEY`, `WAYBACK_SECRET_KEY`). Until then the
  worker finds existing copies only.

### Week 6: video snippets and transcripts

See [ADR 0006](adr/0006-snippets-and-transcripts.md) for the design.

- [x] Parsing ported to TypeScript (`packages/domain`): links (watch, youtu.be,
  shorts, embed, live, bare id, `t=` and `start=`), times, YouTube's transcript
  panel, `m:ss text` lines, SRT, WebVTT, clipping to the snippet, timestamps
  counted from the clip's start, and clip checks; the prototype's tests pass on
  the port, plus cases for impossible timestamps and lines outside the clip
  (unit tests, 2026-10-16).
- [x] Snippets: a pasted link is stored as its video id; times are kept in
  tenths; the server computes the transcript segments from the pasted text on
  every save (moving the clip recomputes them); no transcript is allowed, while
  text without timestamps or with no line inside the clip is refused, as are
  reversed or negative times, bad or overlong language codes, and an end more
  than a second past the video's known length; once a topic uses a snippet,
  its video cannot change. Edits are versioned and audited (integration tests,
  2026-10-16).
- [x] Videos: one record per YouTube id, added by the first snippet's save, with
  one queued check per request however many snippets save it; the worker's
  result is stored only while a check is awaited, and a job that arrives before
  its save commits waits instead of being dropped; a video waiting without a
  request time gets one when a snippet of it is saved; the worker's start-up
  pass finds every waiting reference and video as the job it needs; the first time a video was found playable is
  kept; a later "removed" keeps the title and length found before; saving a
  snippet of a video that does not play asks again. Videos, their checks, and a
  snippet's video and segments cannot be set through requests (integration and
  unit tests, 2026-10-16).
- [x] Access: verified admins write snippets; moderators read them; visitors
  and unverified admins are refused (403). Videos used by snippets, snippets
  used by topics, and individuals named as speakers cannot be deleted (409)
  (integration tests, 2026-10-16).
- [x] Publishing: a "Video snippet" evidence row needs no title and keeps only
  its snippet; a topic is refused while a snippet's video was never found
  playable, and publishes once the worker confirmed it (integration tests,
  2026-10-16).
- [x] YouTube adapter (`packages/sources`): oEmbed statuses, the Data API's
  length, embedding, privacy, and age restriction, the key sent only in a
  header, and Data API failures that keep oEmbed's answer (unit tests). Live,
  with the developer's key: the prototype's demo video was found playable,
  19 seconds long, titled "Me at the zoo" by "jawed"; an invented id was found
  removed or private, with and without the key (2026-10-16).
- [x] The migrations roll back with `payload migrate:down` on an empty test
  database and apply again; with snippet evidence present, the snippet
  migration's rollback refuses with a message instead of deleting evidence
  (test database, 2026-10-16).
- [x] Real browser (headless Edge, production build on the test database, the
  worker running against it with the YouTube key): no YouTube script or player
  before a click; "Load video" opened the privacy-enhanced player, which
  (when it reported the length, 19 s) proposed a default end; typed times
  commit with Enter; an end of 0:25 showed "End is past the end of the video
  (0:19)", and a cleared end showed an error instead of a default; the
  transcript summary said "3 lines in the clip · 1 line outside it left out ·
  1 line before the first timestamp ignored"; the preview listed the three
  lines; clicking the thumbnail played the clip with the highlight moving from
  0:01 to 0:05, clicking the last line jumped to 0:12, and playback stopped at
  the clip's end (0:17) with "Snippet ended", Replay, and "Watch the full
  video on YouTube" (`watch?v=…&t=1s`); saving showed "YouTube check pending",
  and after the worker's check "Playable on this site. Me at the zoo · jawed ·
  0:19"; a topic naming an individual published with the snippet as evidence
  and a confirmed reference; no browser errors (2026-10-16, final code). In
  one earlier headless run the first click loaded the player without starting
  playback (a second click on a line played it); worth watching for in a real
  browser.
- [x] The developer added a clip with a synced transcript in the admin panel,
  watched the preview play in sync in a real browser, saw the worker confirm
  the video, and went through the rest of the test steps, including the
  player's edge cases: the first click starts playback, stop at the end time,
  snap back when dragged before the start, Replay, and the "watch full video"
  link (reported by the developer, 2026-10-17). The first save showed "YouTube
  check pending" for good because a `make dev` started before the day's
  changes still ran the old queue code; after restarting it, saving again
  queued the check.
- [x] Public topic pages showing snippets came in week 7 (below).
- [ ] Not built yet: periodic re-checks of videos, and transcript excerpts
  without a video.

### Week 7: public pages and caching

See [ADR 0007](adr/0007-public-pages-and-caching.md) for the design.

- [x] Visibility: a topic is public once published, and visitors see its live
  version, never a later draft; an archived topic keeps its page but leaves
  the home, country, and individual lists; drafts and unknown slugs have no
  page. An individual has a page while a published topic names them (in its
  people, by a link in its text, or as a snippet's speaker), and not
  otherwise. A file is public as evidence of a published topic or as a
  public individual's photo; an unused file and the photo of a person no
  topic names are not (integration tests, 2026-10-17).
- [x] Public fields only: page data carries no editor, check details, pasted
  transcript text outside the clip, staff email, or later draft; links in a
  topic's text to a draft topic become plain text (integration tests,
  2026-10-17).
- [x] Profile statements: each is shown only with its own evidence and its
  own sources, every source confirmed and every snippet's video found
  playable; a statement without evidence, without sources, with a source
  still being checked, or with an unchecked video is left out while the
  others show; editing a confirmed source hides its statement again; the
  one-line description, bio, and country roles never appear; a snippet in a
  statement names its speaker only when the speaker has a public page;
  evidence and references a statement uses cannot be deleted (409); a
  statement's file is public only while the statement is shown on a public
  profile (integration and unit tests, 2026-10-17).
- [x] A second code review of the branch, run at the developer's request
  after the profile change, found ten issues; all were fixed, each with a
  test where behavior changed (2026-10-17): the file check now refreshes
  when a reference changes; profile snippets hide non-public speakers; the
  one-line description is staff-only; made-up file ids no longer reach the
  cache; the speaker guard also needs every reference confirmed; country
  pages list everyone their topics name; a body link with a missing
  document still names someone; shared helpers replace two copies.
- [x] Topics record the individuals their text links to, on every save and,
  by the migration, for existing topics and versions; such an individual
  cannot be deleted (409). On the test database the migration's statements
  rebuilt exactly the six rows the save hook had recorded (one live topic,
  five versions), and the migration rolled back and applied again on the
  development database (integration tests and SQL check, 2026-10-17).
- [x] Purges: publishing a topic purges the topic pages and lists, a draft
  save does not, and a change to any other shown collection purges its pages
  (integration tests with Next.js's request APIs replaced by recorders,
  2026-10-17). Outside a web request, as in a script, a save goes ahead
  without a purge (unit test against the real Next.js `after()`).
- [x] Fixed on the way: an update sent without the draft flag rewrote a
  published topic's live version with no change note or change log entry
  (a gap since week 4); it is now saved as a draft (integration test).
- [x] Snippet speakers count as people a topic names: publishing a topic
  that quotes a speaker needs a reference, and a speaker cannot be added to
  a snippet that a published topic without a reference uses (integration
  tests, 2026-10-17).
- [x] Files are read through the storage plugin's handler, so range
  requests (206) and revalidation (304) work (integration tests,
  2026-10-17).
- [x] The guard tests failed when the published filter, the purge on
  publish, the recording of body links, the speaker rule, the draft rule,
  and the profile statement rule were removed (2026-10-17).
- [x] Real browser and HTTP (headless Edge and `fetch`, production build on
  the test database, the worker running against it with the YouTube key):
  topic, home, country, and individual pages answered 200 with
  `s-maxage=3600, stale-while-revalidate=…`, and a second visit was a cache
  hit; the topic page showed the person, the image, the archived link, the
  snippet, and the reference; the image came from `/files/[id]` as
  `image/png`, `public, max-age=3600`, `nosniff`; an unknown topic and file
  gave 404; no staff email in the pages. Publishing a new title showed it on
  the topic page and the home page on the next request, with the change
  note; a draft save did not change the page; editing the individual's
  summary showed on their page; a profile statement appeared only once it
  had evidence and a confirmed source, with both under "Evidence and
  sources". No YouTube script or player before a click,
  then the privacy-enhanced player; the header said "Your account" when
  signed in and "Sign in" after clearing cookies; at 390 px the topic, home,
  country, and individual pages had no horizontal scroll; no browser errors
  (2026-10-17).
- [x] Found in the developer's manual test: a profile whose links already
  included its Wikidata page listed it twice (React's duplicate key
  warning). Links are now listed once each, with the Wikidata item added
  only when no link goes there (unit tests, 2026-10-17).
- [x] The developer browsed as a visitor in `make dev`: home, country,
  topic, and individual pages, the archived topic with its snippet player,
  a private profile's 404, phone width in the browser's device mode, profile
  statements (a backed one shown, an unbacked one and the bio hidden), and
  the signed-in header link; everything worked after the duplicate Wikidata
  link fix (reported by the developer, 2026-10-17).
- [x] Before running two web containers (week 11): a shared Redis cache
  handler, so purges reach every instance and no cache sits on local disk.
  Built in week 11 (see there, and ADR 0013).
- [x] Paging past 50 topics, filters, and search came in week 8 (below):
  lists that stop short link to `/topics` with their filter.
- [x] Video thumbnails come through the site since ADR 0014's phase 5
  (`/thumbnails/:id` in `apps/frontend`); the new admin's snippet editor
  uses it since phase 9. Payload's panel's still loads YouTube's until the
  panel goes in phase 12.

### Week 8: browsing, filters, search, shareable links

See [ADR 0008](adr/0008-browsing-and-search.md) for the design.

- [x] Search index: publishing a topic queues it for the worker, and a
  draft save queues nothing; the worker's document of a topic has its
  countries, category, tags, everyone it names (people, links in its text,
  and snippet speakers), its evidence kinds, its snippets' languages, and
  its reference count; each person's filter finds exactly the topics their
  public page lists; an older read never replaces or removes a newer
  document; a job waits until the save that queued it is visible; a rebuild
  indexes every listed topic and drops documents of topics no longer listed
  (integration tests, 2026-10-17).
- [x] Keeping it current: renaming a person and changing a snippet's
  language re-index the topics that show them; archiving a topic takes it
  out of search (integration tests, 2026-10-17).
- [x] Search and filters: words in a topic's title, body, summary, its
  people's names, and what its snippets' speakers say find it; drafts and
  people named only in drafts are never found; any value within a facet and
  every facet together; a slug no record has matches nothing; facet counts
  ignore the facet's own choice; sorting by references; cursor paging
  returns every topic once for each sort (integration tests, 2026-10-17).
- [x] `GET /api/v1/topics`: answers with
  `public, max-age=0, s-maxage=60, stale-while-revalidate=300` and no ids;
  refuses values that are not valid and cursors it did not issue (400);
  a person slug without a public page matches nothing and their name never
  appears (integration tests, 2026-10-17). The URL parameters have one
  canonical form and read back to the same request (unit tests).
- [x] The guard tests failed when the queueing on publish, the snippet
  speakers in documents, the index's version check, the public-person check
  on typed slugs, the re-index on rename, and the facets' own-choice rule
  were removed (2026-10-17).
- [x] The code review before the first push found ten issues; all were
  fixed, each with a test that failed without the fix (2026-10-17): a job
  that read a topic before it was archived could add it back (removals are
  now remembered, and writes for a topic take turns); a rename did not make
  a newer version (a version now covers everything a document shows); the
  API answered any extra parameter, so requests could skip the cache
  (unknown parameters are refused, and other spellings of a request are
  redirected to its one address); a "from" date after "to" silently
  cleared both (a link has them swapped, with a notice; choosing one
  clears the other); titles of evidence the page hides were searchable;
  each rebuild rewrote every document and held up publishes (unchanged
  documents are skipped, and two jobs run at a time); language codes
  differed by case; a file's changes did not re-index its topics; a
  comment about the schedule was wrong; two helpers were copies.
- [x] Real browser and HTTP (headless Edge and `fetch`, production build on
  the test database, the worker on its own queue prefix): 23 topics
  published through the API were searchable about half a second later, a
  topic published while browsing was found after about half a second, and
  archiving it removed it as quickly; `/topics` answered
  `s-maxage=3600, stale-while-revalidate=…` and the API
  `public, max-age=0, s-maxage=60, …`; the API redirected another spelling
  of a request (308) to its one address and refused an unknown sort (400); "Show more topics" loaded the rest
  with no repeats; a search found the one topic with its word; choosing
  Iceland and "Recently updated" changed the address to
  `?country=iceland&sort=updated` and showed only Iceland's topics; "Copy
  link" copied that address, and opening it signed out in a fresh tab
  showed the same topics in the same order with the filter and sort
  chosen; a mistyped link kept its valid parts, said which parts it left
  out, and corrected the address; six quick clicks on one filter in a row
  ended where they should; at 390 px the filters started folded and no
  page scrolled sideways; the home page's search box led to the results;
  no browser errors (2026-10-17).
- [x] Found in the browser test and fixed: changing filters through the
  router asked the server for the page again on every change; the address
  now changes through the history API with no request. Quick clicks in a
  row each started from the same old filters; each change now starts from
  the current address.
- [x] Found when restarting `make dev` on the migrated development
  database: the hourly rebuild's first run waited for the next hour, so the
  new index stayed empty; the worker now also rebuilds when it starts
  (integration test, which failed without it; the development index then
  held its one listed topic, 2026-10-17).
- [x] Found in the developer's manual test: in development, where the
  browser component is also rendered on the server, `/topics` logged a
  hydration error. The filters' open state was read from the screen width
  during the first render, which the server cannot know. It now hydrates
  folded and opens once the width is known; no errors at 1280 and 390 px on
  three addresses in the development server (2026-10-17).
- [x] Noted, not a defect: a form submitted in the first few milliseconds
  of a page load, before its script runs, is a plain page load, which ends
  that page's link prefetches; React logs "Connection closed" on the page
  being left. No person can submit that fast; at a person's pace the
  search box navigated with no errors in every run.
- [x] The developer filtered, copied the link, and opened it elsewhere,
  after the hydration fix above (2026-10-17).
- [ ] Not built yet: sorting by "trending" ("most discussed" came with
  week 9), search-as-you-type, highlighted matches, and stemming for
  languages other than English.

### Week 9: comments, votes, sorting, reports

See [ADR 0009](adr/0009-comments-votes-and-reports.md) for the design.

- [x] Posting: a member must choose a public name before their first
  comment (409 with `display-name-required`); names are checked, tidied,
  and audited with the member as the actor, and names that could pass for
  staff, the site, or the page's own labels are refused (unit tests);
  comments are dated by the web process's clock, as Payload dates topics; comments are stored as tidied
  plain text under the public name, and no answer holds an email address
  or account id; visitors (401), other sites (403), bodies that are not
  JSON (415), and empty, overlong, or unknown fields (400) are refused
  (integration tests, 2026-10-17).
- [x] Two levels: a reply to a reply is refused (400), and a reply to a
  thread in another topic is not found (404); a topic that was never
  published has no discussion (404); an archived topic's discussion is
  closed to comments and votes (409) but stays readable and reportable
  (integration tests, 2026-10-17).
- [x] Lists: `public, max-age=0, s-maxage=15, stale-while-revalidate=60`;
  another spelling of a request is redirected (308), and unknown or
  repeated parameters and cursors it did not issue are refused (400);
  paging through 22 threads returns each once in all three orders, and
  "top" puts the highest score first; a thread shows its first five
  replies, and the rest page in order (integration tests, 2026-10-17).
  Parameters, ids, cursors, and body limits (unit tests).
- [x] Votes: one per member, changeable, and taken back with 0; six votes
  sent at once by one member count once; members cannot vote on their own
  comments; the reader's votes, reports, and own comments come from an
  uncached request, and visitors get none (integration tests,
  2026-10-17).
- [x] Reports: one per member and comment (201, then 200), with the reason
  and the trimmed note; a note is required for "something else"; members
  cannot report their own comments; verified staff read comments and
  reports through Payload's API, members cannot read or write any of the
  three collections there, and nobody browses votes (integration tests,
  2026-10-17).
- [x] Most discussed: a comment queues its topic for the search index, the
  document carries the topic's comment count, replies included, and
  `/topics` sorts by it (integration test, 2026-10-17).
- [x] The guard tests failed when the vote lock, the two-level rule, the
  own-comment vote check, the same-origin check, the display-name
  requirement, the closed archived discussion, and the search comment count
  were removed (2026-10-17).
- [x] Real browser (headless Edge, production build on the test database,
  the worker on its own queue prefix), two members invited by an admin and
  signed in by email link: a visitor saw "No comments yet." and a sign-in
  link back to the discussion; Alice chose her name with her first comment,
  which showed at once with its line break and a "You" label and no vote
  buttons; Bob up-voted it (1 point), chose his name in the reply form,
  replied under the thread, and reported it as off topic; after a reload
  his vote, report, and reply were still there; sorting by newest worked;
  at 390 px nothing scrolled sideways; Alice then saw Bob's reply and the
  score, could vote on his reply but not her own, and her account page
  showed her public name; `/topics` sorted by "Most discussed" with each
  topic's comment count; no browser errors (2026-10-17).
- [x] Found in the browser test and fixed: after Bob chose his name in the
  reply form, the main comment form still asked for it. Each form now
  follows the page's one record of the reader's name.
- [x] The code review before the first push found ten issues. Eight were
  fixed (2026-10-17):
  - comments were dated by the database's clock while topics use the web
    process's, so an older search document could win (a test sets the
    process clock an hour back and failed before the fix);
  - names such as "Admin" or "Former member" were allowed;
  - quick vote clicks could be sent out of order (one vote at a time per
    comment now; in the browser, two quick clicks ended with the page and
    the server agreeing);
  - "Show more comments" could add one order's comments to another's;
  - a posted reply could sit before older replies loaded later;
  - an older answer about the reader could undo a name just chosen, and a
    later failure turned commenting off while the form still worked;
  - the cast to Payload's database pool was unchecked;
  - repeated values and three copies of one helper.

  Two were left for week 10, before any tester is invited: staff cannot
  yet hide or remove a comment, and each comment queues one search job
  with no rate limit. Nothing is deployed, so no one but the developer can
  post until then.
- [x] The developer commented from two accounts (reported working,
  2026-10-17).
- [x] Moderation, rate limits (including the search job each comment
  queues), Turnstile, link limits, and reply notifications came in week 10.
- [ ] Not built yet: editing or deleting one's own comment, @mentions,
  per-country and site-wide threads, and "trending".

### Week 10: moderation, limits, Turnstile, notifications

See [ADR 0010](adr/0010-moderation-limits-and-notifications.md) for the design.

- [x] Hiding: a verified moderator hides a comment in the admin panel with
  a reason (refused without one, 400). The comment leaves the list and the
  count, its open reports are marked acted on with who resolved them, its
  author is told why, its topic's search count drops, and the change is
  audited with the moderator as actor. Votes, reports, replies, and links
  to it are refused (404). Showing it again clears the reason and is
  audited. A hidden thread with visible replies is listed as a placeholder
  with no author or text. Staff cannot change what a member wrote, and
  members cannot moderate (403) (integration tests, 2026-10-17).
- [x] Removal: moderators cannot remove (400); an admin's removal erases
  the text, the audit entry does not hold it, it cannot be undone (400),
  and the author is told (integration test, 2026-10-17).
- [x] Locks: only threads can be locked (400). A locked thread refuses
  replies and votes on itself and its replies (409, code `locked`) but
  takes reports (integration test, 2026-10-17).
- [x] Reports: staff dismiss them, recording who and when, and cannot change
  the reason; members cannot (403); audited (integration test, 2026-10-17).
- [x] Rate limits, kept in Valkey per member. A sixth comment in a minute is
  refused with 429, `Retry-After`, and the code `rate-limited`. Other members
  are not affected, and refused attempts do not count. Votes and reports
  have their own limits (integration tests, 2026-10-17). When Valkey is
  still connecting, the first request waits for it; found and fixed by the
  tests.
- [x] Link limits: links are text starting with `http://`, `https://`, or
  `www.` (unit tests). A new member's link is refused (403, code
  `link-limit`), while a bare domain or a moderator's link is not. An
  account older than three days may post three links but not four
  (integration tests, 2026-10-17).
- [x] Notifications: a reply tells the thread's author, but not a member
  replying in their own thread. Only the recipient can mark them read.
  Replies hidden later drop out of the list and the count. Pages come
  newest first without repeats. Deleting an account deletes its
  notifications. Answers are `private, no-store` (integration tests,
  2026-10-17).
- [x] Turnstile: with keys set, an email-link request without a token is
  refused (400), one that Cloudflare refuses is refused (403), and other
  endpoints need none, against a local stand-in for Cloudflare (unit
  tests). Without keys it is off.
- [x] The guard tests failed when the vote lock check, staff's read-only
  access to the text, the recipient check on marking read, and dropping
  hidden replies from notifications were removed (2026-10-17).
- [x] Better Auth's rate limits (open since week 2) on a production build:
  five email-link requests a minute, then 429. Without a client address
  header every visitor shares that bucket. With `CLIENT_IP_HEADER` set,
  each address has its own: one was refused while another still got
  through (`curl`, 2026-10-17). Better Auth's own `X-Retry-After` header
  holds a wrong value; the form shows its "Too many requests" message.
- [x] Real browser (headless Edge, production build on the test database,
  Cloudflare's always-pass Turnstile test keys, 2026-10-17), with no
  browser errors:
  - The sign-in button waited for the Turnstile widget's token, and a
    request without one was refused (400).
  - A new member's link was refused with the date links open.
  - Another member replied and reported, then hit the comment limit with
    "Try again in 59 seconds".
  - The first member saw "Notifications 1" in the header. The list showed
    the reply, and the count cleared once it was read. Its link scrolled to
    the reply and highlighted it.
  - The admin found the open report in Comment reports. The comment's page
    listed its reports with no "Add new", and its text was read-only. The
    admin chose "Hidden by a moderator" and "Spam or advertising" and
    saved; the report became "acted on".
  - After a thread was locked, the second member saw the advert gone and
    the thread locked, with no Reply or vote buttons.
  - Staff saw "Moderate" links; members did not.
  - The author's notifications explained the hidden comment.
  - Nothing scrolled sideways at 390 px.
- [x] Found in the browser test and fixed:
  - a linked comment could be pushed out of view by the comment form
    appearing above it; the page now scrolls once that form is shown;
  - the reports list on a comment offered "Add new", which staff cannot
    use.
- [x] The code review before the first push found ten issues, and a
  security pass (the repository's security checklist) found one more.
  Nine were fixed, each with a test that fails without the fix
  (2026-10-17):
  - a staff save wrote back the score read when it began, losing a vote
    made meanwhile (a test holds a vote's row lock during the save);
  - a vote could slip into a thread a moderator was locking (a test holds
    the lock; the waiting vote is now refused);
  - writes the server refused, such as replies to a locked thread, used
    up the rate limit;
  - reply notifications showed text from topics that were no longer
    public;
  - Turnstile accepted a token solved for another action or hostname
    under the same key, and the always-pass test keys would have worked
    on a real site;
  - "not found" for a linked thread was cached for a minute, though a
    link can arrive before the read connection has the reply;
  - the header asked for the unread count on every page change;
  - a rule for read-only fields was written twice;
  - links with a user name or password in them, such as
    `https://bank.example@evil.example`, were shown as links.

  Two were not changed. The notification race on a hidden comment cannot
  happen: the save holds the comment's row lock until it commits, so a
  second save waits and sees the first notification. A hidden thread's
  placeholder still sorts by its old score, which was public before it was
  hidden.
- [x] The developer reports and hides a comment (reported done by the
  developer before PR #14 was merged, 2026-10-17).
- [ ] Before the pilot (week 12): real Turnstile keys from a Cloudflare
  account, limited to the site's hostname, and `CLIENT_IP_HEADER` set to
  `cf-connecting-ip` behind the tunnel.
- [ ] Not built yet: moderating from the topic page itself, locking a
  whole topic's discussion (archiving closes it), telling repliers other
  than the thread's author, and email notifications (after the pilot).

### Week 11: account deletion, data download, feedback, legal pages

See [ADR 0011](adr/0011-account-deletion-feedback-and-legal-pages.md) for the
design. Backups, Sentry, and the scale rehearsal are the rest of week 11, in a
later PR.

- [x] Deleting one's own account (integration tests, 2026-10-17):
  - refused to visitors (401), from other sites (403), with the wrong email
    (400, `confirm-email`), for staff (403, `staff-account`), and for a
    session older than 10 minutes (403, `sign-in-again`), leaving the
    account in place;
  - the email is matched however it is typed (case, spaces);
  - afterwards the profile, sign-in account, sessions, notifications, and
    feedback are gone and the session no longer works;
  - the member's comments, hidden ones included, are `deleted` with no text
    and no author, and a removed one stays removed;
  - a thread with others' replies shows as a placeholder saying its author
    deleted their account, a lone comment leaves the list, and a reply
    leaves its thread's count;
  - votes stay in scores, and reports stay without the reporter;
  - audited as `user.deleted` with no actor and `own: true`;
  - the topic's search count matches the page, and a search job waits for
    the erasure.
- [x] An admin deleting an account erases the comments the same way,
  audited with the admin as actor (integration test, 2026-10-17).
- [x] A comment saved while the deletion runs waits for it and is erased
  too. The test fails when the deletion's lock on the profile is removed
  (2026-10-17).
- [x] A reply being posted in the member's thread while they delete their
  account finishes first, and the deletion then succeeds. With the old lock
  order (profile before comments) the test fails with a deadlock (503)
  (2026-10-17).
- [x] Open reports on the erased comments are marked acted on. Staff cannot
  delete their own profile in the admin panel (403) (integration tests,
  2026-10-17).
- [x] Staff cannot show a deleted comment (400) but can lock its thread
  (integration test, 2026-10-17). The domain rules refuse setting or
  undoing `deleted` (unit tests).
- [x] Data download: a JSON file (`attachment`, `private, no-store`) with
  the member's account, sessions, comments (a hidden one's text and reason,
  without staff's note), votes, reports, notifications, and feedback, and
  nothing of another member's. Refused to visitors (401) and to requests
  marked cross-site (403) (integration tests, 2026-10-17).
- [x] Feedback: saved with its author and the page's path, without query or
  fragment. A full address is dropped. Text is tidied like a comment.
  Refused to visitors (401), other sites (403), and with no text or an
  unknown kind (400). The sixth in an hour gets 429. Staff list it and mark
  it done, which is audited, but cannot change the text. Members cannot
  read it (403) (integration and unit tests, 2026-10-17).
- [x] Migration: applying it, rolling it back with a `deleted` comment in
  place (which becomes `removed`, with the feedback table dropped), and
  applying it again worked on a scratch database. The rollbacks of the
  week 9 and week 10 migrations failed (each dropped a constraint that
  `DROP TABLE ... CASCADE` had already removed). They were fixed, and
  weeks 9 to 11 rolled back and reapplied together (2026-10-17). Rolling
  back the week 1 migrations still fails; recovery uses backups.
- [x] Real browser (headless Edge, production build on the test database,
  2026-10-17), with no browser errors:
  - the footer's "Send feedback" opened `/feedback` with the topic's path;
    without a kind the form asked for one, and the feedback was sent and
    listed in the admin panel;
  - a member's account page showed "Your data" and "Delete your account";
    the download button saved the JSON file; staff saw that an admin
    deletes their account, with no delete form;
  - the wrong email was refused with its message, the right one (typed in
    capitals) deleted the account and led to "Your account was deleted",
    signed out;
  - on the topic, the erased comment showed as "This comment's author
    deleted their account." above the other member's reply;
  - the privacy policy and terms showed the draft notice and their "To be
    decided" marks;
  - nothing scrolled sideways at 390 px on the account, feedback, deleted,
    sign-in, privacy, and terms pages.
- [x] The code review before the first push found ten issues; nine were
  fixed (2026-10-17):
  - deleting an account while someone replied in the member's thread
    could deadlock (locks taken in the opposite order to a reply's);
  - open reports on erased comments stayed open, though moderators could
    no longer act on them;
  - an admin could still delete their own profile in the admin panel;
  - a failed data download used up one of the day's ten;
  - the download link saved error messages as the file instead of
    showing them;
  - the download was read in several transactions, so its parts could
    disagree;
  - marking feedback done was not audited;
  - the delete route repeated the shared sign-in check;
  - the account page loaded the deletion code for one constant.

  Not changed: comments by accounts deleted before this change keep their
  text, since the migration cannot use the new status it adds; only
  development data has them.
- [x] The developer deletes a test account (reported done by the developer
  before PR #15 was merged, 2026-10-18).
- [ ] Before the pilot: set `SITE_OPERATOR` and `CONTACT_EMAIL`, decide what
  the privacy policy and terms mark "To be decided", and have both
  reviewed. Update the privacy policy when Sentry and backups are added.
- [ ] Not built yet: deleting a single comment of one's own, and appeals of
  moderators' decisions.

### Week 11: backups and error reporting

See [ADR 0012](adr/0012-backups-and-error-reporting.md) and the
[backup and restore runbook](runbooks/backup-and-restore.md). The scale
rehearsal is the rest of week 11, in a later PR.

- [x] The backup image builds from the repository root (Node 22.23.3 on
  Alpine 3.24, with the PostgreSQL 17.11 client tools) and runs as an
  unprivileged user (2026-10-18).
- [x] Backups against a real server and storage (integration tests in the
  image, `make test-backup`, 2026-10-18):
  - a backup records every table's row count from the dump's own snapshot,
    the newest migration, and copies the uploads;
  - a restore into a new database matches every table, and copies the
    uploads into the named bucket;
  - restoring over the live database, into an existing one, or under a
    badly formed name is refused, and so is a dump whose checksum does not
    match;
  - a second backup copies no upload again, and backups past 14 days are
    deleted while the newest stays, together with copies of uploads that no
    kept backup lists (an upload removed from the site);
  - the real command starts and lists backups, so a module that cannot load
    in the image fails the test.
- [x] The rules (names, manifests, retention, configuration, connection
  settings without the password on the command line) have unit tests.
- [x] The development database: `make infra-up` started the backup service,
  which took the first backup (52 tables, 483 rows, 1 upload). `make
  restore` restored it into a new database with every table matching and
  the upload copied (2026-10-18).
- [x] Found and fixed while running it:
  - the scheduler's timer did not keep the process alive, so it exited after
    each check and Compose restarted it;
  - the image placed the shared package inside `node_modules`, where Node
    does not run TypeScript, so the command could not start; the image now
    keeps the workspace layout.
- [x] `docker compose stop backup` stops it in a second with exit code 0
  (2026-10-18).
- [x] Error reporting: Sentry accepted a test event from the worker's setup
  (HTTP 200), and a browser-style report sent through `/api/v1/errors` was
  passed on with no warning. A report from another site was refused (403)
  (2026-10-18).
- [x] Unit tests:
  - scrubbing removes the user, cookies, bodies, query strings, headers
    other than the user agent, email addresses, and console and click
    breadcrumbs;
  - the route keeps only error events, scrubbed again with the configured
    environment and the real DSN, refuses other sites, and sends nothing
    while reporting is off (against a stand-in for Sentry);
  - `SENTRY_DSN` and `SENTRY_ENVIRONMENT` are checked by name;
  - email addresses in console arguments and other extra data are hidden.

  The integration tests clear `SENTRY_DSN`, so they never reach the real
  project.
- [x] The code review before the first push found ten issues, all fixed
  (2026-10-18):
  - email addresses in the console's arguments reached Sentry unscrubbed;
  - copies of uploads were never deleted, so a removed upload stayed in
    the backups and came back on restore;
  - jobs that failed for good on the first attempt (`UnrecoverableError`)
    were warnings and never reported;
  - the backup container ignored a managed uploads service
    (`CONTAINER_S3_ENDPOINT`, `CONTAINER_DATABASE_URL`);
  - one unreadable manifest stopped every later backup;
  - the error route's rate limit trusted `X-Forwarded-For`, which a client
    can forge;
  - `.env` files in subfolders could reach the image;
  - a stop signal during a backup was ignored, and Ctrl+C did not end
    `make backup` or `make restore`;
  - a backup endpoint without its own keys would have received the site's
    keys;
  - failed or stopped backups were not reported.
- [x] Restoring a backup, the manual test, run by Claude at the
  developer's request in PowerShell (2026-10-19):
  - `make backup` took a backup (52 tables, 1 upload);
  - `make restore` put it into a new database, with every table matching
    and the upload copied;
  - the same restore again was refused ("already exists").

  The restored database held the development data (3 topics, 5 comments,
  2 users) and was then dropped.
- [ ] Before the pilot:
  - set `BACKUP_S3_*` to another storage service (such as Cloudflare R2) and
    take a backup there;
  - set `SENTRY_ENVIRONMENT=pilot`;
  - in Sentry, turn on "Prevent Storing of IP Addresses" for server-side
    reports.
- [ ] Not built yet: uploading source maps to Sentry (needs an auth token at
  build time), and error reporting in the admin panel's own pages.

### Week 11: containers, shared page cache, scale rehearsal

See [ADR 0013](adr/0013-containers-shared-cache-and-scale-rehearsal.md) and
the [scale rehearsal runbook](runbooks/scale-rehearsal.md). All results below
are from the developer's PC (Docker Desktop on Windows, giving Docker 16 CPUs
and 31 GB), 2026-10-18 and 2026-10-19.

- [x] Shared page cache (integration tests against Valkey). Two handlers,
  standing in for two web containers:
  - serve a page one stored to the other, with its Buffers and Maps intact;
  - drop it everywhere once a tag it shows is purged, while a page with
    other tags stays;
  - check data entries against the tags they were stored with;
  - keep each build's pages apart while sharing purges.

  Unit tests cover Next.js's rules for expired and stale tags.
- [x] The production build needs no database. A running build answered the
  home page's first request with a MISS, rendered fresh and stored in
  Valkey, and later requests with HITs carrying the usual
  `s-maxage=3600` headers; the build's copy was never served. Next.js's
  compile-only mode was tried and rejected: it made every page
  `private, no-store`.
- [x] Images build from the repository root with no database: web about
  2 GB, worker about 400 MB, both running as the unprivileged `node` user.
- [x] Scale rehearsal step 3: the newest backup restored into
  `countrytopics_rehearsal` with every table matching (52 tables, 483 rows)
  and its upload copied.
- [x] Step 1, statelessness (`make scale-check`, two web and two worker
  containers behind Caddy):
  - the member's session worked on both containers;
  - a TEST topic published through one container showed its change on both
    at once;
  - the page was then rendered once (MISS) and the other container's first
    answer was a HIT from the shared cache;
  - five comments were taken and the sixth refused (429), alternating
    between containers.

  Both workers took jobs from the rehearsal's own queues.
- [x] Step 2, load tests (k6 in the Compose network). The data: 1,002
  topics, 50 TEST members, and 9,992 comments, seeded by `make scale-seed`.
  - Cached pages, 100 visitors: 31,072 requests at 293 a second, median
    15 ms, 95th percentile 38 ms (topic pages 39 ms), no failures. This is
    the final setup, with the cache's own Valkey; before that change it was
    31,044 requests, with a 95th percentile of 36 ms.
  - Uncached (search, browse, comments), 50 visitors: 11,659 requests,
    95th percentile 46 ms, no failures.
  - Uncached back to back, 50 visitors with no pauses: 561 requests a
    second, 95th percentile 201 ms, no failures. Comments were the slowest
    (95th percentile 228 ms, against 113 ms for search and browse).

    The thread query runs in 0.3 ms (planning 1.3 ms) on its indexes, so
    the time is the endpoint's several round trips, not a slow query. No
    query needed fixing at this size, 20 times the pilot's.
- [x] Larger loads, cached pages, with each visitor pausing 1 s between
  rounds of four pages (2026-10-19):
  - 1,000 visitors on 2 web containers: 1,398 requests a second, 95th
    percentile 193 ms, slowest 11.9 s, no failures. Right after a rebuild,
    with the cache empty, the home page's 95th percentile was 3.0 s,
    because every visitor's first request renders it; it was 458 ms once
    warm;
  - 1,000 visitors on 4 web containers (`--scale web=4`, which the load
    balancer found by itself): 2,265 requests a second, 95th percentile
    153 ms, slowest 2.0 s, no failures. Each web container renders on
    about one CPU, so adding containers raised capacity;
  - 2,500 visitors on 4 web containers: 2,564 requests a second, the
    ceiling of this PC with k6 on it too. The 95th percentile was 2.4 s,
    the slowest request hit 60 s, and 12 of 275,688 failed. Each web
    container used about 350 MB.

  A test of 10,000 visitors needs the load generated from another machine
  (step 4). In front of the pilot, Cloudflare serves cached pages without
  reaching the containers.
- [x] Failover: stopping one web container during the cached test failed
  142 of 29,144 requests (0.48%). The load balancer kept sending requests
  to it until its next health check. With retries on another container
  and passive health checks in the Caddyfile, the same test had 0 failures
  in 29,868 requests (the slowest 2.6 s, while retried).
- [x] The code review before the first push found ten issues, all fixed
  (2026-10-18):
  - cached pages had no build in their keys, so a new build could serve
    pages pointing at an old build's scripts;
  - the rehearsal used `CONTAINER_DATABASE_URL`, which names the real
    database for backups (now `SCALE_DATABASE_URL`);
  - the cache shared the queues' Valkey, which must never evict, so its
    growth could starve the queues. It now has its own Valkey (256 MB,
    least recently used evicted), and entries last 2 hours, not 7 days;
  - while Valkey was away every page waited 2 seconds; calls now fail at
    once after the first connection;
  - the cache check passed with per-container caches, and the session
    check passed on error responses;
  - the containers' user owned its code; the code is now read-only for it
    (also in the backup image);
  - the cache's connection settings and the queue prefix's default were a
    second copy of those in `@countrytopics/jobs`;
  - the seed script cast the database adapter unchecked;
  - k6 counted the topics list and topic pages as one page.
- [x] Found while checking the fixes: running `make scale-check` again failed
  on the admin's authenticator (the preparation did less than
  `make reset-2fa`) and then on Better Auth's sign-in limit. The preparation
  now calls that script and clears the rehearsal's sign-in limits.
- [x] The rehearsal, the manual test, run by Claude at the developer's
  request in PowerShell (2026-10-19):
  - `make scale-up` started two web and two worker containers behind the
    load balancer, and the home, topics, country, topic, and privacy pages
    answered from both containers;
  - `make scale-check` passed all five checks;
  - `make load-test TEST=cached`, with one web container stopped at about
    45 seconds and started again 25 seconds later, had 0 failures in 29,620
    requests (95th percentile 74 ms);
  - `make scale-down` stopped them.

  After the restart, a page that the earlier containers had cached was
  served at once, marked STALE, and refreshed in the background.
- [ ] Step 4, not done: a test copy on free cloud tiers (managed PostgreSQL,
  Redis, storage, and a container host) by changing environment variables
  only. It needs the developer's cloud accounts; the images and
  `make scale-check` are what it will reuse.

### Before week 12: the site's design

- [x] A design for the public site, asked for by the developer before the
  pilot (2026-10-19):
  - colour and type tokens in `app/(frontend)/styles.css`, for light and
    dark: ink-blue text, a blue accent, white cards on a cool grey page;
  - Inter for text and Source Serif 4 for headings, loaded with
    `next/font`: downloaded at build time and served by the site, so
    visitors' browsers never contact Google;
  - a sticky header with a logo, a "Pilot" badge, and the current page
    marked; a footer with the site's description and links; a skip link;
  - the home page: a hero with search, the three kinds of evidence, topic
    cards, and country links;
  - topic pages: a sidebar with the category, people, tags, and the
    page's sections; evidence and references as cards, references edged in
    their stance's colour; the change log as a timeline;
  - the topics page: filters beside the results on wide screens;
  - discussion threads as cards with author initials; sign-in and other
    one-form pages as a centred card; a styled 404 for missing topics,
    countries, and people.
- [x] Topic bodies no longer show the empty paragraphs editors leave
  between paragraphs; paragraphs are spaced by the page.
- [x] The code review before the first push found ten issues, all fixed
  (2026-10-19):
  - form fields' borders and placeholders were too faint (WCAG 1.4.11 and
    1.4.3); fields now have 3:1 edges and placeholders the muted text
    colour;
  - focused fields had no outline in Windows high-contrast mode;
  - white text on the dark-mode delete button was 3.7:1;
  - a long topic sidebar could not scroll;
  - the header wrapped on phones, so jumps to `#comments` landed under it;
    it now stays one line;
  - section headings read as "Evidence3" to screen readers;
  - the fonts came from two new packages instead of `next/font`, without
    preloading or a size-matched fallback;
  - a linked comment's scroll offset was added twice;
  - two styles were defined twice, and the logo needed its gradient id
    passed in (now `useId`).
- [x] Real browser (headless Chrome against `make dev`): home, topics,
  topic, country, sign-in, privacy, account, notifications, and feedback
  pages at 1280 px in light and dark, and at 390 px and 360 px; nothing
  scrolls sideways. Tabbing from the top reaches the skip link first, then
  the header, the search box, and the topic cards, each with a visible
  outline. Signed in as the TEST member through Mailpit.
- [x] The developer found "Your account" shown as "Youraccount": header
  links were flex containers, which drop the space at the edge of each
  piece of text. They are inline blocks now. A whole-site audit followed
  (2026-10-19), with headless Chrome and axe-core 4.10, on 25 pages and
  states signed out and signed in, at 1280 px (light and dark), 1024 px,
  768 px, and 390 px (light and dark):
  - axe-core (WCAG 2.1 A and AA, and best practices): the topics page went
    from its h1 to the cards' h3s with no h2, so the result count is now
    the h2; every page is now clean, apart from Next.js's plain 404 below;
  - no console errors other than 404 pages, no failed requests, no broken
    images, nothing scrolls sideways, and every internal link answers
    (the 404s were pages that are meant to be missing);
  - a check of every flex and grid container that mixes text with
    elements found no other text run together;
  - interactive states: the sign-in link sent, the report form, and the
    delete form's error.
- [x] Real content, in the rehearsal (`make scale-up`, web only, image
  built from this branch, so `next/font` was also checked in Docker): a
  TEST topic in `countrytopics_rehearsal` with a snippet and its
  transcript, a web page, a document, an image, references with each
  stance, and a TEST person with a statement and its evidence and source.
  Found and fixed: a snippet's note sat loose under the player; the
  profile said "under each statement above" when it showed none; profile
  text ran the full page width, so profiles are reading width now.
- [x] An address that matches no page showed Next.js's plain 404, because
  the site and the admin panel had separate root layouts; since ADR 0014's
  phase 5 it shows the site's 404 (`globalNotFound`).

### The split, phase 0: the local environment (ADR 0014)

- [x] `APP_ENV` (`local`, `staging`, or `production`; `local` when unset) in
  the site, the worker, and the backup tool, through the new
  `@countrytopics/environment` package. Each refuses to start with another
  environment's addresses: local only on this machine or a quick-tunnel
  demo address, with services only on this machine or in its containers;
  staging only at `https://dev.`; production at any other public
  `https://` address; hosted environments never use a service on
  `localhost` or over plain http. `APP_ENV` labels Sentry's reports when
  `SENTRY_ENVIRONMENT` is empty (2026-10-21).
- [x] The code review before the first push found nine issues, all fixed:
  a backup that forgot `APP_ENV` would have started under local rules,
  and local checked none of its services, so a laptop could reach a
  hosted database; loopback names such as `LOCALHOST`, `127.1`, and
  `0.0.0.0`, and multi-host database URLs, slipped past; a mistyped
  `APP_ENV` was reported with misleading address errors; phone tests over
  the local network were refused; the Turnstile message did not say how to
  run a demo; and the site address was read twice, differently.
- [x] pgvector dropped: Compose and CI run `postgres:17-bookworm`, the
  Debian release the pgvector image was built on, so the existing data
  volume opened unchanged. The migration `20261021_165743_drop_vector_extension`
  removed the extension from the development database; the restore-check
  and rehearsal databases had it removed by hand.
- [x] Checked on this machine: the site served the home, topics, and a
  topic page after the database moved to the new image, with its 9 topics
  and 19 migrations; a fresh backup restored into a new database with
  every row matching; a backup from before the change stopped at
  `CREATE EXTENSION ... vector`, as the backup runbook now says.
- [ ] Not in phase 0: the workerd preview of the frontend, which needs
  `apps/frontend`; it comes with the site spike in phase 1.

### The split, phase 1: the site spike (ADR 0014)

- [x] `prototypes/workers-spike`: a throwaway OpenNext build of the topic
  page, with the site's rich-text renderer, fonts, and styles, pages
  cached in R2, tags in D1, and the Durable Object queue, run in workerd,
  the Workers runtime, in a Linux container (2026-10-21).
- [x] Every check passed (ADR 0014, "Phase 1 results"): rich text for a
  TEST topic and a real one; 1.17 MB compressed, under the free plan's
  3 MB; about 56 ms of start-up CPU; cache hits with no backend call; a
  purge by tag shows the edit on the next request, and a forged one is
  refused; a stale page refreshed in the background; fonts served from the
  Worker; error reports reached a stand-in Sentry.
- [x] Found and fixed in the spike: the topic page was not cached until it
  returned an empty `generateStaticParams`, as apps/web's does.
- [x] The code review before the first push found ten issues, all fixed:
  - Sentry 11 dropped `sendDefaultPii`, so every SDK in the repository
    collected users, cookies, headers, bodies, and query strings by
    default, and only the scrubbing kept them out of reports. The shared
    `ERROR_REPORTING_DEFAULTS` now set `dataCollection` to collect none
    of it; the spike showed reports clean with the scrubbing removed too.
  - The spike's cache tags were per topic; they are now apps/web's
    collection tags, which is what the backend will purge.
  - The five-second page reused hour-long data, so its refresh proved
    only a re-render; it now shows new data arriving.
  - The link helper was not an exact copy, the page-data fetch had no
    timeout or shape check, the stand-in Sentry could miscount or crash,
    old build state could enter the image, and nothing type-checked the
    spike (it has a `typecheck` script now).
- [x] `pnpm-workspace.yaml` pins `@aws-sdk/types` to 3.974.6, the version
  the workspace already used: AWS SDK packages published on 2026-10-21,
  pulled in by the adapter, asked for a 3.975.0 that was still being
  published. Remove the pin with the spike.
- [ ] Not done: a deploy to `workers.dev`, which needs a Cloudflare
  account; it would also measure the free plan's 10 ms of CPU a request.

### The split, phase 2: the admin spike (ADR 0014)

- [x] The spike has two route groups, each with its own root layout:
  `(site)` and `(admin)/admin`. The admin's topic editor edits the title,
  the summary, the countries, the body (Lexical, loaded in the browser
  only), and the change note through Payload's REST API on the real local
  backend, by way of a stand-in for phase 4's pass-through. It saves drafts,
  publishes, and shows refusals beside their fields (2026-10-21).
- [x] Every check passed (ADR 0014, "Phase 2 results"):
  - The editor writes what Payload's editor writes, checked against
    Payload's own node classes for every node and format, the TEST fixture,
    and all 29 local topic bodies, also after showing them on a page.
  - A TEST topic edited in headless Chrome was stored exactly as sent and
    rendered by apps/web's topic page.
  - Both refusals, the empty body and the missing change note, showed
    beside their fields.
  - The Worker is 1.21 MB compressed, with 30–60 ms of start-up CPU.
  - The public pages load none of the admin's files, and the admin none of
    the site's styles; admin pages are sent with `no-store`.
- [x] Found in the spike:
  - The phase 1 TEST fixture lacked the paragraphs' `textStyle`, so it was
    not quite what Payload writes; it is regenerated through Payload's
    nodes.
  - Payload's renderer numbers list items by `value` and ignores the
    list's `start`.
- [x] The code review before the first push found ten issues, all fixed:
  - Linking text across an existing link moved the text after it into the
    new link, out of order; links and rules pasted from a web page became
    plain text, where Payload's editor keeps them. Both are tested now,
    with unlinking.
  - Failures were reported wrongly: a save's answer was cast unchecked
    inside a catch-all, so a save that worked could read "could not be
    reached"; the pass-through and the New TEST topic button did not catch
    a backend that was down; and the admin pages crashed with Next.js's
    generic error instead of saying to start apps/web.
  - The pass-through compared a write's origin with the request's own URL,
    which a tunnel changes; it compares with the site's configured address
    now.
  - The editor copied the whole body on every keystroke, and the gate ran
    before the page's reads instead of with them.
- [x] The local database has a TEST admin, `test-admin-spike@example.test`,
  invited for the checks, and one TEST topic, "TEST admin spike topic
  (phase 2)". Neither is real. The topic was archived after the checks.

### The split, phase 3: contracts and page data (ADR 0014)

- [x] `packages/contracts`: zod schemas and types for the public pages'
  data and browsing, re-exported by apps/web's `src/public/types.ts`, and
  each endpoint's path and cache tags (2026-10-21).
- [x] `GET /api/v1/pages/home`, `/api/v1/pages/topics/:slug`,
  `/api/v1/pages/countries/:slug`, and `/api/v1/pages/individuals/:slug`,
  from the pages' cached loaders, sent with `no-store`; 404 where the page
  is missing, 503 when the data cannot be loaded.
- [x] Integration tests: each endpoint's JSON equals its loader's and
  passes its contract; drafts, unknown or malformed slugs, and people no
  published topic names answer 404; archived topics answer as archived.
- [x] Checked against the local database: all 269 addresses answered the
  same status as their pages, every answer passed its contract, and
  repeated reads took about 6 ms.
- [x] The code review before the first push found nine issues, all fixed:
  - The paths helper put any value into the path, so a slug such as
    `..%2F..%2Faccount` could have sent a signed request to another
    endpoint; it refuses anything but a slug now.
  - A topic body's JSON named the drafts and private profiles it linked
    to, which the rendered page never did; those links lose their target
    now.
  - Strict schemas would have broken the frontend whenever the backend
    added a field, as the two deploy apart; parsing drops unknown fields
    now, and the backend's tests check that every answer parses unchanged.
  - The cache tags lived only in apps/web; they are in the contracts now.
  - Failures were logged without their stack; the browse contract, the
    503 answer, and the body's root were not fully checked; values were
    listed twice instead of taken from the domain package; and the three
    slug routes were copies of one another.
- [x] The member API's schemas moved into `packages/contracts` in phase 5.
- [x] Not in phase 3: Payload's REST types (phase 7) in
  `packages/contracts`. Phase 7 describes what each list reads there
  instead, checked against the backend by a test (ADR 0014, "Phase 7
  results").

### The split, phase 4: the API through the frontend (ADR 0014)

- [x] `apps/frontend` passes every request on to the backend, signed with
  `FORWARDING_KEY` (`packages/forwarding`), with the visitor's address; the
  backend's `proxy.ts` refuses anything unsigned except its health check
  and, locally, Payload's panel at `localhost:3002/admin`. `make dev` runs
  the frontend on 3000, the backend on 3002, and the worker (2026-10-21).
- [x] Every cookie is `__Host-countrytopics.*`, Secure, `Path=/`, with no
  `Domain`; plain names only on a local plain-http address other than
  localhost.
- [x] Canonical redirects are built from `SITE_URL`; staff writes through
  Payload's REST API are limited per person, bulk writes more tightly.
- [x] Checked through the frontend with TEST accounts (ADR 0014, "Phase 4
  results"): sign-in by email link, comments, votes, reports, export,
  account deletion, and a staff edit; sign-in's redirect keeps its cookie,
  in `next dev` and in workerd; unsigned, forged, and expired requests to
  the backend are refused; the pages hydrate and navigate client-side; the
  panel saves locally; `make scale-check` and both load tests pass with
  signed requests.
- [x] Found while building it:
  - Next.js removes `_rsc` from every request's URL and re-encodes the
    query, so the signature covers the path as the backend's proxy sees it.
  - A proxy that rewrites request headers loses Next.js's router headers,
    so the backend's proxy passes requests on unchanged.
  - The frontend drops the `Next-Url` header before passing a request on,
    so the backend's own `_rsc` check always failed; the frontend makes it
    instead.
  - The development server's live reload is a websocket, which only a
    Next.js rewrite can pass on.
- [x] The code review before the first push found ten issues; nine were
  fixed and one was not a problem (public pages link files on the site,
  not by Payload's `serverURL`):
  - a path starting with `//` could have named another host, and
    percent-encoded spellings of `/admin` were passed on;
  - cookies were Secure even on a plain-http phone test address;
  - bulk REST writes counted as one save;
  - the expired-signature message did not mention clocks;
  - the rehearsal check's redirects did not follow fetch's rules;
  - the origin and key readers were copied in three places;
  - `FORWARDING_KEY` was missing from the ownership-transfer runbook;
  - and the write limit listed operation names the hook never receives.
- [x] The security review found no high- or medium-confidence issues.
- [x] The local database has more TEST accounts for these checks: members
  invited as `test-member-*-phase4*@example.test`, which deleted their own
  accounts, and their TEST comment on the TEST browse-check topic.

### The split, phase 5: `apps/frontend` (ADR 0014)

- [x] The frontend renders the public pages, the member pages, an
  unknown address's 404, and the admin's gate at `/admin`, and serves video
  thumbnails; it passes only `/api` and `/files` on to the backend
  (2026-10-21).
- [x] Page data is read signed and cached by path under its collections'
  tags (`unstable_cache`); member pages ask `GET /api/v1/account` with the
  visitor's cookie, and the sign-in page `GET /api/v1/sign-in-options`.
- [x] The member API's requests and answers, the browse parameters, and
  sign-in's error codes are in `packages/contracts`; the labels, link
  checks, and browse sorts in `packages/domain`. A lint rule keeps
  Payload, `pg`, ioredis, BullMQ, and the jobs and search packages out of
  the frontend.
- [x] Checked against production builds of `main` and this phase (ADR
  0014, "Phase 5 results"): 162 of 168 screenshots identical, the six
  others the new 404; the whole-site audit as on `main`, the 404 now clean;
  every member action through the pages with clicks; the admin's gate for
  visitors, members, unverified and verified staff; thumbnails from the
  site and nothing from Google before play; in workerd, every page cached
  in R2; a 1.56 MB compressed Worker; 164 integration tests;
  `make scale-check` and both load tests, with no failures.
- [x] Found while building it:
  - the build-time home page, rendered without the backend, would have been
    served empty for an hour after each deploy; the build now leaves it
    out;
  - URL parsing resolves `%2e%2e`, so the pass-through refuses dot
    segments;
  - workerd needs the system's certificates for HTTPS, which the local
    preview's image lacked.
- [x] Until phase 6's purges, a published change reaches the site when its
  cached page and data expire, within an hour or two. Closed by phase 6.
- [ ] The backend's copies of the pages stay until phase 12, for the
  rehearsal and the load tests; change pages in `apps/frontend` only.
- [x] The local database has more TEST accounts for these checks:
  `test-member-audit-phase5@example.test`, members
  `test-member-*-p5*@example.test`, who deleted their own accounts or
  remain, and admins `test-admin-p5*@example.test`, with their TEST
  comments, replies, reports, and feedback on the TEST browse-check topic.

### The split, phase 6: purges (ADR 0014)

- [x] Once the backend's cache has written a purge of public tags, it
  queues a `purge` job; the worker sends the tags to the site's
  `POST /api/revalidate`, signed with `PURGE_KEY` (an HMAC over a timestamp
  and the body, refused after five minutes), and the site calls
  `revalidateTag` (2026-10-21).
- [x] Publishing changes the site within a second: 0.09–0.14 s after the
  publish answered on a production build, 0.15–0.19 s in workerd, and
  0.54 s under `next dev`; without the worker, the page keeps the old
  version.
- [x] A failed purge retries: with the site down, it failed five times and
  the sixth purged the page, which had kept its cached version across the
  site's restart.
- [x] Unsigned, forged, six-minute-old, and altered purges are refused
  (403), unknown tags too (400), in Node and in workerd; the pass-through
  never passes `/api/revalidate` on.
- [x] `PURGE_KEY` is the frontend's and the worker's only, differs from
  `FORWARDING_KEY`, and is required outside local runs; `make env`
  generates it, and the ownership-transfer runbook lists it. The scale
  rehearsal has no site, so its worker drops purge jobs.
- [x] 165 integration tests, the workspace's unit tests, and
  `make scale-check` pass.
- [ ] Changes made outside a web request (scripts, the worker's video and
  link checks) still purge nothing; their pages refresh within the hour.
- [x] The local database has another TEST admin,
  `test-admin-p6a@example.test`, and the TEST browse-check topic's change
  log has the TEST edits made for these checks; its summary is back as it
  was.

### The split, phase 7: the admin's shell and lists (ADR 0014)

- [x] `/admin` has its own frame: the collections grouped as in Payload's
  panel, the signed-in account, and sign-out; a list for each of the 17
  collections, with search as you type, sorting, filters, page sizes, and
  pages, at the panel's addresses (2026-10-22).
- [x] Staff find records as fast as in Payload's panel, or faster: 133–165
  ms against 151–265 ms for the same lists, searches, filters, and pages,
  and the same time from typing to a match (382 ms and 385 ms).
- [x] The gate: visitors sign in and come back to the same list; members
  are told the admin is for staff; staff set up and confirm an
  authenticator in the admin itself. Moderators see 15 collections, not the
  audit log or invitations, and only their own account.
- [x] What each list reads is in `packages/contracts` (`admin-lists.ts`);
  an integration test checks it against the backend's collections and asks
  for every list with its search and each filter.
- [x] Every admin screen is axe-clean at 1280, 768, and 390 px, light and
  dark, with no sideways scrolling, and is never cached.
- [x] Found while building it: Payload's client-hint headers made Chrome
  fetch email sign-in links twice, so signing in always ended on
  `/account`; the pass-through now drops them.
- [x] A record's page only named it, and locally opened it in Payload's
  panel, until its editor came: topics and topic changes in phase 8, the
  records topics are built from in phase 9, and the rest in phase 10.
- [x] The local database has more TEST accounts:
  `test-member-p7*@example.test`, `test-admin-p7*@example.test`,
  `test-moderator-p7*@example.test`, and `test-member-trace*@example.test`
  and `test-member-curl*@example.test` from tracing the sign-in links.

### The split, phase 8: the topic editor (ADR 0014)

- [x] Topics are created, edited, and published in the new admin, at
  Payload's addresses: every field the panel shows, the body with its
  toolbar and links to web pages, topics, and individuals, the
  individuals, evidence, and references rows, the change note, and the
  topic's details and change log (2026-10-22).
- [x] Every refusal Payload's panel showed is shown, beside its field and
  in a list at the top: an integration test sends the editor's requests
  and gets each of the 25 refusals the topic's fields and hooks give, and
  each lands on a field the form shows. What a publish needs is checked in
  the browser first, as the panel does, and the test checks that the
  backend refuses exactly that.
- [x] A real topic was published end to end in headless Chrome by a new
  TEST admin (58 checks), and showed on the site as written.
- [x] Versions: each is listed and shown whole, and restored as the newest
  draft. Change log entries have their own pages. Drafts that were never
  published can be deleted.
- [x] Moderators read topics in the editor; the form is read only and the
  backend refuses their writes.
- [x] The 107 topic bodies in the local database are written back exactly
  as Payload's editor writes them; the body's nodes and their test moved
  from the spike into `apps/frontend`.
- [x] Lexical loads only on the editor (262 KB); the Worker is 1.85 MB
  compressed. Every editor screen is axe-clean at 1280, 768, and 390 px,
  light and dark, with no sideways scrolling.
- [ ] Autosave, live preview, comparing versions, document locking,
  duplicating, and making related records or uploading files from inside
  a topic: phase 11. The other collections' editors: phases 9 and 10.
- [x] The local database has more TEST records from the browser checks:
  16 accounts `test-admin-p8*@example.test` and
  `test-moderator-p8*@example.test`, 14 individuals named
  `TEST Phase8 Person p8*`, and 20 topics titled `TEST phase 8 ...`: four
  published, with their versions and change logs, and drafts from runs
  stopped part way.

### The split, phase 9: the other editors (ADR 0014)

- [x] Countries, categories, tags, individuals, references, files, and
  snippets are created (except countries), edited, and deleted (except
  countries) in the new admin, at Payload's addresses; videos and archived
  links are shown with what the worker found, and a video no snippet uses
  can be deleted (2026-10-22).
- [x] Each is checked as today: the reference lookup and the worker's
  check, an individual's duplicate warning and "This is a different
  person", the snippet clip editor with its player, transcript summary,
  preview, and video check, a file's upload and replacement, and a refused
  delete saying what still uses the record.
- [x] Every refusal is shown beside its field and in the list at the top,
  in rows of rows too: the backend's integration test sends each editor's
  requests (30 tests), and a new TEST admin and moderator went through
  every editor in headless Chrome (66 checks).
- [x] The nine editors load only on the admin's record pages (44 KB, 13 KB
  compressed); every screen is axe-clean at 1280, 768, and 390 px, light
  and dark, with no sideways scrolling. 272 integration tests pass.
- [x] Found on the way: a refusal's list did not always take the focus
  after the backend refused a save; fixed in the topic editor too.
- [ ] Versions of references and snippets, uploading several files at
  once, and a file's focal point: phase 11. Comments, reports, feedback,
  invitations, users, and the audit log: phase 10.
- [x] The local database has more TEST records from the browser checks: 9
  accounts `test-admin-p9*@example.test` and
  `test-moderator-p9*@example.test`, and records named `TEST phase 9 ...`
  or `TEST Phase9 Person ...`: 1 category, 3 tags, 3 individuals, 3
  references, 6 files, and 2 snippets. Ghana's subregion was changed and
  put back.

### The split, phase 10: moderation and people (ADR 0014)

- [x] Comments, comment reports, and feedback are moderated in the new
  admin, and invitations, accounts, and the audit log are managed there,
  at Payload's addresses; every record of the 17 collections now opens in
  the new admin (2026-10-22).
- [x] The moderation manual tests of weeks 9 and 10 pass in the new admin
  (42 checks in headless Chrome, with two new TEST members, a TEST admin,
  and a TEST moderator): a report found and acted on by hiding the advert
  with a reason, a thread locked, a report dismissed, a comment removed
  with its text erased, the members seeing the result and being told, and
  staff's Moderate links opening the new editor.
- [x] Every refusal is shown beside its field or above the form: the
  backend's integration test sends each editor's requests (16 tests) and
  checks what follows each save.
- [x] Moderators are offered no removal, see members' accounts only as "a
  member", and read only their own account; the audit log, invitations,
  and accounts are admins' alone.
- [x] Every screen is axe-clean at 1280, 768, and 390 px, light and dark,
  with no sideways scrolling; 288 integration tests pass.
- [ ] Bulk actions, and the rest of Payload's panel: phase 11.
- [x] The local database has more TEST records from the browser checks:
  9 accounts `test-*-p10*@example.test` (admins, moderators, and members
  Alice and Bob), with their invitations; 6 comments on the TEST topic
  `test-phase-8-topic-p8mvizfcaf`, two of them removed with their text
  erased, and 6 reports on them; and 2 feedback messages
  `TEST idea from the phase 10 check ...`.
