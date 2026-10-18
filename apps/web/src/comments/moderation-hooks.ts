import {
  COMMENT_STATUSES,
  type CommentModeration,
  commentModerationProblem,
  MODERATION_REASONS,
} from "@countrytopics/domain";
import type {
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
} from "payload";

import { isVerifiedAdmin } from "@/access";
import { changedFields, recordAudit, relationId } from "@/audit";
import { refuse } from "@/collections/refuse";
import { queueSearchIndex } from "@/content-jobs";

// What happens when staff moderate a comment in the admin panel (ADR 0010).
// Members' comments are written through /api/v1; this is the only way a
// comment changes after it is posted.

const FIELD_LABELS = {
  status: "Status",
  reason: "Reason",
  locked: "Locked",
} as const;
const FIELD_PATHS = {
  status: "status",
  reason: "moderationReason",
  locked: "locked",
} as const;

function oneOf<T extends string>(list: readonly T[], value: unknown): T | null {
  return list.find((item) => item === value) ?? null;
}

function moderationOf(doc: Record<string, unknown>): CommentModeration {
  return {
    status: oneOf(COMMENT_STATUSES, doc.status) ?? "visible",
    reason: oneOf(MODERATION_REASONS, doc.moderationReason),
    locked: doc.locked === true,
  };
}

/**
 * Checks the change, records who moderated and when, and erases the text
 * of a comment being removed. Runs after Payload has dropped the fields
 * staff may not change, so the values set here are the ones saved.
 */
export const moderateComment: CollectionBeforeChangeHook = ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (operation !== "update" || !originalDoc) return data;
  const previous = moderationOf(originalDoc);
  const next = moderationOf({ ...originalDoc, ...data });
  const problem = commentModerationProblem({
    previous,
    next,
    admin: isVerifiedAdmin(req.user),
    thread: relationId(originalDoc.parent) === null,
  });
  if (problem) {
    refuse(
      "comments",
      req,
      FIELD_PATHS[problem.field],
      FIELD_LABELS[problem.field],
      problem.message,
    );
  }
  const changed = { ...data };
  // Votes change the score in their own transactions; writing back the
  // value read when this save began would undo a vote made meanwhile.
  // Payload leaves out fields that are absent.
  delete changed.score;
  if (next.status === "visible") changed.moderationReason = null;
  if (next.status !== previous.status) {
    changed.moderatedBy = req.user?.id ?? null;
    changed.moderatedAt = new Date().toISOString();
  }
  // A legal removal keeps no copy: comments have no versions, and the
  // audit entry below records the reason, not the text.
  if (next.status === "removed") changed.body = "";
  return changed;
};

const STATUS_ACTIONS = {
  visible: "comment.shown",
  hidden: "comment.hidden",
  removed: "comment.removed",
} as const;

/**
 * Audits the change. A comment taken out of view also closes its open
 * reports, tells its author, and re-counts its topic for search.
 */
export const afterModeration: CollectionAfterChangeHook = async ({
  doc,
  operation,
  previousDoc,
  req,
}) => {
  if (operation !== "update") return doc;
  const previous = moderationOf(previousDoc);
  const next = moderationOf(doc);
  const commentId = String(doc.id);
  const topicId = relationId(doc.topic);
  const audit = (action: string, details: Record<string, unknown>) =>
    recordAudit(req, {
      action,
      targetCollection: "comments",
      targetId: commentId,
      details: { topic: topicId, ...details },
    });

  if (next.status !== previous.status) {
    await audit(STATUS_ACTIONS[next.status], {
      reason: next.reason,
      note: doc.moderationNote ?? null,
    });
    if (next.status !== "visible") {
      await req.payload.update({
        collection: "comment-reports",
        where: {
          and: [
            { comment: { equals: commentId } },
            { status: { equals: "open" } },
          ],
        },
        data: { status: "actioned" },
        overrideAccess: true,
        req,
      });
      await notifyAuthor(req, doc);
    }
    if (topicId) {
      await queueSearchIndex(req, [topicId], {
        table: "comments",
        id: commentId,
        updatedAt: doc.updatedAt,
      });
    }
  } else {
    const changes = changedFields(previousDoc, doc, [
      "moderationReason",
      "moderationNote",
    ]);
    if (Object.keys(changes).length > 0) {
      await audit("comment.moderation_updated", { changes });
    }
  }
  if (next.locked !== previous.locked) {
    await audit(next.locked ? "comment.locked" : "comment.unlocked", {});
  }
  return doc;
};

/** Once per comment: hiding it again after showing it adds nothing. */
async function notifyAuthor(
  req: Parameters<CollectionAfterChangeHook>[0]["req"],
  doc: Record<string, unknown>,
): Promise<void> {
  const authorId = relationId(doc.author);
  if (!authorId) return;
  const { totalDocs } = await req.payload.count({
    collection: "notifications",
    where: {
      and: [
        { recipient: { equals: authorId } },
        { comment: { equals: doc.id } },
        { kind: { equals: "comment-hidden" } },
      ],
    },
    overrideAccess: true,
    req,
  });
  if (totalDocs > 0) return;
  await req.payload.create({
    collection: "notifications",
    data: {
      recipient: authorId,
      comment: String(doc.id),
      kind: "comment-hidden",
    },
    overrideAccess: true,
    req,
  });
}
