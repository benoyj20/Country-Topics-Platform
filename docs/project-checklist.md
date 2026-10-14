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

This is a standalone prototype in `prototypes/youtube-snippet`. It has no
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
- [ ] Data API checks (duration, embeddable, age restriction) with a real
  `YOUTUBE_API_KEY`.
- [ ] Behavior for a video with embedding disabled, verified with a real example.

## MVP milestones

Not started. See [the MVP plan](mvp-plan.md) for weeks 0–12.
