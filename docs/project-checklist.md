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
invite-only), roles, staff authenticator checks, the admin panel, a placeholder
home page, and a health check; see Weeks 1 and 2 below.

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
- [x] Role changes, account creation, and invitations are written to the
  append-only audit log (integration test, 2026-10-14).
- [x] The committed migration matches Better Auth's schema for its options
  (integration test, 2026-10-14).
- [ ] CI runs these tests with Valkey and Mailpit services.
- [ ] The developer signs in with Google and with an email link, sets up an
  authenticator, and opens the admin panel.
- [ ] Not built yet: Apple sign-in, backup codes for staff, members editing their
  name, account deletion (week 11), and a real email provider (before the pilot).
  Better Auth's rate limits are on outside tests but not yet verified (week 10).
