import {
  COMMENT_BODY_MAX_LENGTH,
  COMMENT_REPORT_NOTE_MAX_LENGTH,
  COMMENT_REPORT_REASONS,
  COMMENT_STATUSES,
  COMMENT_VOTE_VALUES,
  DISPLAY_NAME_MAX_LENGTH,
  FEEDBACK_KINDS,
  FEEDBACK_MESSAGE_MAX_LENGTH,
  FEEDBACK_PAGE_MAX_LENGTH,
  MODERATION_REASONS,
  ROLES,
} from "@countrytopics/domain";
import * as z from "zod";

// The member API under /api/v1 (ADRs 0009 to 0011): what the comment,
// notification, account, and feedback routes accept and answer. Public
// answers carry no account ids or email addresses: an author is only their
// display name.
//
// Requests are strict: the backend refuses a field it does not know, so a
// mistyped one is never silently ignored. Answers drop unknown fields when
// parsed, as the page data's do (pages.ts).

// Requests. Text is bounded before normalising, which can only shorten it;
// the rules in packages/domain then give the exact limit and message.

export const NewComment = z
  .object({
    body: z.string().max(COMMENT_BODY_MAX_LENGTH * 2),
    parentId: z.uuid().nullable().optional(),
  })
  .strict();
export type NewComment = z.infer<typeof NewComment>;

export const CommentVote = z
  .object({ value: z.literal(COMMENT_VOTE_VALUES) })
  .strict();
export type CommentVote = z.infer<typeof CommentVote>;

export const CommentReport = z
  .object({
    reason: z.enum(COMMENT_REPORT_REASONS),
    note: z
      .string()
      .max(COMMENT_REPORT_NOTE_MAX_LENGTH * 2)
      .optional(),
  })
  .strict();
export type CommentReport = z.infer<typeof CommentReport>;

export const DisplayNameChange = z
  .object({ displayName: z.string().max(DISPLAY_NAME_MAX_LENGTH * 4) })
  .strict();
export type DisplayNameChange = z.infer<typeof DisplayNameChange>;

export const NewFeedback = z
  .object({
    kind: z.enum(FEEDBACK_KINDS),
    message: z.string().max(FEEDBACK_MESSAGE_MAX_LENGTH * 2),
    page: z
      .string()
      .max(FEEDBACK_PAGE_MAX_LENGTH * 4)
      .nullable()
      .optional(),
  })
  .strict();
export type NewFeedback = z.infer<typeof NewFeedback>;

/** Email addresses are at most this long (RFC 5321). */
const EMAIL_MAX_LENGTH = 320;

/** The member confirms by typing their email address. */
export const AccountDeletion = z
  .object({ email: z.string().max(EMAIL_MAX_LENGTH) })
  .strict();
export type AccountDeletion = z.infer<typeof AccountDeletion>;

/** Notifications one request may mark as read. */
export const MARK_READ_MAX = 100;

export const MarkNotificationsRead = z
  .object({ ids: z.array(z.uuid()).max(MARK_READ_MAX) })
  .strict();
export type MarkNotificationsRead = z.infer<typeof MarkNotificationsRead>;

// Comments.

export const PublicComment = z.object({
  id: z.string(),
  /** The author's display name; null once their account is deleted. */
  author: z.string().nullable(),
  body: z.string(),
  /** Up votes minus down votes. */
  score: z.number(),
  createdAt: z.string(),
  /**
   * A thread a moderator hid, or whose author deleted their account, listed
   * only for its visible replies: its author and text are empty and its
   * score 0 (ADR 0010).
   */
  hidden: z.boolean(),
  /** Hidden because its author deleted their account (ADR 0011). */
  deleted: z.boolean(),
});
export type PublicComment = z.infer<typeof PublicComment>;

export const CommentThread = PublicComment.extend({
  /** A moderator locked it: no new replies or votes. */
  locked: z.boolean(),
  /** Replies in all. */
  replyCount: z.number(),
  /** The first replies, oldest first. */
  replies: z.array(PublicComment),
  /** For the rest, from /api/v1/comments/[id]/replies; null when all are shown. */
  moreReplies: z.string().nullable(),
});
export type CommentThread = z.infer<typeof CommentThread>;

export const CommentPage = z.object({
  /** Whether new comments and votes are taken (not on archived topics). */
  open: z.boolean(),
  /** Comments on the topic, replies included. */
  total: z.number(),
  threads: z.array(CommentThread),
  nextCursor: z.string().nullable(),
});
export type CommentPage = z.infer<typeof CommentPage>;

/** The thread holding one comment, for a link to it (ADR 0010). */
export const LinkedThread = z.object({
  open: z.boolean(),
  thread: CommentThread,
});
export type LinkedThread = z.infer<typeof LinkedThread>;

export const ReplyPage = z.object({
  replies: z.array(PublicComment),
  nextCursor: z.string().nullable(),
});
export type ReplyPage = z.infer<typeof ReplyPage>;

export const PostedComment = z.object({ comment: PublicComment });
export type PostedComment = z.infer<typeof PostedComment>;

export const CountedVote = z.object({
  score: z.number(),
  value: z.literal(COMMENT_VOTE_VALUES),
});
export type CountedVote = z.infer<typeof CountedVote>;

/** The signed-in person's part in the comments they asked about. */
export const CommentViewer = z.object({
  /** Null for visitors. */
  account: z
    .object({
      displayName: z.string().nullable(),
      /** A moderator or admin, who can open a comment in the admin. */
      staff: z.boolean(),
    })
    .nullable(),
  /** Their votes, by comment id. */
  votes: z.record(z.string(), z.union([z.literal(-1), z.literal(1)])),
  /** Comments they reported. */
  reported: z.array(z.string()),
  /** Comments they wrote. */
  mine: z.array(z.string()),
});
export type CommentViewer = z.infer<typeof CommentViewer>;

// Notifications (ADR 0010). Personal, so never cached. What a notification
// shows is read when it is listed.

export const NOTIFICATIONS_PAGE_SIZE = 20;
/** Unread counts stop here; the header shows "99+". */
export const UNREAD_COUNT_MAX = 100;

const notificationBase = {
  id: z.string(),
  createdAt: z.string(),
  read: z.boolean(),
  /** Null once the topic is no longer public. */
  topic: z.object({ slug: z.string(), title: z.string() }).nullable(),
  /** The comment it is about, for a link to `#comment-<id>`. */
  commentId: z.string(),
};

export const ReplyNotification = z.object({
  ...notificationBase,
  kind: z.literal("reply"),
  /** The replier's display name; null once their account is deleted. */
  author: z.string().nullable(),
  /** The start of the reply. */
  excerpt: z.string(),
});
export type ReplyNotification = z.infer<typeof ReplyNotification>;

export const ModerationNotification = z.object({
  ...notificationBase,
  kind: z.literal("comment-hidden"),
  /** The comment's status now: shown again, still hidden, or removed. */
  status: z.enum(COMMENT_STATUSES),
  /** Why it was hidden; null once it is shown again. */
  reason: z.enum(MODERATION_REASONS).nullable(),
  /** The start of the member's own comment; null once removed. */
  excerpt: z.string().nullable(),
});
export type ModerationNotification = z.infer<typeof ModerationNotification>;

export const MemberNotification = z.discriminatedUnion("kind", [
  ReplyNotification,
  ModerationNotification,
]);
export type MemberNotification = z.infer<typeof MemberNotification>;

export const NotificationPage = z.object({
  notifications: z.array(MemberNotification),
  nextCursor: z.string().nullable(),
});
export type NotificationPage = z.infer<typeof NotificationPage>;

export const UnreadNotifications = z.object({ unread: z.number() });
export type UnreadNotifications = z.infer<typeof UnreadNotifications>;

// The account (ADR 0011).

/** How recently a member must have signed in to delete their account. */
export const RECENT_SIGN_IN_MS = 10 * 60 * 1_000;

/** The signed-in person, for the pages the frontend renders for them. */
export const Account = z.object({
  email: z.string(),
  name: z.string().nullable(),
  /** Shown publicly with their comments; null until they choose one. */
  displayName: z.string().nullable(),
  role: z.enum(ROLES),
  staff: z.boolean(),
  twoFactorEnabled: z.boolean(),
  /** This session passed the authenticator check recently enough for the admin. */
  adminVerified: z.boolean(),
});
export type Account = z.infer<typeof Account>;

/** GET /api/v1/account: the signed-in person, or null for visitors. */
export const AccountAnswer = z.object({ account: Account.nullable() });
export type AccountAnswer = z.infer<typeof AccountAnswer>;

export const SavedDisplayName = z.object({ displayName: z.string() });
export type SavedDisplayName = z.infer<typeof SavedDisplayName>;

/** An /api/v1 refusal. */
export const ApiError = z.object({
  /** A sentence to show the person. */
  error: z.string(),
  /** What exactly was wrong with the request, if it was the request. */
  problems: z.array(z.string()),
  /** For answers a client acts on, such as "display-name-required". */
  code: z.string().optional(),
});
export type ApiError = z.infer<typeof ApiError>;
