import {
  payloadRefusal,
  type Refusal,
  savedTopicSchema,
  type StoredTopic,
  topicFieldOf,
  topicRestoreSearchParams,
  topicSaveBody,
  topicSaveSearchParams,
  type TopicValues,
} from "@countrytopics/contracts";

// The topic editor's writes, from the browser through this site's /api
// to Payload's REST API, with the staff member's cookie. The backend's
// hooks decide what may be saved; a refusal comes back with its messages.

export type Written<T> =
  { ok: true; result: T } | { ok: false; refusal: Refusal };

const UNREACHABLE: Refusal = {
  fields: {},
  general: [
    "The backend could not be reached, so this may not have been saved. Reload the page to see what was.",
  ],
};

async function write(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<{ status: number; answer: unknown } | null> {
  try {
    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      answer: await response.json().catch(() => null),
    };
  } catch {
    return null;
  }
}

function refused(status: number, answer: unknown): Written<never> {
  return { ok: false, refusal: payloadRefusal(status, answer, topicFieldOf) };
}

/** Saves a draft of, or publishes, a topic: a new one when `id` is null. */
export async function saveTopic(
  id: string | null,
  values: TopicValues,
  publish: boolean,
): Promise<Written<StoredTopic>> {
  const query = topicSaveSearchParams(publish);
  const sent = await write(
    id ? "PATCH" : "POST",
    id
      ? `/api/topics/${encodeURIComponent(id)}?${query}`
      : `/api/topics?${query}`,
    topicSaveBody(values, publish, { creating: id === null }),
  );
  if (!sent) return { ok: false, refusal: UNREACHABLE };
  if (sent.status < 200 || sent.status > 299) {
    return refused(sent.status, sent.answer);
  }
  const saved = savedTopicSchema.safeParse(sent.answer);
  if (!saved.success) {
    return {
      ok: false,
      refusal: {
        fields: {},
        general: [
          "The backend saved the topic but did not send it back. Reload the page before saving again.",
        ],
      },
    };
  }
  return { ok: true, result: saved.data.doc };
}

/** Saves a version as the topic's newest draft. */
export async function restoreAsDraft(version: string): Promise<Written<null>> {
  const sent = await write(
    "POST",
    `/api/topics/versions/${encodeURIComponent(version)}?${topicRestoreSearchParams()}`,
  );
  if (!sent) return { ok: false, refusal: UNREACHABLE };
  if (sent.status < 200 || sent.status > 299) {
    return refused(sent.status, sent.answer);
  }
  return { ok: true, result: null };
}

/** Deletes a topic that was never published. */
export async function deleteTopic(id: string): Promise<Written<null>> {
  const sent = await write("DELETE", `/api/topics/${encodeURIComponent(id)}`);
  if (!sent) return { ok: false, refusal: UNREACHABLE };
  if (sent.status < 200 || sent.status > 299) {
    return refused(sent.status, sent.answer);
  }
  return { ok: true, result: null };
}
