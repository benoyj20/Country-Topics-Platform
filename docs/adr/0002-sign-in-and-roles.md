# 0002: Sign-in with Better Auth, roles in Payload

- Date: 2026-10-14
- Status: Accepted

## Context

MVP week 2 needs Google and email-link sign-in, the roles from the product
overview (visitor, member, moderator, admin), two-factor verification for staff,
and an invite-only allowlist for the pilot. Payload's built-in auth is
email-and-password only. The site must stay stateless (AGENTS.md).

## Decision

- **Better Auth** handles sign-in: Google, email links, sessions, and authenticator
  apps (its `magicLink` and `twoFactor` plugins). Its tables live in the same
  PostgreSQL database with an `auth_` prefix and are created by a normal Payload
  migration; an integration test fails if the migration and Better Auth's options
  drift apart.
- **Payload** keeps one profile per person (`users`) with the role. A Payload auth
  strategy trusts the Better Auth session and links the two by `users.authUserId`.
  Payload's password login and first-user screen are turned off.
- **Staff verification.** Better Auth's two-factor plugin only challenges password
  sign-ins, and the site has none. Moderators and admins therefore confirm a code
  from their authenticator app after signing in (`/api/auth/admin-verification/verify`).
  The session records when, and every staff permission (admin panel, REST, local
  API with a request) requires a confirmation in the last 12 hours. Five wrong
  codes lock verification for 15 minutes. `make reset-2fa` removes a lost
  authenticator from the host.
- **Invite-only** (`INVITE_ONLY`, on by default): only addresses in the
  `invitations` collection, or in `ADMIN_EMAILS`, can create an account; the
  invitation sets the role. Uninvited addresses get no email, and the form answers
  the same way, so it does not reveal who is invited.
- **Email goes through the queue.** The web app adds a job to BullMQ on Valkey;
  `apps/worker` sends it over SMTP (Mailpit locally) through the `EmailSender`
  adapter in `packages/email`.
- Role changes and invitations are written to the append-only `audit-log`
  collection.

## Consequences

- Two auth tables per person (`auth_user` and `users`) must stay linked; profile
  creation is idempotent and runs on first sign-in or first request.
- Upgrading Better Auth can change its schema; run the integration tests and add a
  migration from its schema generator when they fail.
- Apple sign-in, member self-service (name changes, account deletion), and
  backup codes for staff are not built yet.
