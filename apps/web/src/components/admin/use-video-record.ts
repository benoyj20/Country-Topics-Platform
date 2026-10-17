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
 * The editor, the preview, and the sidebar all need the record; they share
 * one request per video and save instead of sending one each.
 */
let shared: { key: string; request: Promise<VideoRecordState> } | null = null;

function lookUp(url: string, key: string): Promise<VideoRecordState> {
  if (shared?.key === key) return shared.request;
  const request = fetch(url, { credentials: "same-origin" })
    .then(async (response): Promise<VideoRecordState> => {
      if (!response.ok) throw new Error(`Lookup failed: ${response.status}`);
      const [video] = videoList.parse(await response.json()).docs;
      return video ? { kind: "found", video } : { kind: "new" };
    })
    .catch((error: unknown): VideoRecordState => {
      console.error(error);
      // Not kept, so the next render tries again.
      if (shared?.key === key) shared = null;
      return { kind: "error" };
    });
  shared = { key, request };
  return request;
}

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
    let current = true;
    const params = new URLSearchParams({
      "where[youtubeId][equals]": valid,
      limit: "1",
      depth: "0",
    });
    const url = `${config.serverURL}${config.routes.api}/videos?${params}`;
    void lookUp(url, `${url}#${lastUpdateTime}`).then((state) => {
      if (current) setResult({ youtubeId: valid, state });
    });
    return () => {
      current = false;
    };
  }, [valid, lastUpdateTime, config.serverURL, config.routes.api]);

  if (!valid || result?.youtubeId !== valid) return { kind: "none" };
  return result.state;
}
