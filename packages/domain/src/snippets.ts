/**
 * F4 snippets: a clip of a YouTube video, from a start to an end time, with
 * the transcript of what is said in it. One video record is shared by every
 * snippet cut from it. Pure helpers, used by the admin editor in the browser
 * and by the server, which stores what they compute.
 */

export const YOUTUBE_ID_PATTERN = /^[\w-]{11}$/;

/** Clips longer than this are allowed, but the editor suggests a tighter one. */
export const SNIPPET_LONG_CLIP_S = 600;
/** Bounds typed times; YouTube videos are at most 12 hours long. */
export const SNIPPET_MAX_TIME_S = 24 * 60 * 60;
/**
 * How far a clip may end past the video's known length: the Data API reports
 * whole seconds while the player reports fractions, so a clip ending at
 * 95.9 s fits a video the Data API calls 95 s long.
 */
export const VIDEO_LENGTH_TOLERANCE_S = 1;
/** A pasted transcript; a full hour of speech is about 60,000 characters. */
export const TRANSCRIPT_MAX_LENGTH = 200_000;
export const TRANSCRIPT_LINE_MAX_LENGTH = 2_000;

/**
 * Whether a transcript's timestamps count from the start of the video (as
 * YouTube's transcript panel shows them) or from the start of the clip.
 */
export const TRANSCRIPT_TIMEBASES = ["video", "clip"] as const;
export type TranscriptTimebase = (typeof TRANSCRIPT_TIMEBASES)[number];

/**
 * What the worker found when it asked YouTube about a video. "Unavailable"
 * (removed or private) and "failed" (YouTube did not answer) stay distinct.
 */
export const VIDEO_CHECK_STATUSES = [
  "pending",
  "playable",
  "not_embeddable",
  "unavailable",
  "failed",
] as const;
export type VideoCheckStatus = (typeof VIDEO_CHECK_STATUSES)[number];

/** A transcript line as pasted; the last line's end is unknown until clipped. */
export type TranscriptLine = {
  start_s: number;
  end_s: number | null;
  text: string;
};

/** A transcript line inside a snippet, with both ends known. */
export type TranscriptSegment = {
  start_s: number;
  end_s: number;
  text: string;
};

const TS = String.raw`(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?`;
const TS_ONLY = new RegExp(String.raw`^\[?${TS}\]?$`);
const TS_INLINE = new RegExp(String.raw`^\[?(${TS})\]?\s+(.+)$`);
const CUE = new RegExp(String.raw`^(${TS})\s*-->\s*(${TS})`);
// YouTube's transcript panel sometimes copies an accessibility label under
// each timestamp, such as "1 minute, 35 seconds". Those lines carry no text.
const SPOKEN_TS =
  /^\d+\s+(hours?|minutes?|seconds?)(,?\s+\d+\s+(hours?|minutes?|seconds?))*$/i;
const TAG = /<[^>]+>/g;

/** A time in seconds from a form or request value; null for anything else. */
export function secondsOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Rounds to tenths of a second, the precision snippets are stored with. */
export function roundToTenths(seconds: number): number {
  return Math.round(seconds * 10) / 10;
}

/**
 * Accepts "95", "95.5", "1:35", "75:00", "01:02:03", "00:01:35.000", or
 * "00:01:35,000". Seconds need two digits and must be under 60; with hours,
 * minutes must be under 60 too. Returns seconds, or null for anything else
 * (so "1:75" and "1:5" are refused, not guessed).
 */
export function parseTime(input: unknown): number | null {
  if (typeof input !== "string" && typeof input !== "number") return null;
  const text = String(input)
    .trim()
    .replace(/^\[|\]$/g, "")
    .replace(",", ".");
  if (text === "") return null;
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
  const match = /^(?:(\d+):)?(\d+):(\d{2})(\.\d+)?$/.exec(text);
  if (!match) return null;
  const [, hours, minutes = "", seconds = "", fraction] = match;
  if (Number(seconds) >= 60) return null;
  if (hours !== undefined && (minutes.length > 2 || Number(minutes) >= 60)) {
    return null;
  }
  return (
    Number(hours ?? 0) * 3600 +
    Number(minutes) * 60 +
    Number(seconds) +
    Number(fraction ?? 0)
  );
}

/** 95.25 becomes "1:35" (or "1:35.3" with tenths); hours appear only when needed. */
export function formatTime(
  seconds: number | null | undefined,
  tenths = false,
): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return "–";
  }
  const time = Math.max(0, seconds);
  // Round to tenths first: flooring (2.3 - 2) * 10 gives 2.9999… and "0:02.2".
  const totalTenths = Math.round(time * 10);
  const whole = tenths ? Math.floor(totalTenths / 10) : Math.floor(time);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const fraction = tenths ? `.${totalTenths % 10}` : "";
  return h
    ? `${h}:${pad(m)}:${pad(s)}${fraction}`
    : `${m}:${pad(s)}${fraction}`;
}

function parseYouTubeStart(value: string | null): number | null {
  if (!value) return null;
  if (/^\d+s?$/.test(value)) return parseInt(value, 10);
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  return match
    ? Number(match[1] ?? 0) * 3600 +
        Number(match[2] ?? 0) * 60 +
        Number(match[3] ?? 0)
    : null;
}

/**
 * The video id and start time of a watch, youtu.be, shorts, embed, or live
 * link, or of a bare 11-character id; null for anything else.
 */
export function parseYouTubeUrl(
  input: unknown,
): { id: string; start_s: number | null } | null {
  const raw = typeof input === "string" ? input.trim() : "";
  if (YOUTUBE_ID_PATTERN.test(raw)) return { id: raw, start_s: null };
  let url: URL;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "");
  let id: string | null = null;
  if (host === "youtu.be") {
    id = url.pathname.slice(1).split("/")[0] ?? null;
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id =
      url.pathname === "/watch"
        ? url.searchParams.get("v")
        : (/^\/(?:embed|shorts|live|v)\/([\w-]{11})/.exec(url.pathname)?.[1] ??
          null);
  }
  if (!id || !YOUTUBE_ID_PATTERN.test(id)) return null;
  return {
    id,
    start_s: parseYouTubeStart(
      url.searchParams.get("t") ?? url.searchParams.get("start"),
    ),
  };
}

function joinText(a: string, b: string): string {
  if (!b) return a;
  return a ? `${a} ${b}` : b;
}

function finish(
  lines: TranscriptLine[],
  { keepEnds = false, skipped = 0 } = {},
): { lines: TranscriptLine[]; skipped: number } {
  const valid = lines
    .filter((line) => line.text)
    .sort((a, b) => a.start_s - b.start_s);
  valid.forEach((line, i) => {
    if (!keepEnds || line.end_s === null) {
      line.end_s = valid[i + 1]?.start_s ?? null;
    }
  });
  return { lines: valid, skipped };
}

/**
 * Collects the text after an impossible timestamp (such as "1:75"), so that
 * text is left out with it instead of joining the line before.
 */
function discarded(): TranscriptLine {
  return { start_s: 0, end_s: null, text: "" };
}

function parseCues(rows: string[]) {
  const lines: TranscriptLine[] = [];
  let current: TranscriptLine | null = null;
  for (const row of rows) {
    const cue = CUE.exec(row);
    if (cue) {
      const start = parseTime(cue[1]);
      current =
        start === null
          ? discarded()
          : { start_s: start, end_s: parseTime(cue[2]), text: "" };
      if (start !== null) lines.push(current);
    } else if (row === "") {
      current = null;
    } else if (current) {
      current.text = joinText(current.text, row.replace(TAG, "").trim());
    }
  }
  return finish(lines, { keepEnds: true });
}

function parseTimestamped(rows: string[]) {
  const lines: TranscriptLine[] = [];
  let current: TranscriptLine | null = null;
  let skipped = 0;
  for (const row of rows) {
    if (row === "" || SPOKEN_TS.test(row)) continue;
    if (TS_ONLY.test(row)) {
      const start = parseTime(row);
      current =
        start === null
          ? discarded()
          : { start_s: start, end_s: null, text: "" };
      if (start !== null) lines.push(current);
      continue;
    }
    const inline = TS_INLINE.exec(row);
    if (inline) {
      const start = parseTime(inline[1]);
      current =
        start === null
          ? discarded()
          : { start_s: start, end_s: null, text: inline[2] ?? "" };
      if (start !== null) lines.push(current);
    } else if (current) {
      current.text = joinText(current.text, row);
    } else {
      skipped++;
    }
  }
  return finish(lines, { skipped });
}

/**
 * Parses a pasted transcript into timed lines, sorted by start. Formats:
 * YouTube's transcript panel (a timestamp line, then text), "m:ss text"
 * lines, SRT, and WebVTT. A line ends where the next begins (or at its cue's
 * end); the last line's end is unknown until clipped. `skipped` counts text
 * before the first timestamp.
 */
export function parseTranscript(text: string): {
  lines: TranscriptLine[];
  skipped: number;
} {
  const rows = text
    .replace(/\r/g, "")
    .split("\n")
    .map((row) => row.trim());
  return rows.some((row) => CUE.test(row))
    ? parseCues(rows)
    : parseTimestamped(rows);
}

/** Keeps the lines that overlap the clip, ending none after the clip ends. */
export function clipLines(
  lines: TranscriptLine[],
  start_s: number,
  end_s: number,
): { segments: TranscriptSegment[]; dropped: number } {
  const segments: TranscriptSegment[] = [];
  for (const line of lines) {
    const lineEnd = line.end_s ?? end_s;
    if (line.start_s < end_s && lineEnd > start_s) {
      segments.push({ ...line, end_s: Math.min(lineEnd, end_s) });
    }
  }
  return { segments, dropped: lines.length - segments.length };
}

export type Clip = {
  start_s: number | null;
  end_s: number | null;
  /** The video's length, when known. */
  duration_s?: number | null;
};

/** What makes a clip unusable (errors) or questionable (warnings). */
export function clipProblems({ start_s, end_s, duration_s }: Clip): {
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (start_s === null || !Number.isFinite(start_s)) {
    errors.push("Start is not a valid time (use 95, 1:35, or 1:02:03).");
  }
  if (end_s === null || !Number.isFinite(end_s)) {
    errors.push("End is not a valid time (use 95, 1:35, or 1:02:03).");
  }
  if (errors.length > 0 || start_s === null || end_s === null) {
    return { errors, warnings };
  }
  if (start_s < 0) errors.push("Start must be 0 or later.");
  if (end_s > SNIPPET_MAX_TIME_S) errors.push("End must be within 24 hours.");
  if (end_s <= start_s) errors.push("End must be after start.");
  if (
    typeof duration_s === "number" &&
    end_s > duration_s + VIDEO_LENGTH_TOLERANCE_S
  ) {
    errors.push(
      `End is past the end of the video (${formatTime(duration_s)}).`,
    );
  }
  if (end_s - start_s > SNIPPET_LONG_CLIP_S) {
    warnings.push(
      "This clip is longer than 10 minutes; consider a tighter snippet.",
    );
  }
  return { errors, warnings };
}

export type SnippetTranscript = {
  /** The lines inside the clip, in video time, rounded to tenths. */
  segments: TranscriptSegment[];
  /** Lines with a timestamp in the pasted text. */
  parsed: number;
  /** Parsed lines outside the clip, left out. */
  dropped: number;
  /** Text before the first timestamp, ignored. */
  skipped: number;
  /** Why the transcript cannot be saved; null when it can (or is empty). */
  problem: string | null;
};

/**
 * Turns a pasted transcript into the snippet's segments: parsed, moved to
 * video time when its timestamps count from the clip's start, and clipped.
 * An empty text means the snippet has no transcript, which is allowed; text
 * that yields no lines inside the clip is a mistake.
 */
export function snippetTranscript({
  text,
  timebase,
  start_s,
  end_s,
}: {
  text: string;
  timebase: TranscriptTimebase;
  start_s: number;
  end_s: number;
}): SnippetTranscript {
  const { lines, skipped } = parseTranscript(text);
  const shift = timebase === "clip" ? start_s : 0;
  const shifted = lines.map((line) => ({
    text: line.text,
    start_s: roundToTenths(line.start_s + shift),
    end_s: line.end_s === null ? null : roundToTenths(line.end_s + shift),
  }));
  const { segments, dropped } = clipLines(shifted, start_s, end_s);
  let problem: string | null = null;
  if (text.trim() && lines.length === 0) {
    problem = "No timestamps found: each line needs a time such as 1:35.";
  } else if (lines.length > 0 && segments.length === 0) {
    problem =
      timebase === "video"
        ? "No transcript line falls inside the clip. Check the clip's times, or whether the timestamps count from the clip's start."
        : "No transcript line falls inside the clip. Check the clip's times, or whether the timestamps count from the start of the video.";
  } else if (
    segments.some((segment) => segment.text.length > TRANSCRIPT_LINE_MAX_LENGTH)
  ) {
    problem = `Keep each transcript line under ${TRANSCRIPT_LINE_MAX_LENGTH} characters; add timestamps to split long ones.`;
  }
  return { segments, parsed: lines.length, dropped, skipped, problem };
}

export const LANGUAGE_TAG_MAX_LENGTH = 35;
const LANGUAGE_TAG = /^[a-z]{2,3}(-[a-z0-9]{1,8})*$/i;

/** A snippet's language: a BCP 47 style tag, such as en, sw, or pt-BR. */
export function isLanguageTag(value: string): boolean {
  return value.length <= LANGUAGE_TAG_MAX_LENGTH && LANGUAGE_TAG.test(value);
}
