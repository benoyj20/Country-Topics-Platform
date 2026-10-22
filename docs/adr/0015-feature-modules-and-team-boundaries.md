# 0015: Feature modules and team boundaries

- Date: 2026-10-22
- Status: Accepted (the developer asked for it, 2026-10-22)

## Context

One developer builds the platform today, but the developer wants several
teams to be able to work on different features at once without getting
in each other's way (2026-10-22).

The apps are already apart (ADR 0014): `apps/frontend`, `apps/api`,
`apps/worker`, and `apps/backup` share code only through `packages/`, and
lint rules keep the frontend away from the database and the API away from
pages. Inside the apps, though, features were tangled in four ways:

- **Files every feature edits.** In the admin, one file named every
  collection's fields (`admin/collections.ts`) and one built every
  collection's editor (`admin/records/editors.tsx`). Others knew how to
  compare every versioned collection and how to make every collection's
  record from a field. Two teams adding fields to different collections
  would edit the same lines.
- **Folders by kind, not by feature.** `admin/records/` held the editors
  of nine collections, side by side.
- **One stylesheet for the whole admin**, 2,262 lines.
- **Nothing kept one feature out of another's code.**

## Decision

### Features and their owners

A feature is a set of collections and the screens, rules, and data that
serve them. Each belongs to one team. Until teams exist, the developer
owns them all; `.github/CODEOWNERS` lists every feature's paths, so a team
takes one over by replacing the owner on its lines.

| Team (suggested) | Features (`src/admin/features/`)                           | Collections                                                                |
| ---------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| Editorial        | `topics`, `references`, `snippets`, `media`, `archives`    | topics, topic changes, references, snippets, videos, files, archived links |
| Directory        | `individuals`, `taxonomy`                                  | individuals, countries, categories, tags                                   |
| Community        | `moderation`                                               | comments, comment reports, feedback                                        |
| Accounts         | `people`, `audit`                                          | users, invitations, audit log                                              |
| Platform         | the admin's core, `src/shared`, `packages/`, `deploy/`, CI | none of its own                                                            |

The collections in `apps/api/src/collections` and the site's pages for
them have the same owners.

### The admin's features

Each feature is a folder, `apps/frontend/src/admin/features/<name>/`,
holding what is only its own:

| File                                | What it holds                                                                                              |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `collections.ts`                    | What the admin calls its collections, their fields and stored values, and the colours its statuses show in |
| `editors.tsx`                       | Its record pages: a record's page by its id, and a new record's                                            |
| `backend.ts`                        | Its editors' reads from the REST API                                                                       |
| `new-records.tsx`                   | Its blank records, for its create page and its dialogs                                                     |
| `create-forms.tsx`                  | Its records made from another record's field, in a dialog                                                  |
| `versions.ts`, `version-backend.ts` | How its versions are compared, and one version read                                                        |
| `<name>.css`                        | Its own styles, loaded with the components that use them                                                   |
| its components                      | Its editors and views                                                                                      |

**Registries** in `src/admin/registry/` combine the features, one line per
feature: `collections.ts`, `editors.ts`, `create-forms.ts`, `versions.ts`,
and `version-reads.ts`. A feature changes its own folder; only adding or
removing a feature touches a registry. TypeScript checks that every
collection has its labels and its editor, and each registry refuses, as
it loads, two features claiming one collection (`combine()`, from
`packages/contracts`).

**The core**, everything else in `src/admin`, is what every feature uses:
the shell and navigation, lists and bulk actions, the record form and its
fields, locks, versions, the rich-text editor, and the access gate. It
knows no feature by name, and reaches features only through the
registries. Its lookups that span every collection, such as a
collection's name (`collections.ts`) or a status's colour
(`status-tone.ts`), read the registry; features use those lookups, as the
audit log does to name the records it lists, but never import a registry
themselves. The topics' pages, which are their own rather than the
generic record page, import the topics feature directly; no other admin
page imports a feature.

**Styles:** the admin's layout loads the core's in order
(`app/(admin)/admin/styles/`: base, shell, controls, lists, editors,
versions); each feature's load with its components; the dashboard's with
its page.

**Shared UI**, used by both the site and the admin (the mark, Sign out,
the rich-text view, the snippet player), lives in `src/shared`.

### Rules, enforced by lint

`apps/frontend/eslint.config.mjs` refuses an import that crosses these
lines, by its `@/` alias or by a relative path, with a message saying what
to do instead:

| From                                  | May not import                                                          |
| ------------------------------------- | ----------------------------------------------------------------------- |
| A feature                             | Another feature, the registries, or the site's components               |
| The admin's core                      | Any feature (only through a registry), or the site's components         |
| An admin page                         | Any feature, except the topics' own pages, which use the topics feature |
| The site (`app/(site)`, `components`) | The admin, except the topic preview's gate and draft read               |
| `src/shared`                          | The admin, the site's components, or any page                           |

They join the rules ADR 0014 set: the frontend imports nothing that
reaches the database or the queues, and the API renders no pages.

### What still needs both teams

Changes to these are shared interfaces (AGENTS.md): the core, the
registries, `packages/contracts`, the other packages, and a collection's
fields in `apps/api`, which the admin, the site, and the contracts all
read. Their owners review them together.

### The contracts and the API

A second step split the three files there that every feature edited:

- **The admin's lists.** Each feature defines its collections' lists in
  `packages/contracts/src/lists/<feature>.ts`, from `lists/fields.ts` and
  the domain only; `admin-lists.ts` combines them with `combine()`, which
  the frontend's registries use too. TypeScript fails when a collection
  has no list. The other contracts were already one file per feature
  (`admin-topics.ts`, `admin-references.ts`, and so on).
- **The public pages' data.** `apps/api/src/public` holds one module per
  page: `topic-page.ts`, `individual-page.ts`, `country-page.ts`,
  `home-page.ts`, `files.ts` for `/files`, and `browse.ts` with
  `browse-terms.ts` for browsing. They are built from the read model's
  shared modules: `read.ts` (the visibility rules and lookups),
  `topic-lists.ts`, `evidence.ts`, `individuals.ts` (who is public and
  which of their statements are shown), `naming.ts`, and
  `profile-links.ts`. `cached.ts` caches each page's loader with its tags.
- **The topics' rules.** `src/collections/Topics.ts` keeps the fields,
  access, and which hooks run; the hooks live in `src/topics`:
  `workflow.ts` (what a save may do and what a publish needs),
  `publish-checks.ts` (the evidence rule), `change-log.ts` (the change log,
  purges, search, and audit after a save), and `body-links.ts`.

Lint enforces two more lines:

| From                              | May not import                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| A feature's lists (`src/lists/*`) | Another feature's lists, or any of the contracts but `fields.ts`; the domain is fine |
| A module in `apps/api/src/public` | A page's module, except `cached.ts`, which caches them all                           |

The API's collections otherwise stay where Payload's config finds them,
and features there may read each other's records through Payload, as a
public individual's page lists the topics that name them.

## Consequences

**Gains:**

- A team works in its own folders; two teams changing different features
  no longer edit the same files, and review goes to the owning team.
- A new collection's admin is one folder and a line per registry.
- The boundaries are checked on every push, not remembered.

**Costs:**

- More files: what one file held is now one per feature, plus the
  registries.
- Something two features need moves into the core, which the platform
  team reviews, rather than being imported across.
- The registries still change when a feature is added: one line each.
