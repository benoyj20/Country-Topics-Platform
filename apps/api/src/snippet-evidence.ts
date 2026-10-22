import type { SnippetEvidence } from "@countrytopics/domain";

import type { Snippet, Video } from "./payload-types";

/**
 * What the evidence rule checks about a snippet and its video, from their
 * records: shared by the topic publish check and the profile statement check
 * (ADR 0007), so both judge a video the same way.
 */
export function snippetEvidence(
  snippet: Pick<Snippet, "caption" | "endS"> | undefined,
  video: Pick<Video, "checkStatus" | "confirmedAt" | "durationS"> | undefined,
): SnippetEvidence {
  return {
    caption: snippet?.caption ?? "Unknown snippet",
    end_s: snippet?.endS ?? 0,
    video: video
      ? {
          checkStatus: video.checkStatus,
          confirmed: Boolean(video.confirmedAt),
          duration_s: video.durationS ?? null,
        }
      : null,
  };
}
