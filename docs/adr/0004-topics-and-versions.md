# 0004: Topics, workflow, versions, and change log

- Date: 2026-10-14
- Status: Accepted

## Context

MVP week 4 adds F3 topics: rich-text write-ups about one or more countries, linked
to individuals, moving through draft → in review → published → updated /
archived. AGENTS.md requires versioned edits with a visible change log, and that
published content and its history are never silently overwritten or deleted. Only
admins publish (product overview).

## Decision

- **Content versions are Payload's drafts and versions.** Every save is kept
  (`maxPerDoc: 0`). "Save draft" stores a new version without changing the live
  one; "Publish changes" makes it live. Visitors (from week 7) only ever read
  the live version. Each version records who saved it (`lastEditedBy`). Draft
  saves skip the required-field checks.
- **Publishing checks.** A topic needs a title, a summary, a body with text, and
  at least one country. The editor's own checks still run on each node; links
  are limited to `http`, `https`, `mailto`, topics, and individuals. Every
  publish after the first needs a **change note** saying what changed and why.
  The note is never stored on the topic and the field empties after each save,
  so an old note cannot be reused by accident.
- **Workflow state** (`state`) is set only by the server: `draft` and `in_review`
  (an admin ticked "Ready for review") before the first publish, then
  `published`, `updated`, or `archived`. A draft of changes to a published topic
  leaves its state alone, because visitors still see the live version. The rules
  are pure functions in `packages/domain` (`topic-workflow.ts`).
- **Public change log.** Each publish adds an entry to the append-only
  `topic-changes` collection: first published, updated, archived, or restored,
  with the note, the admin, and the version it describes. Nobody can create,
  edit, or delete entries through the API, and the database refuses to delete a
  topic that has entries. The audit log records every create, publish, draft
  save (which fields changed), and restore.
- **Nothing published disappears.** These are checked before anything is
  written (a `beforeOperation` hook), so bulk actions cannot slip past them:
  - Only topics that were never published can be deleted.
  - A published topic cannot be unpublished, alone or in bulk. It is archived
    instead (tick Archived, add a note, publish), which keeps its page and
    history.
  - A version of a published topic can be restored only as a draft, so going
    live again is a normal publish with a note. The admin panel offers "restore
    as draft" for published versions only, so a draft version of a published
    topic cannot be restored from the panel.
  - A duplicate starts as a fresh draft with its own slug and no publication
    history.
  - An individual, category, or tag used by any version of a topic cannot be
    deleted (the database would otherwise clear the links in published topics
    and their history); it is edited instead.
- **People in topics** are linked as subject, speaker, source, or mentioned,
  each individual at most once per role.
- **Rich text** uses Payload's Lexical editor with a small feature set:
  paragraphs, headings h2–h4, bold, italic, underline, strikethrough, lists,
  quotes, rules, and links. Uploads and embedded documents wait for evidence in
  week 5.
- **Access** matches week 3: verified staff read topics, versions, and the
  change log; only verified admins write.

## Consequences

- AGENTS.md requires linked evidence and a reference for every published
  statement about a named individual. Evidence and references arrive in week 5,
  which must add that check to publishing before public pages go live in week 7.
  Until then "published" is visible only to staff, because the site is
  invite-only and topics are not yet served to visitors.
- Version history grows without limit. That is intended; storage is small for
  text.
- A legally required removal has to be done by the database operator outside the
  app, and should be recorded in the audit log by hand.
