import {
  TRANSCRIPT_TIMEBASES,
  type TranscriptTimebase,
  VIDEO_CHECK_STATUSES,
} from "@countrytopics/domain";
import * as z from "zod";

import { recordOf, Related, type RelatedRecord } from "./admin-lists.ts";
import {
  type FieldTree,
  fieldOfTree,
  optionalText,
  type RecordDates,
  recordDates,
  recordSearchParams,
  storedText,
} from "./admin-records.ts";

// The admin's snippet editor (ADR 0014, phase 9): a clip of a YouTube
// video, set with the player, and the transcript of what is said in it.
// The backend stores the times in tenths of a second, keeps the
// transcript's lines inside the clip, and adds the video's record, which
// the worker checks with YouTube; the form shows that check.

export type SnippetValues = {
  caption: string;
  /** The video's id, which a pasted link is read into. */
  youtubeId: string;
  startS: number | null;
  endS: number | null;
  speaker: RelatedRecord | null;
  language: string;
  transcriptText: string;
  transcriptTimebase: TranscriptTimebase;
};

/** Set by the backend only. */
export type SnippetStatus = RecordDates & { video: RelatedRecord | null };

export type EditorSnippet = {
  id: string;
  values: SnippetValues;
  status: SnippetStatus;
};

export const EMPTY_SNIPPET: SnippetValues = {
  caption: "",
  youtubeId: "",
  startS: null,
  endS: null,
  speaker: null,
  language: "en",
  transcriptText: "",
  transcriptTimebase: "video",
};

/** The query string of `GET /api/snippets/<id>`, and of a save. */
export function snippetSearchParams(): URLSearchParams {
  return recordSearchParams([
    // The empty form has every field the editor shows.
    ...(Object.keys(EMPTY_SNIPPET) as (keyof SnippetValues)[]),
    "video",
    "createdAt",
    "updatedAt",
  ]);
}

export const storedSnippetSchema = z.looseObject({
  id: z.string(),
  caption: storedText,
  youtubeId: storedText,
  startS: z.number().nullish(),
  endS: z.number().nullish(),
  speaker: Related.nullish(),
  language: storedText,
  transcriptText: storedText,
  transcriptTimebase: z.enum(TRANSCRIPT_TIMEBASES).nullish(),
  video: Related.nullish(),
  ...recordDates,
});
export type StoredSnippet = z.infer<typeof storedSnippetSchema>;

export function editorSnippet(stored: StoredSnippet): EditorSnippet {
  return {
    id: stored.id,
    values: {
      caption: stored.caption ?? "",
      youtubeId: stored.youtubeId ?? "",
      startS: stored.startS ?? null,
      endS: stored.endS ?? null,
      speaker: stored.speaker ? recordOf("individuals", stored.speaker) : null,
      language: stored.language ?? "",
      transcriptText: stored.transcriptText ?? "",
      transcriptTimebase: stored.transcriptTimebase ?? "video",
    },
    status: {
      video: stored.video ? recordOf("videos", stored.video) : null,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
    },
  };
}

/**
 * The JSON body of a save: `POST /api/snippets` for a new one, `PATCH
 * /api/snippets/<id>` for one that exists. An empty transcript is sent as
 * none, which clears the stored one.
 */
export function snippetSaveBody(
  values: SnippetValues,
): Record<string, unknown> {
  return {
    caption: values.caption,
    youtubeId: values.youtubeId,
    startS: values.startS,
    endS: values.endS,
    speaker: values.speaker?.id ?? null,
    language: values.language,
    transcriptText: optionalText(values.transcriptText),
    transcriptTimebase: values.transcriptTimebase,
  };
}

const SNIPPET_FIELDS: FieldTree = Object.fromEntries(
  Object.keys(EMPTY_SNIPPET).map((field) => [field, true]),
);

export function snippetFieldOf(path: string): string | null {
  return fieldOfTree(SNIPPET_FIELDS, path);
}

const SNIPPET_VIDEO_FIELDS = [
  "youtubeId",
  "title",
  "channel",
  "durationS",
  "checkStatus",
  "checkMessage",
  "confirmedAt",
] as const;

/**
 * The query string of `GET /api/videos` that finds the record of the
 * video a snippet is cut from, which saving the snippet adds.
 */
export function snippetVideoSearchParams(youtubeId: string): URLSearchParams {
  const params = new URLSearchParams({
    "where[youtubeId][equals]": youtubeId,
    limit: "1",
    depth: "0",
  });
  for (const field of SNIPPET_VIDEO_FIELDS) {
    params.set(`select[${field}]`, "true");
  }
  return params;
}

export const snippetVideoSchema = z.looseObject({
  id: z.string(),
  youtubeId: z.string(),
  title: storedText,
  channel: storedText,
  durationS: z.number().nullish(),
  checkStatus: z.enum(VIDEO_CHECK_STATUSES),
  checkMessage: storedText,
  confirmedAt: storedText,
});
export type SnippetVideo = z.infer<typeof snippetVideoSchema>;

export const snippetVideosSchema = z.looseObject({
  docs: z.array(snippetVideoSchema),
});
