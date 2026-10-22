"use client";

import {
  clipProblems,
  formatTime,
  parseTime,
  parseYouTubeUrl,
  roundToTenths,
  YOUTUBE_ID_PATTERN,
} from "@countrytopics/domain";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  loadYouTubeIframeApi,
  mountPlayer,
  PlayerState,
  playerErrorMessage,
  thumbnailUrl,
  type YouTubePlayer,
} from "@/components/snippets/youtube-iframe-api";

import type { FieldProps } from "../field-text";

const TICK_MS = 250;
/** A new clip's end when none is set: start plus this, within the video. */
const DEFAULT_CLIP_LENGTH_S = 30;
/** Lengths reported by the player wobble slightly while it loads. */
const DURATION_CHANGE_S = 0.5;

const timeText = (value: number | null) =>
  value === null ? "" : formatTime(value, true);

export type Clip = {
  youtubeId: string;
  startS: number | null;
  endS: number | null;
};

/**
 * The clip editor, as in Payload's panel: paste a YouTube link, play the
 * video, and set the clip's start and end from the player or by typing.
 * The thumbnail comes from this site; YouTube is contacted only once the
 * player is opened. The backend checks the times again on save.
 */
export function ClipEditor({
  clip,
  onChange,
  fields,
  knownDuration_s,
  readOnly,
}: {
  clip: Clip;
  onChange: (patch: Partial<Clip>) => void;
  /** The youtubeId, startS, and endS fields, with their messages. */
  fields: Record<keyof Clip, FieldProps>;
  /** The length the worker found, until the player reports one. */
  knownDuration_s: number | null;
  readOnly: boolean;
}) {
  const { youtubeId, startS: start_s, endS: end_s } = clip;
  // What is typed is saved as typed (the backend reads a pasted link as
  // its video), so the thumbnail and the checks wait for a video id.
  const videoId = YOUTUBE_ID_PATTERN.test(youtubeId) ? youtubeId : null;
  // The video the clip's times were set for; loading another resets them.
  const timedIdRef = useRef(videoId);
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const readyRef = useRef(false);
  const loadedIdRef = useRef<string | null>(null);
  const clipPlayingRef = useRef(false);
  // Set when a video is loaded or the start passes the end, so the end is
  // proposed once the length is known; a cleared or mistyped end is not.
  const proposeEndRef = useRef(false);
  const scrubbingRef = useRef(false);
  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);
  const scrubRef = useRef<HTMLInputElement>(null);

  const [link, setLink] = useState(() =>
    youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : "",
  );
  const [linkError, setLinkError] = useState<string | null>(null);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [now_s, setNow] = useState(0);
  // A player may report no length until the video starts playing.
  const [playerDuration_s, setDuration] = useState<number | null>(null);
  const duration_s = playerDuration_s ?? knownDuration_s;
  const [startText, setStartText] = useState(() => timeText(start_s));
  const [endText, setEndText] = useState(() => timeText(end_s));

  const { errors, warnings } = clipProblems({ start_s, end_s, duration_s });
  const clipOk = errors.length === 0;
  const max = duration_s ?? 0;

  // Shades the clip on the scrubber.
  useEffect(() => {
    const scrub = scrubRef.current;
    if (!scrub) return;
    const shaded = max > 0 && start_s !== null && end_s !== null;
    scrub.style.setProperty(
      "--clip-from",
      shaded ? `${(Math.max(0, start_s) / max) * 100}%` : "0%",
    );
    scrub.style.setProperty(
      "--clip-to",
      shaded ? `${(Math.min(end_s, max) / max) * 100}%` : "0%",
    );
  }, [max, start_s, end_s]);

  // Typed times follow the values, except while being typed.
  useEffect(() => {
    if (document.activeElement !== startInputRef.current) {
      setStartText(timeText(start_s));
    }
  }, [start_s]);
  useEffect(() => {
    if (document.activeElement !== endInputRef.current) {
      setEndText(timeText(end_s));
    }
  }, [end_s]);

  useEffect(
    () => () => {
      playerRef.current?.destroy();
      playerRef.current = null;
    },
    [],
  );

  const openPlayer = useCallback(async (id: string) => {
    setPlayerError(null);
    loadedIdRef.current = id;
    try {
      const api = await loadYouTubeIframeApi();
      if (playerRef.current) {
        if (readyRef.current) playerRef.current.cueVideoById(id);
        return;
      }
      const host = hostRef.current;
      if (!host) return;
      playerRef.current = mountPlayer(api, host, id, {
        events: {
          onReady: ({ target }) => {
            readyRef.current = true;
            // Another video may have been loaded while the player started.
            if (loadedIdRef.current && loadedIdRef.current !== id) {
              target.cueVideoById(loadedIdRef.current);
            }
          },
          onStateChange: ({ data }) => {
            if (data === PlayerState.PAUSED || data === PlayerState.ENDED) {
              clipPlayingRef.current = false;
            }
          },
          onError: ({ data }) => setPlayerError(playerErrorMessage(data)),
        },
      });
      setPlayerOpen(true);
    } catch {
      setPlayerError(
        "The YouTube player could not be loaded. Check your connection and try again.",
      );
    }
  }, []);

  // Follows the player: current time, the video's length, and the clip's end.
  useEffect(() => {
    if (!playerOpen) return;
    const timer = setInterval(() => {
      const player = playerRef.current;
      if (!player || !readyRef.current) return;
      const reportedId = player.getVideoData?.()?.video_id;
      if (reportedId && reportedId !== loadedIdRef.current) return;
      const time = player.getCurrentTime() || 0;
      const length = player.getDuration() || 0;
      if (!scrubbingRef.current) setNow(time);
      if (length > 0) {
        setDuration((previous) =>
          previous === null || Math.abs(length - previous) > DURATION_CHANGE_S
            ? length
            : previous,
        );
      }
      if (clipPlayingRef.current && end_s !== null && time >= end_s) {
        player.pauseVideo();
        clipPlayingRef.current = false;
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [playerOpen, end_s]);

  // A newly loaded clip gets a default end once the length is known.
  useEffect(() => {
    if (proposeEndRef.current && duration_s !== null && end_s === null) {
      proposeEndRef.current = false;
      onChange({
        endS: roundToTenths(
          Math.min((start_s ?? 0) + DEFAULT_CLIP_LENGTH_S, duration_s),
        ),
      });
    }
  }, [duration_s, end_s, start_s, onChange]);

  function loadVideo() {
    const parsed = parseYouTubeUrl(link);
    if (!parsed) {
      setLinkError("That does not look like a YouTube link.");
      return;
    }
    setLinkError(null);
    if (parsed.id !== timedIdRef.current) {
      timedIdRef.current = parsed.id;
      setDuration(null);
      onChange({
        youtubeId: parsed.id,
        startS: parsed.start_s ?? 0,
        endS: null,
      });
      proposeEndRef.current = true;
    }
    void openPlayer(parsed.id);
  }

  function setFromPlayer(which: "start" | "end") {
    const player = playerRef.current;
    if (!player || !readyRef.current) return;
    const time = roundToTenths(player.getCurrentTime());
    if (which === "end") {
      onChange({ endS: time });
    } else if (end_s !== null && end_s > time) {
      onChange({ startS: time });
    } else {
      onChange({ startS: time, endS: null });
      proposeEndRef.current = true;
    }
  }

  function playClip() {
    const player = playerRef.current;
    if (!player || !readyRef.current || start_s === null || !clipOk) return;
    player.seekTo(start_s, true);
    player.playVideo();
    clipPlayingRef.current = true;
  }

  function commitTime(which: "start" | "end", text: string) {
    const parsed = parseTime(text);
    const value = parsed === null ? null : roundToTenths(parsed);
    onChange(which === "start" ? { startS: value } : { endS: value });
  }

  function commitOnEnter(
    which: "start" | "end",
    event: KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key !== "Enter") return;
    // Enter would submit the whole form.
    event.preventDefault();
    commitTime(which, event.currentTarget.value);
  }

  function seek(time: number, final: boolean) {
    setNow(time);
    if (playerRef.current && readyRef.current) {
      playerRef.current.seekTo(time, final);
    }
  }

  // The backend's messages, such as a length only the worker knew, each
  // with its field's name, without repeating what is already listed.
  const backendErrors = Object.values(fields).flatMap((field) =>
    (field.messages ?? [])
      .filter((message) => !errors.includes(message))
      .map((message) => ({
        key: `${field.id}:${message}`,
        text: `${field.label}: ${message}`,
      })),
  );
  const clipErrors = (videoId ? errors : []).map((message) => ({
    key: `clip:${message}`,
    text: message,
  }));
  const problemsId = "clip-problems";

  return (
    <div className="clip-editor">
      <div className="admin-field">
        <label htmlFor={fields.youtubeId.id}>
          YouTube link
          <span className="admin-required" aria-hidden="true">
            {" "}
            *
          </span>
        </label>
        <div className="clip-row">
          <input
            id={fields.youtubeId.id}
            className="admin-input clip-grow"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="youtube.com/watch?v=…, youtu.be/…, or /shorts/…"
            value={link}
            disabled={readOnly}
            aria-invalid={fields.youtubeId.aria["aria-invalid"]}
            aria-describedby={problemsId}
            onChange={(event) => {
              const typed = event.target.value;
              setLink(typed);
              onChange({
                youtubeId: parseYouTubeUrl(typed)?.id ?? typed.trim(),
              });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                // Enter would submit the whole form.
                event.preventDefault();
                loadVideo();
              }
            }}
          />
          {!readOnly && (
            <button
              type="button"
              className="admin-button secondary"
              onClick={loadVideo}
            >
              Load video
            </button>
          )}
        </div>
        {linkError && <p className="admin-field-error">{linkError}</p>}
      </div>

      <div className="clip-frame">
        <div ref={hostRef} className="clip-player" />
        {!playerOpen &&
          (videoId ? (
            <button
              type="button"
              className="clip-facade"
              onClick={() => void openPlayer(videoId)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- served by /thumbnails; the player loads on click */}
              <img src={thumbnailUrl(videoId)} alt="" />
              <span>Open the player</span>
            </button>
          ) : (
            <p className="clip-empty">Load a video to start.</p>
          ))}
      </div>
      {playerError && <p className="admin-field-error">{playerError}</p>}

      <div className="clip-row clip-scrub-row">
        <span className="clip-mono">{formatTime(now_s, true)}</span>
        <input
          type="range"
          ref={scrubRef}
          className="clip-scrub"
          min={0}
          max={max}
          step={0.1}
          value={Math.min(now_s, max)}
          disabled={!playerOpen || max === 0}
          aria-label="Move through the video"
          onPointerDown={() => (scrubbingRef.current = true)}
          onChange={(event) => seek(Number(event.target.value), false)}
          onPointerUp={(event) => {
            scrubbingRef.current = false;
            seek(Number(event.currentTarget.value), true);
          }}
          onKeyUp={(event) => seek(Number(event.currentTarget.value), true)}
        />
        <span className="clip-mono">{formatTime(duration_s)}</span>
      </div>

      {!readOnly && (
        <div className="clip-row">
          <button
            type="button"
            className="admin-button secondary"
            disabled={!playerOpen}
            onClick={() => setFromPlayer("start")}
          >
            Set start to current time
          </button>
          <button
            type="button"
            className="admin-button secondary"
            disabled={!playerOpen}
            onClick={() => setFromPlayer("end")}
          >
            Set end to current time
          </button>
          <button
            type="button"
            className="admin-button"
            disabled={!playerOpen || !clipOk}
            onClick={playClip}
          >
            ▶ Play clip
          </button>
        </div>
      )}

      <div className="clip-row">
        <label className="clip-time" htmlFor={fields.startS.id}>
          Start
          <span className="admin-required" aria-hidden="true">
            *
          </span>
        </label>
        <input
          ref={startInputRef}
          id={fields.startS.id}
          className="admin-input clip-mono"
          placeholder="1:35"
          size={9}
          value={startText}
          disabled={readOnly}
          aria-invalid={fields.startS.aria["aria-invalid"]}
          aria-describedby={problemsId}
          onChange={(event) => {
            // Saved as typed, and shown as typed until the field is left.
            setStartText(event.target.value);
            commitTime("start", event.target.value);
          }}
          onBlur={() => setStartText(timeText(start_s))}
          onKeyDown={(event) => commitOnEnter("start", event)}
        />
        <label className="clip-time" htmlFor={fields.endS.id}>
          End
          <span className="admin-required" aria-hidden="true">
            *
          </span>
        </label>
        <input
          ref={endInputRef}
          id={fields.endS.id}
          className="admin-input clip-mono"
          placeholder="2:10"
          size={9}
          value={endText}
          disabled={readOnly}
          aria-invalid={fields.endS.aria["aria-invalid"]}
          aria-describedby={problemsId}
          onChange={(event) => {
            setEndText(event.target.value);
            commitTime("end", event.target.value);
          }}
          onBlur={() => setEndText(timeText(end_s))}
          onKeyDown={(event) => commitOnEnter("end", event)}
        />
        <span className="clip-time">
          Length
          <output className="clip-mono">
            {clipOk && start_s !== null && end_s !== null
              ? `${(end_s - start_s).toFixed(1)} s`
              : "–"}
          </output>
        </span>
      </div>

      <ul id={problemsId} className="clip-problems" aria-live="polite">
        {[...clipErrors, ...backendErrors].map((error) => (
          <li key={error.key} className="admin-field-error">
            {error.text}
          </li>
        ))}
        {warnings.map((message) => (
          <li key={message} className="clip-warning">
            {message}
          </li>
        ))}
      </ul>
    </div>
  );
}
