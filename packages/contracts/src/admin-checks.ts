import {
  LINK_ARCHIVE_STATUSES,
  VIDEO_CHECK_STATUSES,
} from "@countrytopics/domain";
import * as z from "zod";

import {
  recordDates,
  recordSearchParams,
  storedText,
} from "./admin-records.ts";

// The records only the worker writes (ADR 0014, phase 9): the YouTube
// videos snippets are cut from, which admins may delete once no snippet
// uses them, and the Wayback Machine's copies of links, which nobody
// edits. The admin shows what the worker found.

const VIDEO_READ = [
  "youtubeId",
  "title",
  "channel",
  "durationS",
  "checkStatus",
  "checkMessage",
  "checkedAt",
  "confirmedAt",
  "createdAt",
  "updatedAt",
] as const;

/** The query string of `GET /api/videos/<id>`. */
export function videoSearchParams(): URLSearchParams {
  return recordSearchParams(VIDEO_READ, { depth: 0 });
}

export const storedVideoSchema = z.looseObject({
  id: z.string(),
  youtubeId: z.string(),
  title: storedText,
  channel: storedText,
  durationS: z.number().nullish(),
  checkStatus: z.enum(VIDEO_CHECK_STATUSES),
  checkMessage: storedText,
  checkedAt: storedText,
  confirmedAt: storedText,
  ...recordDates,
});
export type StoredVideo = z.infer<typeof storedVideoSchema>;

/** How many of the snippets cut from a video its page lists. */
export const VIDEO_SNIPPETS_SHOWN = 50;

/** The query string of `GET /api/snippets` for those cut from a video. */
export function videoSnippetsSearchParams(video: string): URLSearchParams {
  return new URLSearchParams({
    "where[video][equals]": video,
    sort: "startS",
    depth: "0",
    limit: String(VIDEO_SNIPPETS_SHOWN),
    "select[caption]": "true",
    "select[startS]": "true",
    "select[endS]": "true",
  });
}

export const videoSnippetsSchema = z.looseObject({
  docs: z.array(
    z.looseObject({
      id: z.string(),
      caption: storedText,
      startS: z.number().nullish(),
      endS: z.number().nullish(),
    }),
  ),
  totalDocs: z.number().int().nonnegative(),
});

const LINK_ARCHIVE_READ = [
  "url",
  "status",
  "archiveUrl",
  "capturedAt",
  "message",
  "checkedAt",
  "createdAt",
  "updatedAt",
] as const;

/** The query string of `GET /api/link-archives/<id>`. */
export function linkArchiveSearchParams(): URLSearchParams {
  return recordSearchParams(LINK_ARCHIVE_READ, { depth: 0 });
}

export const storedLinkArchiveSchema = z.looseObject({
  id: z.string(),
  url: z.string(),
  status: z.enum(LINK_ARCHIVE_STATUSES),
  archiveUrl: storedText,
  capturedAt: storedText,
  message: storedText,
  checkedAt: storedText,
  ...recordDates,
});
export type StoredLinkArchive = z.infer<typeof storedLinkArchiveSchema>;
