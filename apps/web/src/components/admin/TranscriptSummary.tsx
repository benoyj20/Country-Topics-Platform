"use client";

import { Banner } from "@payloadcms/ui";
import type { UIFieldClientComponent } from "payload";

import { useSnippetForm } from "./use-snippet-form";

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * How the pasted transcript was read: lines found, lines outside the clip,
 * and text before the first timestamp. The server stores the same result.
 */
export const TranscriptSummary: UIFieldClientComponent = () => {
  const { transcript, hasTranscriptText, clipValid } = useSnippetForm();
  if (!hasTranscriptText) return null;
  if (!clipValid) {
    return (
      <Banner type="info">
        Set the clip&apos;s start and end to see which lines it keeps.
      </Banner>
    );
  }
  if (!transcript) return null;
  if (transcript.problem) {
    return <Banner type="error">{transcript.problem}</Banner>;
  }
  const parts = [`${plural(transcript.segments.length, "line")} in the clip`];
  if (transcript.dropped > 0) {
    parts.push(`${plural(transcript.dropped, "line")} outside it left out`);
  }
  if (transcript.skipped > 0) {
    parts.push(
      `${plural(transcript.skipped, "line")} before the first timestamp ignored`,
    );
  }
  return <Banner type="success">{parts.join(" · ")}</Banner>;
};
