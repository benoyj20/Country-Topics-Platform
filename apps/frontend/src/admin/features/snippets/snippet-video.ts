"use client";

import {
  type SnippetVideo,
  snippetVideoSearchParams,
  snippetVideosSchema,
} from "@countrytopics/contracts";
import { YOUTUBE_ID_PATTERN } from "@countrytopics/domain";
import { useEffect, useState } from "react";

export type SnippetVideoState =
  | { kind: "none" }
  /** No record yet: saving the snippet adds it. */
  | { kind: "new" }
  | { kind: "found"; video: SnippetVideo }
  | { kind: "failed" };

/**
 * The record of the video a snippet is cut from, read again whenever
 * `savedAt` changes: the worker fills it in after each save.
 */
export function useSnippetVideo(
  youtubeId: string,
  savedAt: string | null,
): SnippetVideoState {
  const valid = YOUTUBE_ID_PATTERN.test(youtubeId) ? youtubeId : null;
  const key = `${valid}#${savedAt}`;
  const [result, setResult] = useState<{
    key: string;
    state: SnippetVideoState;
  } | null>(null);

  useEffect(() => {
    if (!valid) return;
    const controller = new AbortController();
    fetch(`/api/videos?${snippetVideoSearchParams(valid)}`, {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`${response.status}`);
        const [video] = snippetVideosSchema.parse(await response.json()).docs;
        setResult({
          key,
          state: video ? { kind: "found", video } : { kind: "new" },
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setResult({ key, state: { kind: "failed" } });
        }
      });
    return () => controller.abort();
  }, [valid, key]);

  if (!valid || result?.key !== key) return { kind: "none" };
  return result.state;
}
