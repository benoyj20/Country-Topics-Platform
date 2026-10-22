import type { TranscriptTimebase } from "@countrytopics/domain";

import type { FieldTexts } from "../../field-text.ts";

// What the snippet editor calls each field and what it says about it, as
// Payload's panel does (apps/api/src/collections/Snippets.ts), for the
// editor and for comparing versions.

export const SNIPPET_TEXTS: FieldTexts = {
  caption: {
    label: "Caption",
    description:
      "What the clip shows, such as 'Minister announces the budget, 3 May 2024'.",
  },
  youtubeId: { label: "YouTube video" },
  startS: { label: "Start" },
  endS: { label: "End" },
  speaker: {
    label: "Speaker",
    description: "Who speaks in the clip, if listed.",
  },
  language: {
    label: "Language",
    description: "Of what is said, such as en or sw.",
  },
  transcriptText: {
    label: "Transcript",
    description:
      "Optional. Paste lines from YouTube's '…more → Show transcript' panel, lines like '1:35 some text', or an SRT or WebVTT file. Lines outside the clip are left out. Never paste text that was not said in the video.",
  },
  transcriptTimebase: { label: "Transcript timestamps count from" },
};

export const TIMEBASE_LABELS: Record<TranscriptTimebase, string> = {
  video: "The start of the video",
  clip: "The start of the clip",
};
