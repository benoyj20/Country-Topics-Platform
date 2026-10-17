"use client";

import {
  VIDEO_CHECK_STATUSES,
  YOUTUBE_ID_PATTERN,
} from "@countrytopics/domain";
import { useConfig, useDocumentInfo } from "@payloadcms/ui";
import { useEffect, useState } from "react";
import * as z from "zod";

const videoList = z.object({
  docs: z.array(
    z.object({
      youtubeId: z.string(),
      title: z.string().nullish(),
      channel: z.string().nullish(),
      durationS: z.number().nullish(),
      checkStatus: z.enum(VIDEO_CHECK_STATUSES),
      checkMessage: z.string().nullish(),
      confirmedAt: z.string().nullish(),
    }),
  ),
});
export type VideoRecord = z.infer<typeof videoList>["docs"][number];

export type VideoRecordState =
  | { kind: "none" }
  /** No record yet: saving the snippet adds it. */
  | { kind: "new" }
  | { kind: "found"; video: VideoRecord }
  | { kind: "error" };

/**
 * The video record for a YouTube id, read again after each save of the
 * document (the worker fills it in after the save).
 */
export function useVideoRecord(youtubeId: string | null): VideoRecordState {
  const { config } = useConfig();
  const { lastUpdateTime } = useDocumentInfo();
  const valid =
    youtubeId && YOUTUBE_ID_PATTERN.test(youtubeId) ? youtubeId : null;
  const [result, setResult] = useState<{
    youtubeId: string;
    state: VideoRecordState;
  } | null>(null);

  useEffect(() => {
    if (!valid) return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      "where[youtubeId][equals]": valid,
      limit: "1",
      depth: "0",
    });
    fetch(`${config.serverURL}${config.routes.api}/videos?${params}`, {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Lookup failed: ${response.status}`);
        const [video] = videoList.parse(await response.json()).docs;
        setResult({
          youtubeId: valid,
          state: video ? { kind: "found", video } : { kind: "new" },
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error(error);
        setResult({ youtubeId: valid, state: { kind: "error" } });
      });
    return () => controller.abort();
  }, [valid, lastUpdateTime, config.serverURL, config.routes.api]);

  if (!valid || result?.youtubeId !== valid) return { kind: "none" };
  return result.state;
}
