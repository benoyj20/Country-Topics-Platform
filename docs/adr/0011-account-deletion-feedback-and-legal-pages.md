# 0011: Account deletion, data export, feedback, and legal pages

- Date: 2026-10-17
- Status: Accepted

## Context

MVP week 11 makes the site ready for testers' data before the pilot. Its
plan lists account deletion, a feedback button, and a draft privacy policy
and terms; the manual test is "delete a test account". Backups, Sentry,
and the scale rehearsal are the rest of week 11, in a later PR.

Until now only an admin could delete a profile, which also deleted the
sign-in account and the member's notifications. Their comments stayed,
showing no name. [ADR 0009](0009-comments-votes-and-reports.md) left open
whether deletion should also erase the comments' text.

AGENTS.md asks that:

- the site supports data export and deletion;
- moderation and admin actions are audited, and content is hidden rather
  than erased, except where the law requires erasing it.

## Decision

- **Members delete their own account** on `/account`, through
  `DELETE /api/v1/account`.
  - They confirm by typing their email address.
  - Their session must have started in the last 10 minutes; otherwise the
    answer is 403 with the code `sign-in-again`, and the page offers to
    sign in again. Someone at a device left signed in cannot delete the
    account.
  - Staff accounts are refused (403, `staff-account`). Another admin
    deletes them, so the site is never left without an admin by mistake.
  - The request must come from the site itself, like other members'
    writes.
- **Deleting an account does the same however it is done**, whether the
  member or an admin deletes it (Users' delete hooks,
  `src/account/deletion.ts`), in one transaction:
  - The profile's row is locked first. A comment or vote being saved at the
    same moment waits for the deletion and then fails, so nothing slips in
    after the erasure.
  - Comment text is erased: every comment of theirs that was not already
    removed gets the new status `deleted` and an empty body. This settles
    ADR 0009's question in favour of privacy: a comment's text is personal
    data even without a name. Replies by others stay. A thread with
    visible replies shows as a placeholder: "This comment's author deleted
    their account". The topic's search count is updated.
  - Notifications and feedback are deleted.
  - Votes stay in comment scores and reports stay for moderators. The
    database clears their link to the account.
  - The audit log records `user.deleted` with the email address and
    `own: true` or `false`. A member deleting their own account is no
    longer there to name as the actor, so the actor is empty.
  - Last, the Better Auth user is deleted, which ends every session. It is
    the only step that cannot roll back with the rest.
- **Staff cannot set or undo `deleted`** in the admin panel. They can
  still lock a deleted thread.
- **Data export.** `GET /api/v1/account/export` returns a JSON file of
  what the site holds about the member:
  - account, linked sign-in providers, and sessions (with IP address and
    user agent);
  - comments (including the text of hidden ones), votes, reports,
    notifications, and feedback.

  Staff's notes about a comment are left out. The answer is
  `private, no-store`. Requests the browser marks as coming from another
  site are refused, so a link elsewhere cannot use up the member's
  allowance of 10 a day.
- **Feedback.** "Send feedback", at the bottom of every page, opens
  `/feedback?from=<path>`.
  - Signed-in members choose a kind (a problem, an idea, or something
    else) and write up to 2,000 characters.
  - `POST /api/v1/feedback` stores it with the path it came from, without
    the path's query or fragment, which can hold search terms or tokens.
  - Limits: 5 an hour and 20 a day, in Valkey like the other limits.
  - Staff read it in the admin panel under Administration → Feedback, new
    first, and mark it done. They cannot change what was sent.
- **Draft privacy policy and terms** at `/privacy` and `/terms`, linked
  from the footer and the sign-in page.
  - They describe what the code does and nothing it does not.
  - Who runs the site and how to reach them come from `SITE_OPERATOR` and
    `CONTACT_EMAIL`.
  - Anything not decided yet is marked "To be decided" on the page: the
    applicable law and legal bases, the minimum age, which email service is
    used, retention of audit records and backups, appeals, and the limits
    of responsibility. Nothing is made up to fill those gaps.

## Consequences

- Deletion cannot be undone. A deleted member needs a new invitation. The
  invitation they accepted, and the audit entries naming their email, stay
  for the record. The privacy policy says so, and how long they stay is to
  be decided.
- Backups (later in week 11) keep older copies of erased data until they
  are replaced. The privacy policy must give their retention before the
  pilot.
- Sentry, added later in week 11, will receive error details. The privacy
  policy must be updated in the same PR.
- Before testers are invited, the developer:
  - sets `SITE_OPERATOR` and `CONTACT_EMAIL`;
  - decides the marked items;
  - should have both pages reviewed, because the site names real people.
- Rolling back the migration:
  - drops all feedback;
  - turns `deleted` comments into `removed` ones, which stay erased.
- The rollbacks of the week 9 and week 10 migrations failed: they dropped
  a table with `CASCADE` and then one of the constraints the `CASCADE` had
  already removed. They now drop those constraints only if they still
  exist. Rolling back weeks 9 to 11 together and applying them again was
  tested on a scratch database. Rolling back further, to week 1, still
  fails, and recovery relies on backups instead (later in week 11).
