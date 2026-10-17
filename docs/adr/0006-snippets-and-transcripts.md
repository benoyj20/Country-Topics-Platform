# 0006: Video snippets, videos, and transcripts

- Date: 2026-10-16
- Status: Accepted

## Context

MVP week 6 builds F4: a clip of a YouTube video, from a start to an end time,
with the transcript of what is said in it, used as evidence for topics. The
prototype in `prototypes/youtube-snippet` showed that the flow works: paste a
link, cut the clip in an editor player, paste a transcript, and watch it play
with the transcript highlighted in step. AGENTS.md sets the YouTube rules:
embed with the IFrame Player API on `youtube-nocookie.com`, load the player only
after a click or consent, never download video, audio, or captions of
third-party videos, respect the embeddable status, and keep the transcript when
a video disappears. It also asks that no transcript stays distinct from an
empty one, that slow work such as video checks runs in the worker, and that
check results are never accepted from a request (as for references in
[ADR 0005](0005-evidence-and-references.md)).

## Decision

- **Videos are their own collection**, one record per YouTube id, shared by
  every snippet cut from that video ("one video reused across many snippets").
  Saving a snippet adds its video. Requests can never create or change a video;
  admins can delete one that no snippet uses.
- **The worker checks each video with YouTube** (`check-video` job): oEmbed for
  the title, the channel, and whether it may be embedded, and, when
  `YOUTUBE_API_KEY` is set, the Data API for the length, embedding, privacy,
  and age restriction (one quota unit per check). The key goes in a header,
  never in a URL. A Data API failure keeps oEmbed's answer and is logged. The
  worker stores "playable", "cannot be embedded" (including age-restricted),
  "removed or private", or "could not finish", writing only the video's check
  fields with SQL, and only while the video waits for a check. It also records
  when the video was first found playable (`confirmed_at`), which is never
  cleared.
- **When a video is checked again**: saving a snippet queues a check when the
  video is new, not playable, or last checked over a day ago; a video already
  waiting keeps its request. Job ids name the record and the request, so
  repeated saves add one job per request and a newer request is never
  swallowed by an older job that is still retrying. There are no periodic
  checks yet.
- **Telling an uncommitted save from an earlier check.** Jobs are queued inside
  the save's transaction, so a fast worker can still see the record as it was
  before. The save stores the request's time with the "being checked" status
  (`checkRequestedAt`) and the job carries the same value. The worker compares
  the two copies, never two clocks: an older stored value means the save has
  not committed (retry), a newer one means a later save queued its own job,
  and an equal one is the record the job was queued for. Reference checks
  ([ADR 0005](0005-evidence-and-references.md)) had the same gap when a
  reference was saved again (unchanged after "not found" or "could not
  finish", or with new identifiers), and now use the same rule.
- **Lost checks are queued again.** When the worker starts, it queues a job
  for every reference and video still waiting for a check (up to 1,000 per
  start), so a check lost to an emptied Redis, a bug, or a job from before a
  deploy does not stay "being checked". The migration that added the request
  time stamped the records already waiting.
- **Snippets are their own collection**, versioned and audited like
  references, so one snippet can back several topics: a caption, the YouTube
  id (a pasted link is stored as its id), start and end in seconds (stored in
  tenths), an optional speaker (an individual), the language, and the
  transcript. Once a topic uses a snippet, its video cannot change (another
  video needs its own snippet and checks); its clip and transcript can, like a
  reference's details.
- **Transcripts are pasted by an admin**: YouTube's transcript panel,
  `m:ss text` lines, SRT, or WebVTT, with timestamps counting from the start of
  the video or of the clip. Nothing is fetched from YouTube's captions. The
  pasted text is stored, and the server parses it on every save with the same
  code the editor uses (`packages/domain/src/snippets.ts`) into the segments
  inside the clip, in video time (the design's transcript segments). A line
  that began before the clip keeps its real start. An empty text means the
  snippet has no transcript, which is allowed; text with no timestamps, or with
  no line inside the clip, is refused.
- **A topic uses a snippet as evidence** with a new evidence kind, "Video
  snippet", whose title is optional (the caption is shown). Publishing needs
  every snippet's video to have been found playable at least once, and the clip
  to end within the video's length when it is known (with one second to spare,
  as the Data API reports whole seconds). A video that was playable
  and later disappears does not block publishing: visitors see the transcript
  and a notice instead of the player.
- **One player component** (`apps/web/src/components/snippets/SnippetPlayer`)
  shows a snippet in the admin preview now and on topic pages from week 7: a
  thumbnail until clicked, then the IFrame API (loaded on that first click)
  with the privacy-enhanced host, kept inside the clip, with the transcript
  highlighted and clickable, Replay, and a link to the full video. The admin's
  clip editor also loads the player only when asked ("Load video" or "Open the
  player").
- Videos used by snippets, snippets used by topics (live or in any version),
  and individuals named as speakers cannot be deleted (409), as in ADR 0005.

## Consequences

- Without a Data API key the video's length is unknown, so the server cannot
  check that a clip ends within the video (the editor's player still does), and
  age restrictions are not detected. oEmbed answers alike for private videos
  and videos that cannot be embedded, so the message names both.
- The thumbnail before the click comes from YouTube's image server
  (`i.ytimg.com`, which sets no cookies), so the visitor's browser contacts it
  before any consent. The public pages (week 7) and the consent banner (after
  the pilot) should decide whether to serve thumbnails through the site
  instead.
- A video that disappears is noticed only when a snippet of it is saved again,
  or by the visitor's player; periodic checks can be added later as a
  scheduled worker job.
- The worker depends on the column names Payload generates for `videos`; a
  migration that renames them must update `packages/jobs/src/content-store.ts`,
  and the integration tests run the worker's store against the migrated test
  database.
- The migration cannot be rolled back once any topic or topic version uses a
  snippet, because that would delete evidence and its history; its `down`
  refuses with a message saying so.
- A snippet's speaker does not count as the topic naming that individual: the
  topic's own list of people and the links in its text decide that, as before.
