import {
  changeNoteRequired,
  type TopicSave,
  topicChangeKind,
  topicStateAfterSave,
} from "@countrytopics/domain";
import {
  type CollectionBeforeChangeHook,
  type CollectionBeforeOperationHook,
  ValidationError,
} from "payload";

import { relationId } from "@/audit";
import { refuse } from "@/collections/refuse";
import { richTextHasText } from "@/editor";

import { AUTOSAVE, NEW_TOPIC, pendingChanges } from "./pending";
import { evidenceErrors } from "./publish-checks";

// How a topic is saved and published: the operations refused, the system
// fields kept, and the checks and change note a publish needs.

/**
 * Blocks, before anything is written, the operations that would take a
 * published topic offline or replace it without a change log entry:
 * - Unpublishing (one topic or in bulk). A published topic is archived instead.
 * - An update that neither publishes nor says "draft". Payload writes the
 *   live version for any update without `draft`, which would skip the change
 *   note, the change log, and the public page purge; it becomes a draft save.
 * - Restoring a version over a published topic. It may be restored only as a
 *   draft, and then published with a change note.
 * A duplicate becomes a fresh draft; applyWorkflow gives it no publication
 * history. An autosave is marked for recordChange.
 */
export const guardLiveVersion: CollectionBeforeOperationHook = async ({
  args,
  operation,
  req,
}) => {
  const draft = "draft" in args && args.draft === true;
  if ("autosave" in args && args.autosave === true)
    req.context[AUTOSAVE] = true;
  const data: unknown = "data" in args ? args.data : undefined;
  const status =
    data && typeof data === "object" && "_status" in data
      ? data._status
      : undefined;
  if (
    (operation === "update" || operation === "updateByID") &&
    !draft &&
    status === "draft"
  ) {
    refuse(
      "topics",
      req,
      "_status",
      "Status",
      "Topics are not unpublished. To take one out of lists, tick Archived, add a change note, and publish.",
    );
  }
  if (
    (operation === "update" || operation === "updateByID") &&
    !draft &&
    status !== "published"
  ) {
    return { ...args, draft: true };
  }
  if (operation === "restoreVersion" && !draft && "id" in args && args.id) {
    const version = await req.payload.findVersionByID({
      collection: "topics",
      id: String(args.id),
      depth: 0,
      overrideAccess: true,
      req,
    });
    const topicId = relationId(version?.parent);
    const topic = topicId
      ? await req.payload.findByID({
          collection: "topics",
          id: topicId,
          depth: 0,
          select: { firstPublishedAt: true },
          disableErrors: true,
          overrideAccess: true,
          req,
        })
      : null;
    if (topic?.firstPublishedAt) {
      refuse(
        "topics",
        req,
        "changeNote",
        "Change note",
        "This topic is published, so a version can only be restored as a draft. Then publish it with a change note.",
      );
    }
  }
  if (
    operation === "create" &&
    "duplicateFromID" in args &&
    args.duplicateFromID !== undefined &&
    args.duplicateFromID !== null
  ) {
    const copied = data && typeof data === "object" ? data : {};
    return {
      ...args,
      draft: true,
      data: { ...copied, readyForReview: false, archived: false },
    };
  }
  return args;
};

/**
 * Applies the workflow on every save: records who edited, keeps the state, and
 * on publish checks the content and change note and prepares the change log
 * entry.
 */
export const applyWorkflow: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  const stored = operation === "update" ? originalDoc : undefined;
  // The system fields come from the stored document and this hook only.
  data.lastEditedBy = req.user?.id ?? null;
  data.state = stored?.state ?? "draft";
  data.firstPublishedAt = stored?.firstPublishedAt ?? null;
  data.lastPublishedAt = stored?.lastPublishedAt ?? null;
  // A restore reaching this point is a draft restore (guardLiveVersion refuses
  // the others), though its data still carries the old version's status.
  if (req.context.isRestoringVersion) return data;

  const key = stored?.id ? String(stored.id) : NEW_TOPIC;
  pendingChanges(req).delete(key);
  const publishing = data._status === "published";
  const previouslyPublished = Boolean(stored?.firstPublishedAt);

  // The live version, not the latest draft, says whether visitors currently
  // see the topic as archived.
  const live =
    publishing && previouslyPublished && stored?.id
      ? await req.payload.findByID({
          collection: "topics",
          id: stored.id,
          draft: false,
          depth: 0,
          select: { state: true },
          overrideAccess: true,
          req,
        })
      : null;
  const save: TopicSave = {
    publishing,
    previouslyPublished,
    previouslyArchived: live?.state === "archived",
    archived: Boolean(data.archived ?? stored?.archived),
    readyForReview: Boolean(data.readyForReview ?? stored?.readyForReview),
  };

  const note =
    typeof data.changeNote === "string" ? data.changeNote.trim() : "";
  if (changeNoteRequired(save) && !note) {
    refuse(
      "topics",
      req,
      "changeNote",
      "Change note",
      "Say what changed and why. The note is shown in the topic's public change log.",
    );
  }
  if (publishing && !richTextHasText(data.body ?? stored?.body)) {
    refuse("topics", req, "body", "Body", "Write the topic before publishing.");
  }

  const kind = topicChangeKind(save);
  // Archiving only takes a topic out of lists, so it is never blocked by a
  // reference that was edited since the topic was published.
  if (publishing && kind !== "archived") {
    const errors = await evidenceErrors(req, {
      people: data.people ?? stored?.people,
      body: data.body ?? stored?.body,
      evidence: data.evidence ?? stored?.evidence,
      references: data.references ?? stored?.references,
    });
    if (errors.length > 0) {
      throw new ValidationError({ collection: "topics", errors, req });
    }
  }

  const state = topicStateAfterSave(save);
  if (state) data.state = state;
  if (kind) {
    const now = new Date().toISOString();
    data.firstPublishedAt = stored?.firstPublishedAt ?? now;
    data.lastPublishedAt = now;
    data.readyForReview = false;
    // Only a first publish can have no note (changeNoteRequired).
    pendingChanges(req).set(key, {
      kind,
      note: note || (kind === "archived" ? "Archived." : "First published."),
    });
  }
  return data;
};
