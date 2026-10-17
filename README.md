# Country Topics Platform

A public, country-organised knowledge site. Each topic is backed by evidence —
timestamped YouTube snippets, transcript excerpts, and reference literature — linked
to the individuals involved, and open to community discussion. AI suggests
references from real bibliographic databases; an admin approves every one.

See the [product overview](docs/product-overview.md) for roles and features (F1–F6).

## Contributing

See [the contributor guide](CONTRIBUTING.md) for setup, branch naming, verification,
and the PR flow. Coding agents must also follow [AGENTS.md](AGENTS.md).

## Current project plans

- [Project and testing checklist](docs/project-checklist.md): what works today
- [MVP plan](docs/mvp-plan.md): the 12-week build for a 100-person pilot
- [Architecture decisions](docs/adr/README.md)
- [Ownership transfer runbook](docs/runbooks/ownership-transfer.md): every account to move later

## Implementation status

The repository began with a **YouTube snippet prototype**: paste a link, cut a
clip, paste a transcript, and watch it play with synced highlighting. It tested the
riskiest part of the product (F4) on its own; the site now has its typed version.

The **site and admin panel** (`apps/web`) run on Next.js and Payload with
PostgreSQL. People sign in with Google or an emailed link (invite-only during the
pilot); moderators and admins also confirm a code from an authenticator app before
the admin panel opens. Sign-in emails are sent by the worker (`apps/worker`)
through a job queue. In the admin panel, staff manage the ISO 3166-1 countries,
categories, tags, and individuals, with a warning when an individual may already
be in the database. Admins write topics in a rich text editor, link them to
countries and individuals, and publish them; every version is kept and each
publish adds a change log entry. Topics carry evidence (documents, images, and
web pages copied to the Wayback Machine) and references with the passage they
support; files are stored in S3-compatible storage, and the worker confirms each
reference's DOI, ISBN, or link before it can be published. Admins cut video
snippets from YouTube videos with a pasted transcript, preview them with the
transcript highlighted as the clip plays, and use them as evidence once the worker
has found the video playable. A topic that names an individual needs evidence and
a confirmed reference. Visitors read published topics, country pages, and
profiles, and browse every topic at `/topics`: search words, filters for
country, category, tag, person, evidence, snippet language, references, and
publish date, and sorting, all kept in the address so a link opens the same
results. The worker keeps a PostgreSQL full-text search index up to date as
topics are published. Signed-in members discuss each topic under a public name
they choose: comments with one level of replies, up and down votes, sorting, and
a report button; staff read comments and reports in the admin panel, and
`/topics` can sort by the most discussed. There is a health check at
`/api/v1/health`. Moderation and the other features follow the
[MVP plan](docs/mvp-plan.md); see the checklist for what is verified.

```sh
make dev-prototype
```

Open `http://localhost:4173` and click **Try demo**. See
[the prototype guide](prototypes/youtube-snippet/README.md).

## Repository layout

- `apps/web` — Next.js site, Payload admin, and `/api/v1`
- `apps/worker` — background jobs on BullMQ: sign-in emails, reference checks, link archiving, video checks, the search index
- `packages/domain` — roles, sign-up rules, name, slug, date, DOI, and ISBN rules, the topic workflow, the evidence rules, snippet and transcript parsing, language codes, the plain text of rich text, and the comment, vote, report, and display-name rules
- `packages/email` — the email adapter (SMTP) and email templates
- `packages/jobs` — job queues shared by the web app and the worker, and the worker's database reads and writes
- `packages/search` — the search adapter: topic search with filters and facets, on PostgreSQL full text
- `packages/sources` — outside services: Crossref, the DOI system, Open Library, Google Books (optional), the Wayback Machine, YouTube (oEmbed and the Data API), and safe link checks
- `prototypes` — throwaway experiments; apps never import from here
- `deploy/compose` — local PostgreSQL (pgvector), Redis-compatible Valkey, Mailpit, SeaweedFS (S3-compatible storage)
- `deploy/scripts` — local setup helpers, such as the `make env` script
- `docs` — plans, checklist, architecture decision records, and runbooks
- `.claude` — repo-local Claude Code skills and review agents

## Prerequisites

- Node.js 22.18 or later (the worker and packages run TypeScript directly), with pnpm 10 through Corepack (`corepack enable`)
- Docker Desktop (Compose v2)
- Git and the GitHub CLI (`gh`)
- GNU Make (optional; every target is a plain `pnpm` or `docker compose` command)

## Run the development setup

```sh
make env         # creates .env, or adds missing variables; never changes set values
make bootstrap   # pnpm install
make infra-up    # PostgreSQL on 5433, Valkey on 6379, Mailpit on 1025/8025, S3 storage on 8333
make migrate     # applies the database migrations
make dev         # site at http://localhost:3000 and the worker
```

To become the first admin, put your address in `ADMIN_EMAILS` in `.env`, restart
`make dev`, and sign in at `http://localhost:3000/sign-in`, with Google or with the
emailed link (it arrives in Mailpit). On `/account`, set up an authenticator app,
then open the admin panel. Invite other people from the admin panel's
**Invitations** collection. If someone loses their authenticator app, run
`make reset-2fa EMAIL=their@address` and they can set up a new one. The dev server
listens on `127.0.0.1` only.

Mailpit's inbox is at `http://localhost:8025`. Uploaded files go to the
`countrytopics` bucket of the local SeaweedFS storage (data in a Docker volume). The
worker checks references with Crossref, the DOI system, and Open Library (with
Google Books as a backup when `GOOGLE_BOOKS_API_KEY` is set) and looks
for existing copies of links in the Wayback Machine. Saving fresh copies is an
optional feature planned for after the pilot; it turns on when an Internet
Archive account's keys are set in `WAYBACK_ACCESS_KEY` and `WAYBACK_SECRET_KEY`.
PostgreSQL uses host port 5433 so it
does not clash with other local projects on 5432. Run all checks with `make check`;
its integration tests rebuild the separate `countrytopics_test` database and never
touch development data.
