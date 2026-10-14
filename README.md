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

## Implementation status

The repository contains a working **YouTube snippet prototype**: paste a link, cut a
clip, paste a transcript, and watch it play with synced highlighting. It tests the
riskiest part of the product (F4) on its own. The Next.js site, admin panel, and
database-backed features are planned; see the checklist for details.

```sh
make dev-prototype
```

Open `http://localhost:4173` and click **Try demo**. See
[the prototype guide](prototypes/youtube-snippet/README.md).

## Repository layout

- `apps/web` — Next.js site, Payload admin, and `/api/v1` (planned, MVP week 1)
- `apps/worker` — background jobs on BullMQ (planned)
- `packages` — domain logic, database schema, adapters, shared UI (planned)
- `prototypes` — throwaway experiments; apps never import from here
- `deploy/compose` — local PostgreSQL (pgvector), Redis-compatible Valkey, Mailpit
- `docs` — plans, checklist, and architecture decision records
- `.claude` — repo-local Claude Code skills and review agents

## Prerequisites

- Node.js 22 or later, with pnpm 10 through Corepack (`corepack enable`)
- Docker Desktop (Compose v2)
- Git and the GitHub CLI (`gh`)
- GNU Make (optional; every target is a plain `pnpm` or `docker compose` command)

## Run the development setup

```sh
make env         # creates .env from .env.example; never overwrites
make bootstrap   # pnpm install
make infra-up    # PostgreSQL on 5433, Valkey on 6379, Mailpit on 1025/8025
```

Mailpit's inbox is at `http://localhost:8025`. PostgreSQL uses host port 5433 so it
does not clash with other local projects on 5432. Run all checks with `make check`.
