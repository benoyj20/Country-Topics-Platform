import type { CommentVoteValue } from "@countrytopics/domain";

// What /api/v1 returns about comments (ADR 0009). Public answers carry no
// account ids or email addresses: an author is only their display name.

export type PublicComment = {
  id: string;
  /** The author's display name; null once their account is deleted. */
  author: string | null;
  body: string;
  /** Up votes minus down votes. */
  score: number;
  createdAt: string;
  /**
   * A thread a moderator hid, or whose author deleted their account, listed
   * only for its visible replies: its author and text are empty and its
   * score 0 (ADR 0010).
   */
  hidden: boolean;
  /** Hidden because its author deleted their account (ADR 0011). */
  deleted: boolean;
};

export type CommentThread = PublicComment & {
  /** A moderator locked it: no new replies or votes. */
  locked: boolean;
  /** Replies in all. */
  replyCount: number;
  /** The first replies, oldest first. */
  replies: PublicComment[];
  /** For the rest, from /api/v1/comments/[id]/replies; null when all are shown. */
  moreReplies: string | null;
};

export type CommentPage = {
  /** Whether new comments and votes are taken (not on archived topics). */
  open: boolean;
  /** Comments on the topic, replies included. */
  total: number;
  threads: CommentThread[];
  nextCursor: string | null;
};

export type ReplyPage = {
  replies: PublicComment[];
  nextCursor: string | null;
};

/** The signed-in person's part in the comments they asked about. */
export type CommentViewer = {
  /** Null for visitors. */
  account: {
    displayName: string | null;
    /** A moderator or admin, who can open a comment in the admin panel. */
    staff: boolean;
  } | null;
  /** Their votes, by comment id. */
  votes: Record<string, Exclude<CommentVoteValue, 0>>;
  /** Comments they reported. */
  reported: string[];
  /** Comments they wrote. */
  mine: string[];
};
