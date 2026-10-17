# YouTube snippet prototype

A throwaway test of the riskiest part of the Country Topics Platform (F4): paste a YouTube link,
cut a clip with start/end times, paste a transcript, and watch it play with the transcript highlighted in sync.
It has no runtime dependencies; you only need Node 22.9 or later.

## Run

```sh
make dev-prototype   # from the repository root, or `pnpm dev` in this folder
# open http://localhost:4173 and click "Try demo"
```

Optional: set a YouTube Data API key to also check duration, embeddability, privacy and age restriction
(1 quota unit per lookup, from a free 10,000 units a day):

Put `YOUTUBE_API_KEY=your-key` in the repository's `.env` (create it with `make env`);
`make dev-prototype` and `pnpm dev` load that file. An environment variable set in
your shell works too and takes precedence.

Open the page through the server, not as a file: YouTube refuses embeds on `file://` pages (error 153).

## What it tests

| Area         | How                                                                                                                                                                                                 |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Link parsing | `watch?v=`, `youtu.be/`, `/shorts/`, `/embed/`, `/live/`, a bare id, and `t=` / `start=`                                                                                                            |
| Video checks | oEmbed: title and channel, and detects disabled embedding or private/removed videos. Data API (optional): duration, embeddable, age restriction                                                     |
| Clip editor  | Full player, scrubber with the clip range shaded, "set start/end from current time", typed times, validation (end after start, within the video's length)                                           |
| Transcript   | Copy from YouTube's _Show transcript_ panel, `m:ss text` lines, or SRT/VTT; lines outside the clip are left out                                                                                     |
| Visitor view | Thumbnail first, player loads only on click; privacy-enhanced `youtube-nocookie.com`; playback stays inside the clip; synced highlighting; click a line to seek; "watch full video" link at the end |
| Data shape   | JSON matching the `videos`, `snippets` and `transcript_segments` tables in the design doc                                                                                                           |

## Tests and lint

From the repository root, `pnpm test` and `pnpm lint` include this package. Inside
this folder, run `pnpm test` (Node's test runner) and `pnpm lint` (ESLint).

The prototype is plain JavaScript, so it has no `typecheck` or `build` step. Its
TypeScript version is in the site since MVP week 6: the parsing in
`packages/domain/src/snippets.ts`, the video check in `packages/sources` and the
worker, and the editor and player in `apps/web` (see
[ADR 0006](../../docs/adr/0006-snippets-and-transcripts.md)). Changes go there;
this folder stays as the record of the experiment.

## Files

- `transcript.js`: pure parsing helpers (URLs, times, transcripts); covered by the tests
- `app.js`: page logic (editor player, preview player, sync)
- `server.mjs`: static file server plus `/api/video` lookup
- `index.html`, `styles.css`: the page and its styles

The editor state is kept in this browser's `localStorage` so a refresh doesn't lose your work.
Nothing is sent anywhere except YouTube.
