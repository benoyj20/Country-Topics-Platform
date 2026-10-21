# 0001: Initial architecture and scale-ready rules

- Date: 2026-10-14
- Status: Accepted; the one deployable web app and pgvector are superseded
  by [ADR 0014](0014-split-site-and-backend.md)

## Context

The design document targets 5 million monthly visitors on a cache-first, layered
architecture. The first release is a 100-person pilot run from the developer's PC
on free services, built by one developer with coding agents. Moving from the pilot
to the public site should change hosting and configuration, not application code.

## Decision

- TypeScript throughout, in a pnpm workspace: Next.js (App Router) with Payload CMS
  for the site, admin panel, and `/api/v1` in `apps/web`; BullMQ workers in
  `apps/worker`; shared domain logic, schema, adapters, and UI in `packages/`.
  The design document allowed NestJS or FastAPI for the API; one language and one
  deployable web app suit a solo developer.
- PostgreSQL 17 with pgvector as the only source of truth. The design document
  named PostgreSQL 16; 17 is the current image used locally and is widely offered
  by managed providers.
- Valkey (Redis-compatible) for sessions, rate limits, the shared page cache, and
  BullMQ queues. Managed Redis or Valkey replaces it in production unchanged.
- S3-compatible object storage for uploads, added with the evidence feature.
- Search starts on PostgreSQL full text behind a search adapter; Meilisearch or
  OpenSearch replaces it when facet load requires it.
- Local services run in Docker Compose (`deploy/compose`), bound to `127.0.0.1`.
  The pilot is exposed through Cloudflare Tunnel.
- The invariants in the "Build for scale from the first commit" section of
  `AGENTS.md` (stateless containers, environment configuration, queue for slow
  work, rebuildable derived stores, read/write connection split, adapters, cache
  headers, cursor pagination, feature flags) are mandatory.

## Consequences

- Going live means copying data (`pg_dump`/`pg_restore`, `rclone`), setting
  environment variables, and pointing Cloudflare at the new host.
- Choosing a search engine, splitting services, or moving off Payload later needs
  a new ADR.
- The pilot depends on the developer's PC staying on; this is accepted for 100
  invited testers and is not acceptable for public launch.
