import {
  COMMENT_REPORT_REASONS,
  type CommentReportReason,
} from "./comments.ts";

/**
 * F6 moderation (ADR 0010): moderators hide comments and lock threads,
 * and act on members' reports; admins can also remove a comment's text
 * when the law requires it. Pure rules shared by the admin panel and the
 * public API.
 */

export const COMMENT_STATUSES = [
  "visible",
  /** Taken out of public view by a moderator; the text is kept. */
  "hidden",
  /** Hidden, and its text erased, when the law requires it; admins only. */
  "removed",
] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];

/** Why a comment was hidden or removed: the reasons members report. */
export const MODERATION_REASONS = COMMENT_REPORT_REASONS;
export type ModerationReason = CommentReportReason;

export const COMMENT_REPORT_STATUSES = [
  "open",
  /** A moderator found nothing to act on. */
  "dismissed",
  /** The comment was hidden or removed. */
  "actioned",
] as const;
export type CommentReportStatus = (typeof COMMENT_REPORT_STATUSES)[number];

export const MODERATION_NOTE_MAX_LENGTH = 500;

export type CommentModeration = {
  status: CommentStatus;
  reason: ModerationReason | null;
  locked: boolean;
};

export type ModerationProblem = {
  field: "status" | "reason" | "locked";
  message: string;
};

/**
 * Why a moderator's change to a comment cannot be saved, and the field at
 * fault, or null when it can. `thread` is whether the comment starts a
 * thread (has no parent).
 */
export function commentModerationProblem({
  previous,
  next,
  admin,
  thread,
}: {
  previous: CommentModeration;
  next: CommentModeration;
  admin: boolean;
  thread: boolean;
}): ModerationProblem | null {
  if (previous.status === "removed" && next.status !== "removed") {
    return {
      field: "status",
      message: "A removed comment's text is gone, so it cannot be shown again.",
    };
  }
  if (next.status === "removed" && previous.status !== "removed" && !admin) {
    return {
      field: "status",
      message: "Only admins can remove a comment. Hide it instead.",
    };
  }
  if (next.status !== "visible" && !next.reason) {
    return { field: "reason", message: "Choose why the comment is hidden." };
  }
  if (next.locked && !thread) {
    return {
      field: "locked",
      message: "Only a comment that starts a thread can be locked.",
    };
  }
  return null;
}

export const NOTIFICATION_KINDS = [
  /** Someone replied in a thread the recipient started. */
  "reply",
  /** A moderator hid or removed the recipient's comment. */
  "comment-hidden",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
