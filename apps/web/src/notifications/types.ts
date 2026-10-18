import type { CommentStatus, ModerationReason } from "@countrytopics/domain";

// What /api/v1/account/notifications returns (ADR 0010). Personal, so
// never cached. What a notification shows is read when it is listed.

type NotificationBase = {
  id: string;
  createdAt: string;
  read: boolean;
  /** Null once the topic is no longer public. */
  topic: { slug: string; title: string } | null;
  /** The comment it is about, for a link to `#comment-<id>`. */
  commentId: string;
};

export type ReplyNotification = NotificationBase & {
  kind: "reply";
  /** The replier's display name; null once their account is deleted. */
  author: string | null;
  /** The start of the reply. */
  excerpt: string;
};

export type ModerationNotification = NotificationBase & {
  kind: "comment-hidden";
  /** The comment's status now: shown again, still hidden, or removed. */
  status: CommentStatus;
  /** Why it was hidden; null once it is shown again. */
  reason: ModerationReason | null;
  /** The start of the member's own comment; null once removed. */
  excerpt: string | null;
};

export type MemberNotification = ReplyNotification | ModerationNotification;

export type NotificationPage = {
  notifications: MemberNotification[];
  nextCursor: string | null;
};
