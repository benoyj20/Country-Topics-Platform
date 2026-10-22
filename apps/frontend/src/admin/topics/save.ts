import {
  savedTopicSchema,
  type StoredTopic,
  topicFieldOf,
  topicRestoreSearchParams,
  topicSaveBody,
  topicSaveSearchParams,
  type TopicValues,
} from "@countrytopics/contracts";

import { answerOf, deleteRecord, write, type Written } from "../write";

// The topic editor's writes (../write.ts): drafts, publishing, restoring a
// version as a draft, and deleting a topic never published.

/** Saves a draft of, or publishes, a topic: a new one when `id` is null. */
export async function saveTopic(
  id: string | null,
  values: TopicValues,
  publish: boolean,
): Promise<Written<StoredTopic>> {
  const query = topicSaveSearchParams(publish);
  const written = await write(
    id ? "PATCH" : "POST",
    id
      ? `/api/topics/${encodeURIComponent(id)}?${query}`
      : `/api/topics?${query}`,
    topicSaveBody(values, publish, { creating: id === null }),
    topicFieldOf,
  );
  const saved = answerOf(written, savedTopicSchema);
  return saved.ok ? { ok: true, result: saved.result.doc } : saved;
}

/** Saves a version as the topic's newest draft. */
export async function restoreAsDraft(version: string): Promise<Written<null>> {
  const written = await write(
    "POST",
    `/api/topics/versions/${encodeURIComponent(version)}?${topicRestoreSearchParams()}`,
    undefined,
    topicFieldOf,
  );
  return written.ok ? { ok: true, result: null } : written;
}

/** Deletes a topic that was never published. */
export function deleteTopic(id: string): Promise<Written<null>> {
  return deleteRecord("topics", id, topicFieldOf);
}
