import {
  savedTopicSchema,
  type StoredTopic,
  topicFieldOf,
  topicSaveBody,
  topicSaveSearchParams,
  type TopicValues,
} from "@countrytopics/contracts";

import { answerOf, deleteRecord, write, type Written } from "@/admin/write";

// The topic editor's writes (../write.ts): drafts, autosaves, publishing,
// and deleting a topic never published. Restoring a version is in
// ../versions/RestoreVersion.tsx.

/**
 * Saves a draft of, or publishes, a topic: a new one when `id` is null.
 * An autosave updates the newest draft it made, rather than keeping a
 * version for every few seconds of typing.
 */
export async function saveTopic(
  id: string | null,
  values: TopicValues,
  publish: boolean,
  { autosave = false }: { autosave?: boolean } = {},
): Promise<Written<StoredTopic>> {
  const query = topicSaveSearchParams(publish, { autosave });
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

/** Deletes a topic that was never published. */
export function deleteTopic(id: string): Promise<Written<null>> {
  return deleteRecord("topics", id, topicFieldOf);
}
