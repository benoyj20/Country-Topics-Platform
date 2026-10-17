# MVP plan: 100-person pilot

Goal: a working site, run from the developer's PC, that 100 invited testers use for
four weeks. The pilot must show that people find the evidence useful, that they
discuss it, and that an admin can publish topics quickly. The same code must later
run as the public site without a rewrite (see [ADR 0001](adr/0001-initial-architecture.md)).

Estimated effort: about 12 weeks full-time with AI assistance, or about 24 weeks at
20 hours a week. Running cost during the pilot: $0, plus an optional domain.

## Scope

| In the MVP | After the pilot |
| --- | --- |
| Sign-in (Google, email magic link) and roles: visitor, member, moderator, admin | F5 AI reference search |
| Countries, categories, tags | Payments, subscriptions, Patreon, Buy Me a Coffee |
| F2 individuals | Ads and the consent banner |
| F3 topics with evidence and manually entered references | Email digests |
| F4 snippets with manual transcripts (from the prototype) | Multiple UI languages (i18n is set up, English only) |
| F1 browsing, filters, search (PostgreSQL full text behind a search adapter) | PWA, member suggestion queue, Meilisearch |
| F6 comments, votes, reports, moderator tools | Optional: fresh Wayback Machine copies of evidence links (needs a free Internet Archive account) |
| In-app reply notifications | |

Pilot content: one or two countries, 20–50 topics, 10–20 individuals.

## Weekly milestones

Each week ends with something the developer can test by hand. Each milestone is
one task branch and one PR unless it is too large to review as one change.

| Week | Build | Manual test |
| --- | --- | --- |
| 0 | Accounts: Google Cloud project (OAuth client, YouTube API key); install Docker Desktop. The email provider (Brevo or Resend) can wait until before the pilot, and Cloudflare until week 10 | The YouTube key works in the prototype; Google accepts the OAuth client |
| 1 | Next.js + Payload in `apps/web`, Compose services, CI running real lint/typecheck/test/build | Admin panel opens locally |
| 2 | Sign-in, roles, admin 2FA, invite-only allowlist | Sign in with Google and with an email link |
| 3 | Countries seeded from ISO 3166-1, categories, tags, F2 individuals with duplicate warning | Add five individuals |
| 4 | F3 topics: rich text, linked individuals, workflow states, versions and change log | Write and publish one topic |
| 5 | Evidence (uploads to S3-compatible storage, archived links) and references (DOI/ISBN lookup) | Add three references to a topic |
| 6 | F4 snippets: port the prototype into the admin and topic pages, in TypeScript | Add a clip with a synced transcript |
| 7 | Public pages: home, country, topic, individual; cache headers and tags | Browse as a visitor, including on a phone |
| 8 | F1 filters, sorting, search, shareable URLs | Filter, copy the link, open it elsewhere |
| 9 | F6 comments: two levels, votes, sorting, report button | Comment from two accounts |
| 10 | Moderation, rate limits, Turnstile, link limits for new accounts, reply notifications | Report and hide a comment |
| 11 | Hardening and **scale rehearsal** (below), backups, Sentry, draft privacy policy and terms, account deletion, feedback button | Restore a backup; delete a test account |
| 12 | Pilot launch: Cloudflare Tunnel, load 20–50 topics, `noindex`, invite the first 10 testers | First testers sign in |

## Scale rehearsal (week 11)

1. Run two `web` containers and two `worker` containers behind a local load
   balancer to prove the app is stateless.
2. Load-test with k6, cached and uncached, and fix slow queries.
3. Restore a backup into a fresh database.
4. Deploy a test copy on free cloud tiers (managed PostgreSQL, Redis, R2/S3
   storage, a container host) by changing environment variables only.

## Running the pilot

- Invite in waves: 10 testers for a few days, then 50, then 100.
- Keep it private: invite-only sign-up and `noindex`, because the site names real people.
- The host PC stays on; 16 GB RAM is enough for the MVP.

| Question | Measure | Good sign |
| --- | --- | --- |
| Can an admin publish quickly? | Time to create one topic | Under 30–45 minutes |
| Do testers return? | Testers active in week 2 or later | Over 40% |
| Do they discuss? | Comments per topic | 3 or more on average |
| Do they trust it? | End-of-pilot survey | Most say the evidence helped |
| Does it work? | Sentry errors, failed snippet playback | Few, and fixed quickly |

## After the pilot

Move to rented hosting by changing configuration (copy the database with
`pg_dump`/`pg_restore` and files with `rclone`, point Cloudflare at the new host,
update OAuth redirect URLs, turn off invite-only). Then add F5, payments, ads, and
notifications based on what testers report.
