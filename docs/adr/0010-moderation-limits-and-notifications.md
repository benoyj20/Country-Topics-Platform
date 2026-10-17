# 0010: Moderation, limits, Turnstile, and notifications

- Date: 2026-10-17
- Status: Accepted

## Context

MVP week 10 completes F6 before any tester is invited. Moderators hide or
lock comments and act on reports. Members' writes need rate limits, and new
accounts need limits on links. The sign-in form needs a check against bots
(Cloudflare Turnstile). Members need to hear about replies, in the app.

[ADR 0009](0009-comments-votes-and-reports.md) built comments, votes, and
reports. Its review left two items for this week:

- staff could not hide or remove a comment;
- each comment queued one search job with no rate limit.

AGENTS.md asks that:

- moderation and admin actions are audited;
- content is hidden or locked, not erased, except for legally required
  removals;
- Valkey holds rate limits;
- external services sit behind adapters, and unfinished features stay
  behind configuration flags.

## Decision

- **Moderation happens in the admin panel.**
  - Comments gain these fields:
    - a status: visible, hidden, or removed;
    - a reason, from the report reasons;
    - a note for staff;
    - a thread lock;
    - who moderated the comment and when (set by a hook).
  - Verified staff may update comments in Payload. Field access keeps
    everything a member wrote (topic, parent, author, text, score)
    read-only. A moderation save also leaves the score out of what it
    writes, so a vote made while the save runs is kept.
  - The rules are in `packages/domain` (`moderation.ts`):
    - hiding needs a reason;
    - only verified admins remove;
    - a removed comment stays removed;
    - only threads can be locked.
  - Hooks in `apps/web/src/comments/moderation-hooks.ts` do the rest:
    - they audit every change: `comment.hidden`, `.shown`, `.removed`,
      `.locked`, `.unlocked`, and `.moderation_updated`;
    - a comment taken out of view marks its open reports "acted on" and
      notifies its author;
    - the comment's `updatedAt` changes, so its topic is re-indexed.
  - Reports gain a status: open, dismissed, or acted on. Staff can change
    only the status. Who resolved a report, and when, is recorded and
    audited. The list shows open reports first.
  - A comment's admin page lists its reports (a join field).
  - On topic pages, staff see a "Moderate" link that opens the comment in
    the admin panel. The panel still checks their authenticator.
- **What hiding does.**
  - Hidden and removed comments are not listed, counted, voted on,
    reported, replied to, or linked to.
  - A hidden thread that still has visible replies is listed as a
    placeholder. The placeholder has no author, no text, and a score of 0,
    so the replies keep their context.
  - This refines ADR 0009's note that hidden comments leave lists
    entirely.
  - Search counts only visible comments.
- **Removal.**
  - Only an admin can remove a comment, and only when the law requires it.
  - Removal erases the text: the body becomes empty.
  - Comments have no versions, and the audit entry records the reason,
    not the text, so no copy remains in the database. Backups (week 11)
    keep older copies until they expire.
  - The comment's row, votes, and reports stay.
- **Locked threads** take no new replies or votes, on the thread or its
  replies. They can still be read and reported.
- **Row locks** keep moderation and members' writes from crossing:
  - a reply takes a shared lock on its thread;
  - a vote locks the comment it changes, and shares a lock on its thread;
  - a moderator's save writes the comment's row.

  So a reply or vote either finishes before a hide or lock, or waits and
  sees it.

- **Rate limits** (`apps/web/src/rate-limit.ts`):
  - They are per member and kept in Valkey, so they hold across web
    containers.
  - Each action has fixed windows that start at its first counted request.
  - One Lua script checks every window and counts the request only if all
    have room, so refused attempts never extend the wait.
  - The windows' clock is Valkey's own key expiry.
  - The limits:
    - comments: 5 a minute and 50 a day;
    - votes: 30 a minute and 500 a day;
    - reports: 5 in 10 minutes and 20 a day;
    - display name changes: 5 a day.
  - A refusal is 429 with `Retry-After` and the code `rate-limited`.
  - A write the server then refuses (an unknown topic, a hidden or locked
    thread, a missing name) is taken back, so refusals do not use up the
    allowance.
  - If Valkey cannot be reached, writes are refused with 503 rather than
    let through uncounted.
  - The comment limit also bounds the search jobs that comments queue.

- **Link limits.**
  - Text that starts with `http://`, `https://`, or `www.` is a link. It is
    shown as one, with `rel="ugc nofollow noopener noreferrer"`, and counted
    by the same rule (`comment-links.ts`). Bare domains stay text, and so
    do addresses with a user name or password in them, which can hide
    where they lead.
  - A comment may hold three links.
  - Accounts younger than three days may post none (403, code
    `link-limit`). The account's age is measured on the web process's
    clock, the same clock that dated the account.
  - Staff are exempt from the wait: admins appoint them.
- **Turnstile** guards the email sign-in form.
  - Better Auth's `captcha` plugin (`apps/web/src/auth/turnstile.ts`) is
    the adapter. It checks the widget's token, sent in the
    `x-captcha-response` header, with Cloudflare. It times out after 10
    seconds and refuses the request if Cloudflare cannot be reached.
  - Only `/sign-in/magic-link` needs a token. Google sign-in has its own
    checks.
  - Cloudflare's answer must name the widget's action (`sign-in`) and the
    site's hostname, so a token solved elsewhere under the same key is
    refused.
  - Cloudflare's test keys always pass and answer with neither. They skip
    those two checks, and the configuration refuses them unless
    `SITE_URL` is localhost.
  - Turnstile is off unless `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`
    are both set.
  - The page loads Cloudflare's script only when it is on.
  - Comment posting has no Turnstile: members are invited and signed in,
    and the rate limits apply.
- **Better Auth's rate limits.**
  - Better Auth already limits sign-in per client address: for example,
    five email-link requests a minute.
  - It finds the address only in a trusted header. `CLIENT_IP_HEADER`
    names that header (`cf-connecting-ip` behind Cloudflare). Set it only
    when every request comes through that proxy.
  - Without the header, a production build puts every visitor in one
    shared bucket. Development uses 127.0.0.1.
- **Notifications** (a `notifications` collection, hidden in the admin
  panel):
  - A reply tells the thread's author, unless they wrote it themselves. It
    is created in the reply's own transaction.
  - A hidden or removed comment tells its author once.
  - The rows store who, what kind, and which comment. Names, text, and
    topic titles are read when the list is shown, so a changed name or a
    later decision shows as it is now.
  - A reply is listed and counted only while its text is public: not once
    it is hidden, nor while its topic is unpublished.
  - The API (personal, `private, no-store`, from the primary):
    - `GET /api/v1/account/notifications?cursor=` gives 20 at a time,
      newest first.
    - `GET /api/v1/account/notifications/unread` gives the unread count,
      up to 100; the page shows "99+".
    - `POST /api/v1/account/notifications/read` marks up to 100 of the
      member's own notifications as read.
  - The site header shows "Notifications" with the unread count to
    signed-in members. It asks when the page loads, when the reader
    returns to the tab, and after marking read, not on every page change.
  - `/notifications` lists them and marks those shown as read.
  - Each one links to `/topics/[slug]#comment-[id]`. If that thread is
    not on the first page, the topic page loads it from
    `GET /api/v1/topics/[slug]/comments/[id]`. That route is public and
    takes no parameters. Its answers, including "not found", are cached
    like the lists: briefly, because a link can arrive before the read
    connection has the reply.
  - Deleting an account deletes its notifications first.
- **API changes.** They are additive:
  - comments carry `hidden`, and threads carry `locked`;
  - the reader's account carries `staff`;
  - new error codes: `locked`, `rate-limited`, and `link-limit`.

## Consequences

- Moderators work in the admin panel. Hiding from the topic page itself
  can come later if it proves slow.
- The limits are fixed in code. Changing them is a code change and needs
  no migration.
- Fixed windows allow a short burst across a window boundary: up to twice
  the per-minute limit.
- The pilot runs behind Cloudflare (week 12), and needs:
  - `CLIENT_IP_HEADER=cf-connecting-ip`;
  - real Turnstile keys limited to the site's hostname.

  Both are pre-launch items in the checklist. Locally, Cloudflare's test
  keys show a widget that always passes.

- Only the thread's author hears about replies. Mentions and replies to a
  specific reply are not built.
- Notifications are in-app only. Email digests come after the pilot.
- Moderators cannot lock a whole topic's discussion; archiving a topic
  closes it.
- Rolling back the migration drops:
  - the moderation fields and report statuses;
  - all notifications.

  Hidden comments would show again.
