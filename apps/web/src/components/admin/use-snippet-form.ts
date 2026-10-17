"use client";

import {
  clipProblems,
  type SnippetTranscript,
  snippetTranscript,
  YOUTUBE_ID_PATTERN,
} from "@countrytopics/domain";
import { useFormFields } from "@payloadcms/ui";
import { useMemo } from "react";

const asText = (value: unknown) => (typeof value === "string" ? value : "");
const asTime = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * The snippet form's values and what follows from them, computed with the
 * same functions the server uses when saving. Each selector returns a
 * primitive, so typing elsewhere does not re-render the caller.
 */
export function useSnippetForm() {
  const youtubeId = useFormFields(([fields]) =>
    asText(fields.youtubeId?.value),
  );
  const start_s = useFormFields(([fields]) => asTime(fields.startS?.value));
  const end_s = useFormFields(([fields]) => asTime(fields.endS?.value));
  const caption = useFormFields(([fields]) => asText(fields.caption?.value));
  const speakerId = useFormFields(([fields]) => {
    const value = fields.speaker?.value;
    return typeof value === "string" ? value : null;
  });
  const transcriptText = useFormFields(([fields]) =>
    asText(fields.transcriptText?.value),
  );
  const timebase = useFormFields(([fields]) =>
    fields.transcriptTimebase?.value === "clip" ? "clip" : "video",
  );

  const clipValid =
    start_s !== null &&
    end_s !== null &&
    clipProblems({ start_s, end_s }).errors.length === 0;

  const transcript: SnippetTranscript | null = useMemo(
    () =>
      clipValid && start_s !== null && end_s !== null
        ? snippetTranscript({ text: transcriptText, timebase, start_s, end_s })
        : null,
    [clipValid, transcriptText, timebase, start_s, end_s],
  );

  return {
    youtubeId: YOUTUBE_ID_PATTERN.test(youtubeId) ? youtubeId : null,
    start_s,
    end_s,
    caption,
    speakerId,
    clipValid,
    hasTranscriptText: transcriptText.trim() !== "",
    transcript,
  };
}
