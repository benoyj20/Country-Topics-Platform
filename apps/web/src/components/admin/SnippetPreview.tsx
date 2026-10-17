"use client";

import type { TranscriptSegment } from "@countrytopics/domain";
import { useConfig } from "@payloadcms/ui";
import type { UIFieldClientComponent } from "payload";
import { useEffect, useState } from "react";
import * as z from "zod";

import { SnippetPlayer } from "@/components/snippets/SnippetPlayer";

import { useSnippetForm } from "./use-snippet-form";
import { useVideoRecord } from "./use-video-record";

const individual = z.object({ name: z.string() });
// One array for "no lines", so the player's timer is not reset on every render.
const NO_SEGMENTS: TranscriptSegment[] = [];

/** The speaker's name, for the preview's byline. */
function useSpeakerName(id: string | null): string | null {
  const { config } = useConfig();
  const [result, setResult] = useState<{ id: string; name: string } | null>(
    null,
  );
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ depth: "0", "select[name]": "true" });
    fetch(
      `${config.serverURL}${config.routes.api}/individuals/${encodeURIComponent(id)}?${params}`,
      { credentials: "same-origin", signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error(`Lookup failed: ${response.status}`);
        setResult({ id, name: individual.parse(await response.json()).name });
      })
      .catch((error: unknown) => {
        // The byline is optional; the preview works without it.
        if (!controller.signal.aborted) console.error(error);
      });
    return () => controller.abort();
  }, [id, config.serverURL, config.routes.api]);
  return id && result?.id === id ? result.name : null;
}

/** The snippet as visitors will see it, built from the form as it is now. */
export const SnippetPreview: UIFieldClientComponent = () => {
  const {
    youtubeId,
    start_s,
    end_s,
    caption,
    speakerId,
    clipValid,
    transcript,
  } = useSnippetForm();
  const speaker = useSpeakerName(speakerId);
  const record = useVideoRecord(youtubeId);
  const video = record.kind === "found" ? record.video : null;
  const unavailable =
    video?.checkStatus === "unavailable" ||
    video?.checkStatus === "not_embeddable"
      ? (video.checkMessage ?? "YouTube no longer plays this video here.")
      : null;

  const ready =
    youtubeId !== null && clipValid && start_s !== null && end_s !== null;
  return (
    <div className="field-type" style={{ marginBottom: "var(--base)" }}>
      <h3 style={{ marginBottom: "calc(var(--base) / 2)" }}>
        Preview: what visitors see
      </h3>
      {ready ? (
        <SnippetPlayer
          // A new clip starts a new player.
          key={`${youtubeId}:${start_s}:${end_s}`}
          youtubeId={youtubeId}
          start_s={start_s}
          end_s={end_s}
          caption={caption}
          speaker={speaker}
          videoTitle={video?.title}
          channel={video?.channel}
          segments={
            transcript && !transcript.problem
              ? transcript.segments
              : NO_SEGMENTS
          }
          videoUnavailable={unavailable}
        />
      ) : (
        <p>Load a video and set a valid start and end to see the preview.</p>
      )}
    </div>
  );
};
