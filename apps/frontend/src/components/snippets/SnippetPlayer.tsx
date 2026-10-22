"use client";

import { formatTime, type TranscriptSegment } from "@countrytopics/domain";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./SnippetPlayer.module.css";
import {
  loadYouTubeIframeApi,
  mountPlayer,
  PlayerState,
  playerErrorMessage,
  thumbnailUrl,
  watchUrl,
  type YouTubePlayer,
} from "./youtube-iframe-api";

const TICK_MS = 200;
/** Dragging YouTube's progress bar this far before the clip snaps back. */
const BEFORE_START_TOLERANCE_S = 0.5;
/** Stop just before the end, as the player reports time in steps. */
const END_TOLERANCE_S = 0.05;
/** A click on the last line still plays a moment of it. */
const MIN_PLAY_S = 0.2;

export type SnippetPlayerProps = {
  youtubeId: string;
  start_s: number;
  end_s: number;
  caption: string;
  speaker?: string | null;
  /** The speaker's page, when visitors can open it. */
  speakerHref?: string | null;
  /** The language of the transcript, such as en or sw. */
  language?: string | null;
  videoTitle?: string | null;
  channel?: string | null;
  /** The transcript inside the clip, in video time; empty when there is none. */
  segments: TranscriptSegment[];
  /** YouTube no longer plays the video; the transcript stays readable. */
  videoUnavailable?: string | null;
};

type Phase = "facade" | "loading" | "player";

/**
 * A snippet as visitors see it: a thumbnail until clicked, then YouTube's
 * privacy-enhanced player kept inside the clip, with the transcript
 * highlighted in step. Clicking a line plays from it.
 */
export function SnippetPlayer({
  youtubeId,
  start_s,
  end_s,
  caption,
  speaker,
  speakerHref,
  language,
  videoTitle,
  channel,
  segments,
  videoUnavailable,
}: SnippetPlayerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const readyRef = useRef(false);
  const startAtRef = useRef(start_s);
  const phaseRef = useRef<Phase>("facade");
  const [phase, setPhase] = useState<Phase>("facade");
  const [ended, setEnded] = useState(false);
  const [active, setActive] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  const changePhase = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  useEffect(
    () => () => {
      playerRef.current?.destroy();
      playerRef.current = null;
    },
    [],
  );

  // Keeps playback inside the clip and the transcript in step.
  useEffect(() => {
    if (phase !== "player") return;
    const timer = setInterval(() => {
      const player = playerRef.current;
      if (!player || !readyRef.current) return;
      const now = player.getCurrentTime() || 0;
      const state = player.getPlayerState();
      const playing = state === PlayerState.PLAYING;
      if (playing && now < start_s - BEFORE_START_TOLERANCE_S) {
        player.seekTo(start_s, true);
      }
      if (
        (playing && now >= end_s - END_TOLERANCE_S) ||
        state === PlayerState.ENDED
      ) {
        player.pauseVideo();
        setEnded(true);
      }
      setActive(
        segments.findIndex(
          (segment) => now >= segment.start_s && now < segment.end_s,
        ),
      );
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [phase, start_s, end_s, segments]);

  // Scrolls the list, not the page, to keep the spoken line in view.
  useEffect(() => {
    const list = listRef.current;
    const item = list?.children[active];
    if (list && item instanceof HTMLElement) {
      list.scrollTo({
        top: item.offsetTop - list.clientHeight / 3,
        behavior: "smooth",
      });
    }
  }, [active]);

  const playFrom = useCallback(
    async (time_s: number) => {
      const at = Math.min(Math.max(time_s, start_s), end_s - MIN_PLAY_S);
      setEnded(false);
      startAtRef.current = at;
      const player = playerRef.current;
      if (player && readyRef.current) {
        player.seekTo(at, true);
        player.playVideo();
        return;
      }
      if (phaseRef.current !== "facade") return;
      changePhase("loading");
      try {
        const api = await loadYouTubeIframeApi();
        const host = hostRef.current;
        if (!host) return;
        playerRef.current = mountPlayer(api, host, youtubeId, {
          playerVars: {
            start: Math.floor(at),
            end: Math.ceil(end_s),
            autoplay: 1,
          },
          events: {
            onReady: ({ target }) => {
              readyRef.current = true;
              target.seekTo(startAtRef.current, true);
              target.playVideo();
            },
            onError: ({ data }) => setError(playerErrorMessage(data)),
          },
        });
        changePhase("player");
      } catch (loadError) {
        console.error(loadError);
        setError(
          "The YouTube player could not be loaded. Check your connection, or watch the video on YouTube.",
        );
        changePhase("facade");
      }
    },
    [youtubeId, start_s, end_s],
  );

  const source = `From “${videoTitle ?? youtubeId}”${channel ? ` · ${channel}` : ""}`;

  return (
    <article className={styles.snippet}>
      <header className={styles.header}>
        <h3 className={styles.caption}>{caption || "Untitled snippet"}</h3>
        <p className={styles.muted}>
          {speaker ? (
            <>
              Speaker:{" "}
              {speakerHref ? (
                <Link href={speakerHref}>{speaker}</Link>
              ) : (
                speaker
              )}{" "}
              ·{" "}
            </>
          ) : null}
          {source}
        </p>
      </header>
      <div className={styles.body}>
        <div className={styles.stage}>
          {videoUnavailable ? (
            <div className={styles.notice}>
              <p>{videoUnavailable}</p>
              <p className={styles.muted}>The transcript below is kept.</p>
            </div>
          ) : (
            <>
              <div ref={hostRef} className={styles.frame} />
              {phase !== "player" ? (
                <button
                  type="button"
                  className={styles.facade}
                  aria-label={`Play snippet: ${caption}`}
                  disabled={phase === "loading"}
                  onClick={() => void playFrom(start_s)}
                >
                  {/* YouTube's thumbnail, through this site; the player loads on click. */}
                  {/* eslint-disable-next-line @next/next/no-img-element -- served by /thumbnails with its own cache headers */}
                  <img src={thumbnailUrl(youtubeId)} alt="" />
                  <span className={styles.play} aria-hidden="true" />
                  <span className={styles.badge}>
                    {formatTime(start_s)}–{formatTime(end_s)} ·{" "}
                    {Math.round(end_s - start_s)} s
                  </span>
                </button>
              ) : null}
              {ended ? (
                <div className={styles.ended}>
                  <p>Snippet ended</p>
                  <div className={styles.row}>
                    <button
                      type="button"
                      onClick={() => void playFrom(start_s)}
                    >
                      ↺ Replay
                    </button>
                    <a
                      href={watchUrl(youtubeId, start_s)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Watch the full video on YouTube ↗
                    </a>
                  </div>
                </div>
              ) : null}
            </>
          )}
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className={styles.transcript}>
          {segments.length > 0 ? (
            <ol
              ref={listRef}
              className={styles.lines}
              lang={language ?? undefined}
            >
              {segments.map((segment, index) => (
                <li
                  key={`${segment.start_s}-${index}`}
                  className={
                    index === active
                      ? styles.active
                      : active >= 0 && index < active
                        ? styles.past
                        : undefined
                  }
                >
                  <button
                    type="button"
                    aria-current={index === active ? "true" : undefined}
                    disabled={Boolean(videoUnavailable)}
                    onClick={() => void playFrom(segment.start_s)}
                  >
                    <span className={styles.time}>
                      {formatTime(segment.start_s)}
                    </span>
                    <span>{segment.text}</span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className={`${styles.muted} ${styles.pad}`}>
              No transcript for this snippet.
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
