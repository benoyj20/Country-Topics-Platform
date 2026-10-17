"use client";

import {
  clipProblems,
  secondsOrNull,
  type SnippetTranscript,
  snippetTranscript,
  type TranscriptTimebase,
  YOUTUBE_ID_PATTERN,
} from "@countrytopics/domain";
import { useFormFields } from "@payloadcms/ui";

const asText = (value: unknown) => (typeof value === "string" ? value : "");

type TranscriptInput = {
  text: string;
  timebase: TranscriptTimebase;
  start_s: number;
  end_s: number;
};

/**
 * The transcript summary and the preview both need the parsed transcript
 * (the text can be 200,000 characters); the last result is kept, so they
 * parse it once per change between them.
 */
let lastTranscript: {
  input: TranscriptInput;
  result: SnippetTranscript;
} | null = null;

function parsedTranscript(input: TranscriptInput): SnippetTranscript {
  const last = lastTranscript?.input;
  if (
    lastTranscript &&
    last?.text === input.text &&
    last.timebase === input.timebase &&
    last.start_s === input.start_s &&
    last.end_s === input.end_s
  ) {
    return lastTranscript.result;
  }
  const result = snippetTranscript(input);
  lastTranscript = { input, result };
  return result;
}

/**
 * The snippet form's values and what follows from them, computed with the
 * same functions the server uses when saving. Each selector returns a
 * primitive, so typing elsewhere does not re-render the caller.
 */
export function useSnippetForm() {
  const youtubeId = useFormFields(([fields]) =>
    asText(fields.youtubeId?.value),
  );
  const start_s = useFormFields(([fields]) =>
    secondsOrNull(fields.startS?.value),
  );
  const end_s = useFormFields(([fields]) => secondsOrNull(fields.endS?.value));
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

  const transcript: SnippetTranscript | null =
    clipValid && start_s !== null && end_s !== null
      ? parsedTranscript({ text: transcriptText, timebase, start_s, end_s })
      : null;

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
