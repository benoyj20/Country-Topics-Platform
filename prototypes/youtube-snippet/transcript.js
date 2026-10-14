// Pure helpers for the snippet prototype: YouTube URL parsing, time parsing/formatting,
// and turning a pasted transcript into timed segments. No DOM access, so it runs in Node tests too.

const TS = String.raw`(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?`;
const TS_ONLY = new RegExp(`^\\[?${TS}\\]?$`);
const TS_INLINE = new RegExp(`^\\[?(${TS})\\]?\\s+(.+)$`);
const CUE = new RegExp(`^(${TS})\\s*-->\\s*(${TS})`);
// YouTube's transcript panel sometimes copies an accessibility label under each timestamp,
// e.g. "1 minute, 35 seconds". Those lines carry no text and are skipped.
const SPOKEN_TS =
  /^\d+\s+(hours?|minutes?|seconds?)(,?\s+\d+\s+(hours?|minutes?|seconds?))*$/i;
const VIDEO_ID = /^[\w-]{11}$/;

/** Accepts "95", "95.5", "1:35", "01:02:03", "00:01:35.000" or "00:01:35,000". Returns seconds or NaN. */
export function parseTime(input) {
  if (input == null) return NaN;
  const s = String(input)
    .trim()
    .replace(/^\[|\]$/g, "")
    .replace(",", ".");
  if (s === "") return NaN;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  if (!/^(\d+:){1,2}\d{1,2}(\.\d+)?$/.test(s)) return NaN;
  return s.split(":").reduce((acc, part) => acc * 60 + Number(part), 0);
}

/** 95.25 -> "1:35" (or "1:35.2" with tenths). Hours appear only when needed. */
export function formatTime(seconds, tenths = false) {
  if (!Number.isFinite(seconds)) return "–";
  const t = Math.max(0, seconds);
  const whole = Math.floor(t);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const pad = (n) => String(n).padStart(2, "0");
  const frac = tenths ? `.${Math.floor((t - whole) * 10)}` : "";
  return h ? `${h}:${pad(m)}:${pad(s)}${frac}` : `${m}:${pad(s)}${frac}`;
}

/** Returns { id, t } for watch, youtu.be, shorts, embed and live links (or a bare 11-char id); null otherwise. */
export function parseYouTubeUrl(input) {
  const raw = String(input ?? "").trim();
  if (VIDEO_ID.test(raw)) return { id: raw, t: NaN };
  let url;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "");
  let id = null;
  if (host === "youtu.be") {
    id = url.pathname.slice(1).split("/")[0];
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else
      id =
        url.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/)?.[1] ??
        null;
  }
  if (!id || !VIDEO_ID.test(id)) return null;
  return {
    id,
    t: parseYouTubeT(
      url.searchParams.get("t") ?? url.searchParams.get("start"),
    ),
  };
}

function parseYouTubeT(t) {
  if (!t) return NaN;
  if (/^\d+s?$/.test(t)) return parseInt(t, 10);
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  return m
    ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
    : NaN;
}

/**
 * Parses pasted transcript text into [{ start_s, end_s, text }], sorted by start.
 * Formats: YouTube transcript panel (timestamp line, then text), "m:ss text" lines, SRT and WebVTT.
 * end_s is the next line's start (or the cue end for SRT/VTT); the last line's end is NaN until clipped.
 * `skipped` counts text lines that appeared before any timestamp.
 */
export function parseTranscript(text) {
  const lines = String(text ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim());
  return lines.some((l) => CUE.test(l))
    ? parseCues(lines)
    : parseTimestamped(lines);
}

function parseCues(lines) {
  const segments = [];
  let current = null;
  for (const line of lines) {
    const cue = line.match(CUE);
    if (cue) {
      current = {
        start_s: parseTime(cue[1]),
        end_s: parseTime(cue[2]),
        text: "",
      };
      segments.push(current);
    } else if (line === "") {
      current = null;
    } else if (current) {
      current.text = joinText(
        current.text,
        line.replace(/<[^>]+>/g, "").trim(),
      );
    }
  }
  return finish(segments, { keepEnds: true });
}

function parseTimestamped(lines) {
  const segments = [];
  let current = null;
  let skipped = 0;
  for (const line of lines) {
    if (line === "" || SPOKEN_TS.test(line)) continue;
    if (TS_ONLY.test(line)) {
      current = { start_s: parseTime(line), end_s: NaN, text: "" };
      segments.push(current);
      continue;
    }
    const inline = line.match(TS_INLINE);
    if (inline) {
      current = { start_s: parseTime(inline[1]), end_s: NaN, text: inline[2] };
      segments.push(current);
    } else if (current) {
      current.text = joinText(current.text, line);
    } else {
      skipped++;
    }
  }
  return finish(segments, { skipped });
}

function finish(segments, { keepEnds = false, skipped = 0 } = {}) {
  const valid = segments
    .filter((s) => Number.isFinite(s.start_s) && s.text)
    .sort((a, b) => a.start_s - b.start_s);
  valid.forEach((s, i) => {
    if (!keepEnds || !Number.isFinite(s.end_s))
      s.end_s = valid[i + 1]?.start_s ?? NaN;
  });
  return { segments: valid, skipped };
}

function joinText(a, b) {
  if (!b) return a;
  return a ? `${a} ${b}` : b;
}

/** Keeps segments that overlap [start, end] and caps their end at the clip end. */
export function clipSegments(segments, start, end) {
  const kept = [];
  for (const s of segments) {
    const segEnd = Number.isFinite(s.end_s) ? s.end_s : end;
    if (s.start_s < end && segEnd > start)
      kept.push({ ...s, end_s: Math.min(segEnd, end) });
  }
  return { segments: kept, dropped: segments.length - kept.length };
}
