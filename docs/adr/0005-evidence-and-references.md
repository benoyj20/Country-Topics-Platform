# 0005: Evidence, references, file storage, and link archiving

- Date: 2026-10-14
- Status: Accepted

## Context

MVP week 5 adds what backs a topic up: evidence (documents, images, archived web
pages; video snippets follow in week 6) and references (papers, books, reports,
web pages) with the passage that supports or contradicts the topic. AGENTS.md
requires that every published statement about a named individual has linked
evidence and at least one reference, that a DOI or URL resolves before a
reference is relied on, that uploads live in S3-compatible storage, and that slow
work such as link archiving runs in the worker. Photos of individuals need a
recorded licence.

## Decision

- **Uploads** go to S3-compatible storage through Payload's S3 adapter
  (`@payloadcms/storage-s3`), configured by `S3_ENDPOINT`, `S3_REGION`,
  `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`. Locally that is
  SeaweedFS in its single-process mode (`weed mini`), a Compose service that
  creates the site's bucket and the tests' bucket. MinIO was the usual choice but
  its open-source repository was archived in 2026; SeaweedFS is Apache-2.0 and
  actively maintained. Production can use any S3-compatible service (R2, S3) by
  changing the variables.
- **One `media` collection** holds evidence files and photos: JPEG, PNG, WebP, and
  PDF only, checked by content (no SVG, which can carry scripts), at most 20 MB,
  each with a description and a required licence. Files are served through
  Payload, so they have the same access as their records (staff only until the
  public pages), with `X-Content-Type-Options: nosniff` and `private, no-store`.
  Individuals get an optional photo, which must be an image.
- **Evidence is a list on the topic** (document, image, or web page, each with a
  title and what it shows), so it is versioned with the topic and appears in its
  history. Web page evidence is copied to the Wayback Machine.
- **References are their own collection**, one record per work, reused by every
  topic that cites it, with every edit kept as a version. A reference needs a
  DOI, an ISBN, or a link; DOIs and ISBNs are normalised (lowercase DOI, ISBN-13
  with a valid check digit). A topic cites a reference with a stance (supports,
  contradicts, context), the exact passage, and an optional page (the design's
  "claim reference").
- **Reference checks run in the worker.** Saving a reference with new
  identifiers, or one not yet confirmed, sets it to "being checked" and queues a
  job. The worker asks Crossref (then the DOI system, for DOIs from other
  agencies, or when Crossref is down), Open Library, and the page itself, and stores
  "confirmed", "not found", or "could not finish". The check result is never
  accepted from a request. "Not found" (a mistake to fix) and "could not finish"
  (retried, then saving again retries) stay distinct. A page that answers 401 or
  403 counts as found, because many sites refuse automated requests; the message
  says to check it by hand.
- **The worker writes its results with SQL**, not Payload: it updates only the
  check fields of `references` and the `link_archives` table, which requests can
  never write. A job carries the identifiers it checks, and its result is stored
  only if the reference still has exactly those identifiers and is still waiting,
  so a slow job cannot confirm a DOI that was changed meanwhile. Jobs are queued
  inside the save's transaction (Payload has no after-commit hook); a job that
  arrives before the save commits finds no row and is retried.
- **Link checks never reach private networks.** Only http(s) on ports 80 and 443,
  no credentials in URLs, at most five redirects, a 10-second limit, and every
  address a host resolves to (checked at connection time, after each redirect)
  must be public.
- **Link archiving** asks the Wayback Machine's Save Page Now API for a fresh copy
  when an Internet Archive account's keys are set (`WAYBACK_ACCESS_KEY`,
  `WAYBACK_SECRET_KEY`), and otherwise records the closest existing copy. A link's
  first copy is never replaced. An admin can add a copy from another archive by
  hand. Archiving starts from the first draft save, so copies exist by the time
  the topic is published.
- **The "Look up" button** fills in a reference from its DOI or ISBN by calling
  the same services from the web request, bounded by an 8-second limit, because
  the admin is waiting for the answer. It never decides whether the reference is
  confirmed.
- **Publishing rules.** A topic that names an individual (in its list of people
  or by linking them in its text) needs at least one piece of evidence and at
  least one reference. Every cited reference must be confirmed, whoever the topic
  names. Archiving a published topic is never blocked by these rules, because it
  only takes the topic out of lists.
- Evidence files, references, and photos used by any topic version or individual
  cannot be deleted (409), like individuals, tags, and categories in week 4.

## Consequences

- Topics that name people can only be published with evidence and confirmed
  references, so public pages (week 7) can rely on the rule.
- Without Internet Archive keys, links are archived only if the Wayback Machine
  already holds a copy. Saving fresh copies is an optional feature for after the
  pilot (v2, `docs/mvp-plan.md`): the code is in place and turns on when the
  keys from a free archive.org account are set
  (`docs/runbooks/ownership-transfer.md`).
- Crossref, the DOI system, Open Library, and the Wayback Machine's CDX index
  are used without accounts; requests name the site and `CONTACT_EMAIL`, as
  Crossref and Open Library ask. A book Open Library does not know is "not
  found"; the admin adds a link instead, such as the publisher's page. Google
  Books would widen coverage but needs its own API key: without one it shares a
  daily quota with every caller and was refused when tried (14 October 2026).
- The Wayback Machine's simpler availability API answered "no copy" even for
  well-archived pages when tried, so copies are found through its CDX index.
- The worker depends on the column names Payload generates for these two
  collections; a migration that renames them must update
  `packages/jobs/src/content-store.ts`, and the integration tests run the
  worker's store against the migrated test database to catch it.
- Editing a reference used by a published topic makes it "being checked" again;
  the published topic stays as it is, but publishing it again waits for the
  check.
- Uploaded files are not scanned for malware; only verified admins can upload,
  and only images and PDFs are accepted.
