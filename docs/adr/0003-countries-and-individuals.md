# 0003: Countries, categories, tags, and individuals

- Date: 2026-10-14
- Status: Accepted

## Context

MVP week 3 adds the reference data that topics (week 4) hang from: countries,
categories, tags, and F2 individuals, with a warning when an admin may be entering
someone who is already in the database. The site names real people, so the data
model must not invent facts about them (AGENTS.md), and nothing is public until the
public pages and their cache rules arrive in week 7.

## Decision

- **Countries are the closed ISO 3166-1 list**, 249 entries loaded by a migration
  (`20261014_223400_seed_countries`). Codes and names come from Debian's
  `iso-codes` (`data/iso_3166-1.json`); the region and sub-region used to group the
  country picker come from the UN M49 standard, joined on the numeric code. Both
  were retrieved on 14 October 2026 and the rows are written out in the migration,
  so every database gets the same list. The display name is the entry's common
  name where `iso-codes` has one ("Bolivia"), otherwise the ISO short name, which
  is kept separately. Countries cannot be created or deleted through the API, and
  their codes never change; admins may adjust the display name, slug, and region.
  M49 has no region for Antarctica (AQ) and no entry for Taiwan (TW), so both are
  left empty for an admin to decide.
- **Categories and tags** are flat name-and-slug lists. Topics will use them in
  week 4.
- **Individuals** have a name, aliases, a one-line role or description, countries
  with a role and a period, a plain-text bio, links, an optional Wikidata ID, and
  a slug. Periods are stored as **partial dates** (`2019`, `2019-05`, or
  `2019-05-14`), only as precise as the source, never padded to a made-up day.
  Links must be `http:` or `https:`. Photos wait for uploads to S3-compatible
  storage (week 5), together with their licence.
- **Duplicate warning.** Names and aliases are compared by a key that ignores
  case, accents on Latin and Greek letters, punctuation, and word order ("Diaz,
  José Pérez" matches "José Pérez-Díaz"). Marks in other scripts, such as
  Devanagari vowel signs, are part of the name and kept:
  - The same name or alias as another individual: the admin form shows the match
    as they type, and the server refuses to save until the admin ticks "This is a
    different person". This applies when an individual is created and when a name
    or alias is added later; names saved before were already confirmed. The form
    and the save share one rule, and saves that add the same name take turns
    (a transaction-scoped advisory lock), so two at once cannot both slip past.
  - The same Wikidata ID: refused outright by a unique index.
  - A similar spelling (PostgreSQL `pg_trgm` similarity of 0.6 or more, through
    trigram indexes): shown as information only.
- **Staff-only reads for now.** Verified staff (the week 2 authenticator check)
  can read these collections; only verified admins can change them. Visitors get
  them in week 7 through `/api/v1` routes with cache headers, not through
  Payload's REST API.
- **Every change is audited.** Creates and deletes record a snapshot of the
  document, and updates record the fields that changed, so a deleted individual
  or tag keeps its trace in the audit log.

## Consequences

- The database needs the `pg_trgm` extension. It ships with PostgreSQL and is
  trusted, so the database owner can enable it, as the migration does; managed
  PostgreSQL services offer it. The trigram indexes exist only in that migration,
  because Payload's schema cannot describe them.
- A change to ISO 3166-1 (a new or renamed country) is a new migration, not an
  edit to the seed.
- Confirming "different person" applies to the save that carries it; the answer
  itself is not stored.
- Profiles state facts about real people. Before they become public (week 7),
  each published statement needs linked evidence and a reference (AGENTS.md).
