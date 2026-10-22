import "server-only";

import {
  editorSnippet,
  snippetSearchParams,
  storedSnippetSchema,
  storedVideoSchema,
  videoSearchParams,
  videoSnippetsSchema,
  videoSnippetsSearchParams,
} from "@countrytopics/contracts";

import { readAsStaff } from "@/admin/backend";
import { readRecord } from "@/admin/records/backend";
import { BackendError } from "@/backend/request";

// The snippets feature's reads for its editors, from Payload's REST API
// as the staff member, with the query a save is answered with.

export async function readSnippet(id: string) {
  const stored = await readRecord(
    "snippets",
    id,
    snippetSearchParams(),
    storedSnippetSchema,
  );
  return stored && editorSnippet(stored);
}

/** A video, with the snippets cut from it. */
export async function readVideo(id: string) {
  const video = await readRecord(
    "videos",
    id,
    videoSearchParams(),
    storedVideoSchema,
  );
  if (!video) return null;
  const path = `/api/snippets?${videoSnippetsSearchParams(video.id)}`;
  const snippets = await readAsStaff(path, videoSnippetsSchema);
  if (!snippets) throw new BackendError(path, 404);
  return { video, snippets };
}
