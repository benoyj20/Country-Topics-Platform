import type { TopicChangeKind } from "@countrytopics/domain";
import type { PayloadRequest } from "payload";

// What the workflow (workflow.ts) leaves for the change log
// (change-log.ts) on one request.

export type PendingChange = { kind: TopicChangeKind; note: string };
const PENDING_CHANGES = "topicChanges";
export const NEW_TOPIC = "new";
/** Set by guardLiveVersion when the save is an autosave. */
export const AUTOSAVE = "topicAutosave";

/**
 * Change log entries waiting for afterChange, keyed by topic: a bulk publish
 * saves several topics at once on one request. Always reached through
 * req.context, because nested local API calls replace the context object
 * (copying its keys).
 */
export function pendingChanges(
  req: PayloadRequest,
): Map<string, PendingChange> {
  const existing: unknown = req.context[PENDING_CHANGES];
  if (existing instanceof Map) return existing;
  const created = new Map<string, PendingChange>();
  req.context[PENDING_CHANGES] = created;
  return created;
}
