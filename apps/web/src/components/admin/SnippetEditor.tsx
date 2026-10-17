"use client";

import {
  clipProblems,
  formatTime,
  parseTime,
  parseYouTubeUrl,
  roundToTenths,
  secondsOrNull,
} from "@countrytopics/domain";
import { Button, useField } from "@payloadcms/ui";
import type { UIFieldClientComponent } from "payload";
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

import styles from "./SnippetEditor.module.css";
import { useVideoRecord } from "./use-video-record";

const TICK_MS = 250;
/** A new clip's end when none is set: start plus this, within the video. */
const DEFAULT_CLIP_LENGTH_S = 30;
/** Lengths reported by the player wobble slightly while it loads. */
const DURATION_CHANGE_S = 0.5;

const timeText = (value: number | null) =>
  value === null ? "" : formatTime(value, true);

/**
 * The clip editor: paste a YouTube link, play the video, and set the clip's
 * start and end from the player or by typing. It edits the snippet's hidden
 * youtubeId, startS, and endS fields; the server checks them again on save.
 */
export const SnippetEditor: UIFieldClientComponent = () => {
  const youtube = useField<string>({ path: "youtubeId" });
  const start = useField<number | null>({ path: "startS" });
  const end = useField<number | null>({ path: "endS" });
  const youtubeId = typeof youtube.value === "string" ? youtube.value : "";
  const start_s = secondsOrNull(start.value);
  const end_s = secondsOrNull(end.value);

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

  const [link, setLink] = useState(() =>
    youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : "",
  );
  const [linkError, setLinkError] = useState<string | null>(null);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [now_s, setNow] = useState(0);
  // The length the player reports, else the one the worker found; a player
  // may report none until the video starts playing.
  const [playerDuration_s, setDuration] = useState<number | null>(null);
  const record = useVideoRecord(youtubeId || null);
  const duration_s =
    playerDuration_s ??
    (record.kind === "found" ? (record.video.durationS ?? null) : null);
  const [startText, setStartText] = useState(() => timeText(start_s));
  const [endText, setEndText] = useState(() => timeText(end_s));
  const scrubRef = useRef<HTMLInputElement>(null);

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

  // Typed times follow the fields, except while being typed.
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
    } catch (error) {
      console.error(error);
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
      end.setValue(
        roundToTenths(
          Math.min((start_s ?? 0) + DEFAULT_CLIP_LENGTH_S, duration_s),
        ),
      );
    }
  }, [duration_s, end_s, start_s, end]);

  function loadVideo() {
    const parsed = parseYouTubeUrl(link);
    if (!parsed) {
      setLinkError("That does not look like a YouTube link.");
      return;
    }
    setLinkError(null);
    if (parsed.id !== youtubeId) {
      youtube.setValue(parsed.id);
      setDuration(null);
      start.setValue(parsed.start_s ?? 0);
      end.setValue(null);
      proposeEndRef.current = true;
    }
    void openPlayer(parsed.id);
  }

  function setFromPlayer(which: "start" | "end") {
    const player = playerRef.current;
    if (!player || !readyRef.current) return;
    const time = roundToTenths(player.getCurrentTime());
    if (which === "start") {
      start.setValue(time);
      if (!(end_s !== null && end_s > time)) {
        end.setValue(null);
        proposeEndRef.current = true;
      }
    } else {
      end.setValue(time);
    }
  }

  function playClip() {
    const player = playerRef.current;
    if (!player || !readyRef.current || start_s === null || !clipOk) return;
    player.seekTo(start_s, true);
    player.playVideo();
    clipPlayingRef.current = true;
  }

  function commitOnEnter(
    which: "start" | "end",
    event: KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key !== "Enter") return;
    // Enter would submit the whole document.
    event.preventDefault();
    commitTime(which, event.currentTarget.value);
  }

  function commitTime(which: "start" | "end", text: string) {
    const parsed = parseTime(text);
    (which === "start" ? start : end).setValue(
      parsed === null ? null : roundToTenths(parsed),
    );
  }

  function seek(time: number, final: boolean) {
    setNow(time);
    if (playerRef.current && readyRef.current) {
      playerRef.current.seekTo(time, final);
    }
  }

  // The server's messages, such as a length only the worker knew, without
  // repeating what is already listed.
  const serverErrors = [youtube, start, end]
    .filter((field) => field.showError && field.errorMessage)
    .map((field) => field.errorMessage ?? "")
    .filter((message) => !errors.includes(message));

  return (
    <div className={`field-type ${styles.editor}`}>
      <label className={styles.label} htmlFor="snippet-link">
        YouTube link <span className={styles.required}>*</span>
      </label>
      <div className={styles.row}>
        <input
          id="snippet-link"
          className={styles.grow}
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="youtube.com/watch?v=…, youtu.be/…, or /shorts/…"
          value={link}
          onChange={(event) => setLink(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              // Enter would submit the whole document.
              event.preventDefault();
              loadVideo();
            }
          }}
        />
        <Button
          buttonStyle="secondary"
          size="small"
          margin={false}
          onClick={loadVideo}
        >
          Load video
        </Button>
      </div>
      {linkError ? <p className={styles.error}>{linkError}</p> : null}

      <div className={styles.frame}>
        <div ref={hostRef} className={styles.player} />
        {!playerOpen ? (
          youtubeId ? (
            <button
              type="button"
              className={styles.facade}
              onClick={() => void openPlayer(youtubeId)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- YouTube's thumbnail; the player loads on click */}
              <img src={thumbnailUrl(youtubeId)} alt="" />
              <span>Open the player</span>
            </button>
          ) : (
            <p className={styles.empty}>Load a video to start.</p>
          )
        ) : null}
      </div>
      {playerError ? <p className={styles.error}>{playerError}</p> : null}

      <div className={styles.scrubRow}>
        <span className={styles.mono}>{formatTime(now_s, true)}</span>
        <input
          type="range"
          ref={scrubRef}
          className={styles.scrub}
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
        <span className={styles.mono}>{formatTime(duration_s)}</span>
      </div>

      <div className={styles.row}>
        <Button
          buttonStyle="secondary"
          size="small"
          margin={false}
          disabled={!playerOpen}
          onClick={() => setFromPlayer("start")}
        >
          Set start to current time
        </Button>
        <Button
          buttonStyle="secondary"
          size="small"
          margin={false}
          disabled={!playerOpen}
          onClick={() => setFromPlayer("end")}
        >
          Set end to current time
        </Button>
        <Button
          size="small"
          margin={false}
          disabled={!playerOpen || !clipOk}
          onClick={playClip}
        >
          ▶ Play clip
        </Button>
      </div>

      <div className={styles.row}>
        <label className={styles.time}>
          Start <span className={styles.required}>*</span>
          <input
            ref={startInputRef}
            className={styles.mono}
            placeholder="1:35"
            size={9}
            value={startText}
            onChange={(event) => setStartText(event.target.value)}
            onBlur={(event) => commitTime("start", event.target.value)}
            onKeyDown={(event) => commitOnEnter("start", event)}
          />
        </label>
        <label className={styles.time}>
          End <span className={styles.required}>*</span>
          <input
            ref={endInputRef}
            className={styles.mono}
            placeholder="2:10"
            size={9}
            value={endText}
            onChange={(event) => setEndText(event.target.value)}
            onBlur={(event) => commitTime("end", event.target.value)}
            onKeyDown={(event) => commitOnEnter("end", event)}
          />
        </label>
        <span className={styles.time}>
          Length
          <output className={styles.mono}>
            {clipOk && start_s !== null && end_s !== null
              ? `${(end_s - start_s).toFixed(1)} s`
              : "–"}
          </output>
        </span>
      </div>

      {youtubeId || serverErrors.length > 0 ? (
        <ul className={styles.problems} aria-live="polite">
          {(youtubeId ? errors : []).concat(serverErrors).map((message) => (
            <li key={message} className={styles.error}>
              {message}
            </li>
          ))}
          {warnings.map((message) => (
            <li key={message} className={styles.warning}>
              {message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};
