import {
  clipSegments,
  formatTime,
  parseTime,
  parseTranscript,
  parseYouTubeUrl,
} from "./transcript.js";

const YT_HOST = "https://www.youtube-nocookie.com";
const STORAGE_KEY = "yt-snippet-prototype";

// "Me at the zoo" — the first video uploaded to YouTube. Short, public and embeddable.
// The transcript lines are clearly labelled placeholders, not the speaker's words: real
// transcript text must come from the video itself (see AGENTS.md on fabricated content).
const DEMO = {
  url: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
  start: 1,
  end: 17,
  caption: "Demo: the first video ever uploaded to YouTube (2005)",
  speaker: "Jawed Karim",
  transcriptText: [
    "0:01",
    "1 second",
    "[Placeholder line 1 — paste the real transcript from YouTube to replace these]",
    "0:05",
    "5 seconds",
    "[Placeholder line 2]",
    "0:12",
    "12 seconds",
    "[Placeholder line 3]",
    "0:15",
    "15 seconds",
    "[Placeholder line 4]",
  ].join("\n"),
};

const PLAYER_ERRORS = {
  2: "Invalid video id or player parameters.",
  5: "The browser could not play this video (HTML5 player error).",
  100: "Video not found — it was removed or made private.",
  101: "The uploader does not allow this video to be embedded.",
  150: "The uploader does not allow this video to be embedded.",
  153: "YouTube rejected the embed because no referrer was sent. Open the page through server.mjs, not as a file.",
};

const $ = (sel) => document.querySelector(sel);
const els = {
  form: $("#load-form"),
  url: $("#url"),
  demo: $("#demo"),
  meta: $("#meta"),
  editorEmpty: $("#editor-empty"),
  playerError: $("#player-error"),
  now: $("#now"),
  scrub: $("#scrub"),
  dur: $("#dur"),
  setStart: $("#set-start"),
  setEnd: $("#set-end"),
  playClip: $("#play-clip"),
  start: $("#start"),
  end: $("#end"),
  length: $("#length"),
  problems: $("#clip-problems"),
  caption: $("#caption"),
  speaker: $("#speaker"),
  language: $("#language"),
  transcript: $("#transcript"),
  summary: $("#transcript-summary"),
  preview: $("#preview"),
  json: $("#json"),
  copyJson: $("#copy-json"),
};

const state = {
  url: "",
  video: null, // { id, ok, title, channel, reason?, duration?, ageRestricted?, dataApiError?, source? }
  duration: NaN,
  start: NaN,
  end: NaN,
  caption: "",
  speaker: "",
  language: "en",
  transcriptText: "",
  relative: false,
  segments: [],
};

// ---------- YouTube IFrame API ----------

const ytReady = new Promise((resolve) => {
  window.onYouTubeIframeAPIReady = resolve;
  const script = document.createElement("script");
  script.src = "https://www.youtube.com/iframe_api";
  document.head.append(script);
});

let editorPlayer = null;
let editorReady = false;
let clipPlaying = false;
let scrubbing = false;

async function mountEditorPlayer(id) {
  els.playerError.hidden = true;
  await ytReady;
  if (editorPlayer) {
    if (editorReady) editorPlayer.cueVideoById(id);
    return;
  }
  els.editorEmpty.hidden = true;
  editorPlayer = new YT.Player("editor-player", {
    host: YT_HOST,
    videoId: id,
    playerVars: { rel: 0, playsinline: 1, origin: location.origin },
    events: {
      onReady: () => {
        editorReady = true;
        // A different video may have been loaded while the player was starting.
        if (state.video && state.video.id !== id)
          editorPlayer.cueVideoById(state.video.id);
      },
      onStateChange: (e) => {
        if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED)
          clipPlaying = false;
      },
      onError: (e) => showError(els.playerError, e.data),
    },
  });
}

function showError(el, code) {
  el.textContent = PLAYER_ERRORS[code] ?? `YouTube player error ${code}.`;
  el.hidden = false;
}

function editorTick() {
  if (!editorReady) return;
  // Right after switching videos the player still reports the previous one for a moment.
  const loadedId = editorPlayer.getVideoData?.()?.video_id;
  if (loadedId && loadedId !== state.video?.id) return;
  const t = editorPlayer.getCurrentTime() || 0;
  const d = editorPlayer.getDuration() || 0;
  if (
    d > 0 &&
    (Math.abs(d - (state.duration || 0)) > 0.5 || !Number.isFinite(state.end))
  ) {
    applyDuration(d);
    renderMeta();
    renderClip();
    refreshTranscript();
  }
  els.now.textContent = formatTime(t, true);
  if (!scrubbing) els.scrub.value = t;
  if (clipPlaying && t >= state.end) {
    editorPlayer.pauseVideo();
    clipPlaying = false;
  }
}
setInterval(editorTick, 250);

const DEFAULT_CLIP_LENGTH_S = 30;

/** Records a known video length and, if no end is set yet, proposes a default clip end. */
function applyDuration(durationS) {
  state.duration = durationS;
  if (!Number.isFinite(state.end)) {
    state.end = Math.min((state.start || 0) + DEFAULT_CLIP_LENGTH_S, durationS);
  }
}

// ---------- Loading a video ----------

async function loadVideo(rawUrl, { keepClip = false } = {}) {
  const parsed = parseYouTubeUrl(rawUrl);
  if (!parsed) {
    els.meta.replaceChildren(
      h("p", { class: "error" }, "That doesn't look like a YouTube link."),
    );
    return;
  }
  state.url = rawUrl.trim();
  state.duration = NaN;
  if (!keepClip) {
    state.start = Number.isFinite(parsed.t) ? parsed.t : 0;
    state.end = NaN;
  }
  state.video = { id: parsed.id, ok: true, loading: true };
  renderAll();
  mountEditorPlayer(parsed.id);

  let info;
  try {
    const res = await fetch(`/api/video?id=${parsed.id}`);
    info = await res.json();
    if (!res.ok)
      info = {
        ok: false,
        reason: info.error ?? `Lookup failed (${res.status}).`,
      };
  } catch {
    // Unchecked is not the same as embeddable: block the preview until the check succeeds.
    info = {
      ok: false,
      reason:
        "Could not check this video. Is the prototype server (server.mjs) running?",
    };
  }
  if (state.video?.id !== parsed.id) return; // a newer load replaced this one
  state.video = { ...info, id: parsed.id };
  if (Number.isFinite(info.duration)) applyDuration(info.duration);
  save();
  renderAll();
}

// ---------- Rendering ----------

function renderAll() {
  renderMeta();
  renderClip();
  refreshTranscript();
}

function renderMeta() {
  const v = state.video;
  if (!v) return els.meta.replaceChildren();
  let pill;
  if (v.loading) pill = h("span", { class: "pill" }, "Checking…");
  else if (v.ok === false) pill = h("span", { class: "pill bad" }, v.reason);
  else pill = h("span", { class: "pill ok" }, "Embeddable");
  const facts = [
    v.channel,
    Number.isFinite(state.duration) ? formatTime(state.duration) : null,
    `id ${v.id}`,
    v.source && `via ${v.source}`,
  ]
    .filter(Boolean)
    .join(" · ");
  els.meta.replaceChildren(
    h("img", {
      src: `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
      alt: "",
      width: 160,
      height: 90,
    }),
    h(
      "div",
      {},
      h("strong", {}, v.loading ? "Loading…" : (v.title ?? "")),
      h("div", { class: "muted small" }, facts),
      h(
        "div",
        { class: "row" },
        pill,
        v.dataApiError
          ? h(
              "span",
              { class: "pill bad" },
              `Extra checks unavailable: ${v.dataApiError}`,
            )
          : null,
        v.ageRestricted
          ? h(
              "span",
              { class: "pill bad" },
              "Age-restricted: will not play embedded",
            )
          : null,
      ),
    ),
  );
}

function clipProblems() {
  const { start, end, duration } = state;
  const errors = [];
  const warnings = [];
  if (!Number.isFinite(start))
    errors.push("Start is not a valid time (use 95, 1:35 or 1:02:03).");
  if (!Number.isFinite(end)) errors.push("End is not set yet.");
  if (errors.length) return { errors, warnings };
  if (start < 0) errors.push("Start must be 0 or later.");
  if (end <= start) errors.push("End must be after start.");
  if (Number.isFinite(duration) && end > duration + 0.5)
    errors.push(`End is past the end of the video (${formatTime(duration)}).`);
  if (end - start > 600)
    warnings.push(
      "This clip is longer than 10 minutes — consider a tighter snippet.",
    );
  return { errors, warnings };
}

function renderClip() {
  const { start, end, duration } = state;
  if (document.activeElement !== els.start)
    els.start.value = Number.isFinite(start) ? formatTime(start, true) : "";
  if (document.activeElement !== els.end)
    els.end.value = Number.isFinite(end) ? formatTime(end, true) : "";
  els.length.textContent =
    Number.isFinite(end - start) && end > start
      ? `${(end - start).toFixed(1)} s`
      : "–";

  const max = Number.isFinite(duration) ? duration : 0;
  els.scrub.max = max;
  els.dur.textContent = formatTime(duration);
  if (max > 0 && Number.isFinite(start) && Number.isFinite(end)) {
    const a = (Math.max(0, start) / max) * 100;
    const b = (Math.min(end, max) / max) * 100;
    els.scrub.style.setProperty("--a", `${a}%`);
    els.scrub.style.setProperty("--b", `${b}%`);
  }

  const { errors, warnings } = clipProblems();
  els.problems.replaceChildren(
    ...(state.video ? errors.map((e) => h("li", { class: "error" }, e)) : []),
    ...warnings.map((w) => h("li", { class: "warn" }, w)),
  );
}

function refreshTranscript() {
  const { segments: parsed, skipped } = parseTranscript(state.transcriptText);
  const shift =
    state.relative && Number.isFinite(state.start) ? state.start : 0;
  const absolute = parsed.map((s) => ({
    ...s,
    start_s: s.start_s + shift,
    end_s: s.end_s + shift,
  }));
  const clipOk = clipProblems().errors.length === 0;
  const { segments, dropped } = clipOk
    ? clipSegments(absolute, state.start, state.end)
    : { segments: absolute, dropped: 0 };
  state.segments = segments;

  let summary = "";
  if (state.transcriptText.trim()) {
    if (!parsed.length)
      summary = "No timestamps found — each line needs a time such as 1:35.";
    else {
      summary = `${parsed.length} line${parsed.length === 1 ? "" : "s"} parsed`;
      if (dropped) summary += ` · ${dropped} outside the clip left out`;
      if (skipped)
        summary += ` · ${skipped} line${skipped === 1 ? "" : "s"} before the first timestamp ignored`;
    }
  }
  els.summary.textContent = summary;
  schedulePreview();
  renderJson();
}

function renderJson() {
  const v = state.video;
  const round = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : null);
  const out = v && {
    video: {
      youtube_id: v.id,
      title: v.title ?? null,
      channel: v.channel ?? null,
      duration: round(state.duration),
    },
    snippet: {
      start_s: round(state.start),
      end_s: round(state.end),
      caption: state.caption,
      speaker: state.speaker,
      language: state.language,
    },
    transcript_segments: state.segments.map((s) => ({
      start_s: round(s.start_s),
      end_s: round(s.end_s),
      text: s.text,
      source: "manual",
    })),
  };
  els.json.textContent = out
    ? JSON.stringify(out, null, 2)
    : "// Load a video first.";
}

// ---------- Visitor preview ----------

let preview = newPreview();
let previewSig = "";
let previewTimer = null;

function newPreview() {
  return {
    player: null,
    ready: false,
    loading: false,
    startAt: 0,
    timer: null,
    active: -1,
  };
}

function destroyPreview() {
  clearInterval(preview.timer);
  preview.player?.destroy?.();
  preview = newPreview();
}

function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreview, 250);
}

function renderPreview() {
  const v = state.video;
  const ready = Boolean(
    v?.ok && !v.loading && clipProblems().errors.length === 0,
  );
  const sig = JSON.stringify(
    ready
      ? [
          v.id,
          state.start,
          state.end,
          state.caption,
          state.speaker,
          state.segments,
        ]
      : (v?.reason ?? null),
  );
  if (sig === previewSig) return;
  previewSig = sig;
  destroyPreview();
  if (ready) return els.preview.replaceChildren(buildCard());
  const msg =
    v && v.ok === false
      ? `Can't preview: ${v.reason}`
      : "Load a video and set a valid start and end to see the visitor view.";
  els.preview.replaceChildren(h("p", { class: "muted" }, msg));
}

function buildCard() {
  const { id, title, channel } = state.video;
  const { start, end } = state;
  const lines = state.segments.map((seg) =>
    h(
      "li",
      {
        tabindex: 0,
        onclick: () => playFrom(seg.start_s),
        onkeydown: (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            playFrom(seg.start_s);
          }
        },
      },
      h("span", { class: "ts mono" }, formatTime(seg.start_s)),
      h("span", {}, seg.text),
    ),
  );

  return h(
    "article",
    { class: "snippet" },
    h(
      "header",
      {},
      h("h3", {}, state.caption || "Untitled snippet"),
      h(
        "p",
        { class: "muted small" },
        [
          state.speaker && `Speaker: ${state.speaker}`,
          `From “${title ?? id}”${channel ? ` · ${channel}` : ""}`,
        ]
          .filter(Boolean)
          .join(" · "),
      ),
    ),
    h(
      "div",
      { class: "snippet-body" },
      h(
        "div",
        { class: "stage" },
        h(
          "button",
          {
            class: "facade",
            type: "button",
            "aria-label": "Play snippet",
            onclick: () => playFrom(start),
          },
          h("img", {
            src: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
            alt: "",
          }),
          h("span", { class: "play", "aria-hidden": "true" }),
          h(
            "span",
            { class: "badge mono" },
            `${formatTime(start)}–${formatTime(end)} · ${Math.round(end - start)} s`,
          ),
        ),
        h(
          "div",
          { class: "ended", hidden: true },
          h("p", {}, "Snippet ended"),
          h(
            "div",
            { class: "row" },
            h(
              "button",
              { type: "button", onclick: () => playFrom(start) },
              "↺ Replay",
            ),
            h(
              "a",
              {
                href: `https://www.youtube.com/watch?v=${id}&t=${Math.floor(start)}s`,
                target: "_blank",
                rel: "noopener",
              },
              "Watch full video on YouTube ↗",
            ),
          ),
        ),
        h("p", { class: "error preview-error", hidden: true }),
      ),
      h(
        "div",
        { class: "transcript-wrap" },
        lines.length
          ? h("ol", { class: "transcript" }, ...lines)
          : h(
              "p",
              { class: "muted small pad" },
              "No transcript for this clip yet — paste one in step 3.",
            ),
      ),
    ),
  );
}

async function playFrom(t) {
  const at = Math.min(Math.max(t, state.start), state.end - 0.2);
  setEnded(false);
  preview.startAt = at;
  if (preview.ready) {
    preview.player.seekTo(at, true);
    preview.player.playVideo();
    return;
  }
  if (preview.loading) return;
  preview.loading = true;
  const sig = previewSig;
  await ytReady;
  if (sig !== previewSig) return; // the card was rebuilt while the API loaded

  const mount = h("div");
  els.preview.querySelector(".facade").replaceWith(mount);
  const current = preview;
  current.player = new YT.Player(mount, {
    host: YT_HOST,
    videoId: state.video.id,
    playerVars: {
      start: Math.floor(at),
      end: Math.ceil(state.end),
      autoplay: 1,
      rel: 0,
      playsinline: 1,
      origin: location.origin,
    },
    events: {
      onReady: (e) => {
        current.ready = true;
        e.target.seekTo(current.startAt, true);
        e.target.playVideo();
      },
      onError: (e) =>
        showError(els.preview.querySelector(".preview-error"), e.data),
    },
  });
  current.timer = setInterval(previewTick, 200);
}

function previewTick() {
  if (!preview.ready) return;
  const p = preview.player;
  const t = p.getCurrentTime() || 0;
  const s = p.getPlayerState();
  const playing = s === YT.PlayerState.PLAYING;
  // Keep visitors inside the clip even if they drag the YouTube progress bar.
  if (playing && t < state.start - 0.5) p.seekTo(state.start, true);
  if ((playing && t >= state.end - 0.05) || s === YT.PlayerState.ENDED) {
    p.pauseVideo();
    setEnded(true);
  }
  highlight(t);
}

function setEnded(show) {
  const el = els.preview.querySelector(".ended");
  if (el) el.hidden = !show;
}

function highlight(t) {
  const i = state.segments.findIndex((s) => t >= s.start_s && t < s.end_s);
  if (i === preview.active) return;
  preview.active = i;
  const list = els.preview.querySelector(".transcript");
  if (!list) return;
  [...list.children].forEach((li, j) => {
    li.classList.toggle("active", j === i);
    li.classList.toggle("past", i >= 0 && j < i);
  });
  const el = list.children[i];
  if (el)
    list.scrollTo({
      top: el.offsetTop - list.clientHeight / 3,
      behavior: "smooth",
    });
}

// ---------- Events ----------

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  loadVideo(els.url.value);
});

els.demo.addEventListener("click", () => {
  Object.assign(state, {
    url: DEMO.url,
    start: DEMO.start,
    end: DEMO.end,
    caption: DEMO.caption,
    speaker: DEMO.speaker,
    transcriptText: DEMO.transcriptText,
    relative: false,
  });
  fillInputs();
  loadVideo(DEMO.url, { keepClip: true });
});

function setFromPlayer(key) {
  if (!editorReady) return;
  state[key] = Math.round(editorPlayer.getCurrentTime() * 10) / 10;
  if (key === "start" && !(state.end > state.start)) state.end = NaN;
  onClipChanged();
}
els.setStart.addEventListener("click", () => setFromPlayer("start"));
els.setEnd.addEventListener("click", () => setFromPlayer("end"));

els.playClip.addEventListener("click", () => {
  if (!editorReady || clipProblems().errors.length) return;
  editorPlayer.seekTo(state.start, true);
  editorPlayer.playVideo();
  clipPlaying = true;
});

for (const key of ["start", "end"]) {
  els[key].addEventListener("change", () => {
    state[key] = parseTime(els[key].value);
    onClipChanged();
  });
}

function onClipChanged() {
  renderClip();
  refreshTranscript();
  save();
}

els.scrub.addEventListener("pointerdown", () => (scrubbing = true));
els.scrub.addEventListener(
  "input",
  () => editorReady && editorPlayer.seekTo(Number(els.scrub.value), false),
);
els.scrub.addEventListener("change", () => {
  if (editorReady) editorPlayer.seekTo(Number(els.scrub.value), true);
  scrubbing = false;
});

for (const key of ["caption", "speaker", "language"]) {
  els[key].addEventListener("input", () => {
    state[key] = els[key].value;
    schedulePreview();
    renderJson();
    save();
  });
}

let transcriptTimer = null;
els.transcript.addEventListener("input", () => {
  clearTimeout(transcriptTimer);
  transcriptTimer = setTimeout(() => {
    state.transcriptText = els.transcript.value;
    refreshTranscript();
    save();
  }, 200);
});

document.querySelectorAll('input[name="timebase"]').forEach((radio) =>
  radio.addEventListener("change", () => {
    state.relative = radio.value === "clip" && radio.checked;
    refreshTranscript();
    save();
  }),
);

els.copyJson.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(els.json.textContent);
    els.copyJson.textContent = "Copied";
  } catch {
    els.copyJson.textContent = "Copy failed";
  }
  setTimeout(() => (els.copyJson.textContent = "Copy JSON"), 1500);
});

// ---------- Persistence (per-browser convenience only) ----------

function save() {
  const {
    url,
    start,
    end,
    caption,
    speaker,
    language,
    transcriptText,
    relative,
  } = state;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        url,
        start,
        end,
        caption,
        speaker,
        language,
        transcriptText,
        relative,
      }),
    );
  } catch {
    // storage unavailable (private window etc.) — the prototype still works, it just won't remember
  }
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!saved) return false;
    const num = (v) => (typeof v === "number" ? v : NaN);
    Object.assign(state, {
      url: saved.url ?? "",
      start: num(saved.start),
      end: num(saved.end),
      caption: saved.caption ?? "",
      speaker: saved.speaker ?? "",
      language: saved.language || "en",
      transcriptText: saved.transcriptText ?? "",
      relative: Boolean(saved.relative),
    });
    return true;
  } catch {
    return false;
  }
}

function fillInputs() {
  els.url.value = state.url;
  els.caption.value = state.caption;
  els.speaker.value = state.speaker;
  els.language.value = state.language;
  els.transcript.value = state.transcriptText;
  document.querySelector(
    `input[name="timebase"][value="${state.relative ? "clip" : "video"}"]`,
  ).checked = true;
}

// ---------- Tiny DOM helper (textContent only, so pasted text can't inject HTML) ----------

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key.startsWith("on") && typeof value === "function")
      el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(
      child instanceof Node ? child : document.createTextNode(String(child)),
    );
  }
  return el;
}

// ---------- Start ----------

if (restore()) {
  fillInputs();
  if (state.url) loadVideo(state.url, { keepClip: true });
}
renderAll();
