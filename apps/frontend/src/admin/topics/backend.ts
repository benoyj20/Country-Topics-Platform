import "server-only";

import {
  type EditorTopic,
  editorTopic,
  isRecordId,
  PREVIEW_PATHS,
  storedBodySchema,
  storedTopicSchema,
  topicBodySearchParams,
  topicChangeSchema,
  topicChangeSearchParams,
  topicChangesPageSchema,
  topicChangesSearchParams,
  topicFieldsSearchParams,
  topicVersionSchema,
  topicVersionSearchParams,
  topicVersionsPageSchema,
  topicVersionsSearchParams,
  TopicPage,
} from "@countrytopics/contracts";
import * as z from "zod";

import { BackendError } from "@/backend/request";

import { readAsStaff } from "../backend";
import { isUuid } from "../list-state";

// The topic editor's reads from Payload's REST API, as the staff member.

/** A read that must be answered; a 404 means the record is gone. */
async function required<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const answer = await readAsStaff(path, schema);
  if (answer === null) throw new BackendError(path, 404);
  return answer;
}

/**
 * A topic as the editor shows it, or null when there is none. Its fields
 * and its body are read together; when a save lands between the two,
 * both are read again.
 */
export async function readEditorTopic(id: string): Promise<EditorTopic | null> {
  if (!isUuid(id)) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const [fields, body] = await Promise.all([
      readAsStaff(
        `/api/topics/${id}?${topicFieldsSearchParams()}`,
        storedTopicSchema,
      ),
      readAsStaff(
        `/api/topics/${id}?${topicBodySearchParams()}`,
        storedBodySchema,
      ),
    ]);
    if (!fields || !body) return null;
    if (fields.updatedAt === body.updatedAt)
      return editorTopic(fields, body.body);
  }
  throw new Error(`Topic ${id} kept changing while it was read.`);
}

/**
 * The topic's change log, newest first; with `versions`, the entries for
 * those versions only.
 */
export async function readTopicChanges(
  id: string,
  versions?: readonly string[],
) {
  if (!isUuid(id) || versions?.length === 0) return [];
  const path = `/api/topic-changes?${topicChangesSearchParams(id, versions)}`;
  return (await required(path, topicChangesPageSchema)).docs;
}

/** A page of the topic's versions, newest first. */
export async function readTopicVersions(id: string, page: number) {
  return required(
    `/api/topics/versions?${topicVersionsSearchParams(id, page)}`,
    topicVersionsPageSchema,
  );
}

/** One version, whole, or null when there is none. */
export async function readTopicVersion(version: string) {
  if (!isUuid(version)) return null;
  return readAsStaff(
    `/api/topics/versions/${version}?${topicVersionSearchParams()}`,
    topicVersionSchema,
  );
}

/** One change log entry, with its topic's title and its author's address. */
export async function readTopicChange(id: string) {
  if (!isUuid(id)) return null;
  return readAsStaff(
    `/api/topic-changes/${id}?${topicChangeSearchParams()}`,
    topicChangeSchema,
  );
}

/**
 * A topic's newest draft as its page will show it once published (the
 * live preview), or null when there is no such topic. Read afresh each
 * time, as the staff member: drafts are staff-only.
 */
export async function readTopicPreview(id: string): Promise<TopicPage | null> {
  if (!isRecordId(id)) return null;
  return readAsStaff(PREVIEW_PATHS.topic(id), TopicPage);
}
