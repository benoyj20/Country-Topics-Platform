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
- [ ] Not built yet: serving video thumbnails through the site (decided with
  the consent banner after the pilot).

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
- [ ] The developer restores a backup.
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
are from the developer's PC (Docker Desktop on Windows, 16 GB), 2026-10-18.

- [x] Shared page cache (integration tests against Valkey). Two handlers,
  standing in for two web containers:
  - serve a page one stored to the other, with its Buffers and Maps intact;
  - drop it everywhere once a tag it shows is purged, while a page with
    other tags stays;
  - check data entries against the tags they were stored with.

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
  - pages came from the shared cache on both (HIT);
  - a TEST topic published through one container showed its change on both
    at once;
  - five comments were taken and the sixth refused (429), alternating
    between containers.

  Both workers took jobs from the rehearsal's own queues.
- [x] Step 2, load tests (k6 in the Compose network). The data: 1,002
  topics, 50 TEST members, and 9,992 comments, seeded by `make scale-seed`.
  - Cached pages, 100 visitors: 31,044 requests at 294 a second, median
    15 ms, 95th percentile 36 ms, no failures.
  - Uncached (search, browse, comments), 50 visitors: 11,659 requests,
    95th percentile 46 ms, no failures.
  - Uncached back to back, 50 visitors with no pauses: 561 requests a
    second, 95th percentile 201 ms, no failures. Comments were the slowest
    (95th percentile 228 ms, against 113 ms for search and browse).

    The thread query runs in 0.3 ms (planning 1.3 ms) on its indexes, so
    the time is the endpoint's several round trips, not a slow query. No
    query needed fixing at this size, 20 times the pilot's.
- [x] Failover: stopping one web container during the cached test failed
  142 of 29,144 requests (0.48%). The load balancer kept sending requests
  to it until its next health check. With retries on another container
  and passive health checks in the Caddyfile, the same test had 0 failures
  in 29,868 requests (the slowest 2.6 s, while retried).
- [ ] The developer runs the rehearsal (`make scale-up`, `make scale-check`,
  `make load-test`).
- [ ] Step 4, not done: a test copy on free cloud tiers (managed PostgreSQL,
  Redis, storage, and a container host) by changing environment variables
  only. It needs the developer's cloud accounts; the images and
  `make scale-check` are what it will reuse.
