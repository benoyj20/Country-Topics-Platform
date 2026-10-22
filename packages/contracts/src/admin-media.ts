import { type Licence, LICENCES } from "@countrytopics/domain";
import * as z from "zod";

import {
  type FieldTree,
  fieldOfTree,
  mediaFilePath,
  optionalText,
  type RecordDates,
  recordDates,
  recordSearchParams,
  storedText,
} from "./admin-records.ts";

// The admin's file editor (ADR 0014, phase 9): a document or image used
// as evidence or as an individual's photo, uploaded from the admin's
// computer, with its description and licence. A save with a file is sent
// as a form: the file, and the other fields as JSON in `_payload`, as
// Payload's REST API takes uploads.

export type MediaValues = {
  alt: string;
  /** Empty until chosen: every file needs one. */
  licence: Licence | "";
  credit: string;
  sourceUrl: string;
};

/** The stored file, as the backend describes it. */
export type MediaFile = RecordDates & {
  filename: string | null;
  mimeType: string | null;
  filesize: number | null;
  width: number | null;
  height: number | null;
  /** Where staff open it, through this site's /api (mediaFilePath). */
  url: string | null;
};

export type EditorMedia = { id: string; values: MediaValues; file: MediaFile };

export const EMPTY_MEDIA: MediaValues = {
  alt: "",
  licence: "",
  credit: "",
  sourceUrl: "",
};

/** The query string of `GET /api/media/<id>`, and of a save. */
export function mediaSearchParams(): URLSearchParams {
  return recordSearchParams(
    [
      "alt",
      "licence",
      "credit",
      "sourceUrl",
      "filename",
      "mimeType",
      "filesize",
      "width",
      "height",
      "url",
      "createdAt",
      "updatedAt",
    ],
    { depth: 0 },
  );
}

const storedNumber = z.number().nullish();

export const storedMediaSchema = z.looseObject({
  id: z.string(),
  alt: storedText,
  licence: z.enum(LICENCES).nullish(),
  credit: storedText,
  sourceUrl: storedText,
  filename: storedText,
  mimeType: storedText,
  filesize: storedNumber,
  width: storedNumber,
  height: storedNumber,
  url: storedText,
  ...recordDates,
});
export type StoredMedia = z.infer<typeof storedMediaSchema>;

export function editorMedia(stored: StoredMedia): EditorMedia {
  return {
    id: stored.id,
    values: {
      alt: stored.alt ?? "",
      licence: stored.licence ?? "",
      credit: stored.credit ?? "",
      sourceUrl: stored.sourceUrl ?? "",
    },
    file: {
      filename: stored.filename ?? null,
      mimeType: stored.mimeType ?? null,
      filesize: stored.filesize ?? null,
      width: stored.width ?? null,
      height: stored.height ?? null,
      url: mediaFilePath(stored.url),
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
    },
  };
}

/**
 * The fields of a save: the JSON body of `PATCH /api/media/<id>` without a
 * new file, or the `_payload` of the form that sends one.
 */
export function mediaSaveBody(values: MediaValues): Record<string, unknown> {
  return {
    alt: values.alt,
    licence: values.licence || null,
    credit: optionalText(values.credit),
    sourceUrl: optionalText(values.sourceUrl),
  };
}

const MEDIA_FIELDS: FieldTree = {
  file: true,
  alt: true,
  licence: true,
  credit: true,
  sourceUrl: true,
};

export function mediaFieldOf(path: string): string | null {
  return fieldOfTree(MEDIA_FIELDS, path);
}
