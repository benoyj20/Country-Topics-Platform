import {
  COMMENT_REPORT_REASONS,
  COMMENT_REPORT_STATUSES,
  COMMENT_STATUSES,
  type CommentReportReason,
  type CommentReportStatus,
  type CommentStatus,
  FEEDBACK_KINDS,
  FEEDBACK_STATUSES,
  type FeedbackKind,
  type FeedbackStatus,
  MODERATION_REASONS,
  type ModerationReason,
} from "@countrytopics/domain";
import * as z from "zod";

import {
  personOf,
  recordOf,
  Related,
  type RelatedRecord,
} from "./admin-lists.ts";
import {
  type FieldTree,
  fieldOfTree,
  optionalText,
  type RecordDates,
  recordDates,
  recordSearchParams,
  storedText,
} from "./admin-records.ts";

// The admin's moderation (ADR 0014, phase 10; ADR 0010): a comment's
// status, the reason its author is told, a note for staff, and a thread's
// lock; a member's report, dismissed or acted on; and feedback, marked
// done. What members wrote is never changed here: the backend's hooks keep
// it read only, erase a removed comment's text, close its reports, and
// tell its author.

export type CommentValues = {
  status: CommentStatus;
  /** Empty while the comment is visible. */
  moderationReason: ModerationReason | "";
  moderationNote: string;
  locked: boolean;
};

/** What a member wrote, and the moderation so far, which staff do not edit. */
export type CommentStatusFacts = RecordDates & {
  body: string;
  topic: RelatedRecord | null;
  /** The thread a reply is in; null for a comment that starts one. */
  parent: RelatedRecord | null;
  author: RelatedRecord | null;
  score: number;
  /** The status as stored, which the form's may differ from. */
  savedStatus: CommentStatus;
  moderatedBy: RelatedRecord | null;
  moderatedAt: string | null;
};

export type EditorComment = {
  id: string;
  values: CommentValues;
  status: CommentStatusFacts;
};

const COMMENT_READ = [
  "body",
  "topic",
  "parent",
  "author",
  "score",
  "status",
  "moderationReason",
  "moderationNote",
  "locked",
  "moderatedBy",
  "moderatedAt",
  "createdAt",
  "updatedAt",
] as const;

/**
 * The query string of `GET /api/comments/<id>`, and of a save: related
 * records by their titles (a topic's title, a thread's text, an account's
 * address, which only admins may read).
 */
export function commentSearchParams(): URLSearchParams {
  const params = recordSearchParams(COMMENT_READ);
  params.set("populate[topics][title]", "true");
  params.set("populate[topics][slug]", "true");
  params.set("populate[comments][body]", "true");
  return params;
}

export const storedCommentSchema = z.looseObject({
  id: z.string(),
  body: storedText,
  topic: Related.nullish(),
  parent: Related.nullish(),
  author: Related.nullish(),
  score: z.number().nullish(),
  status: z.enum(COMMENT_STATUSES),
  moderationReason: z.enum(MODERATION_REASONS).nullish(),
  moderationNote: storedText,
  locked: z.boolean().nullish(),
  moderatedBy: Related.nullish(),
  moderatedAt: storedText,
  ...recordDates,
});
export type StoredComment = z.infer<typeof storedCommentSchema>;

export function editorComment(stored: StoredComment): EditorComment {
  return {
    id: stored.id,
    values: {
      status: stored.status,
      moderationReason: stored.moderationReason ?? "",
      moderationNote: stored.moderationNote ?? "",
      locked: stored.locked ?? false,
    },
    status: {
      body: stored.body ?? "",
      topic: stored.topic ? recordOf("topics", stored.topic) : null,
      parent: stored.parent ? recordOf("comments", stored.parent) : null,
      author: personOf(stored.author),
      score: stored.score ?? 0,
      savedStatus: stored.status,
      moderatedBy: personOf(stored.moderatedBy),
      moderatedAt: stored.moderatedAt ?? null,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
    },
  };
}

/** The topic's public address, when the populated topic names its slug. */
export function commentTopicSlug(stored: StoredComment): string | null {
  const topic = stored.topic;
  return typeof topic === "object" && topic && typeof topic.slug === "string"
    ? topic.slug
    : null;
}

/**
 * The JSON body of `PATCH /api/comments/<id>`: only the moderation. The
 * reason is cleared by the backend once a comment is visible again.
 */
export function commentSaveBody(
  values: CommentValues,
): Record<string, unknown> {
  return {
    status: values.status,
    moderationReason: values.moderationReason || null,
    moderationNote: optionalText(values.moderationNote),
    locked: values.locked,
  };
}

const COMMENT_FIELDS: FieldTree = {
  status: true,
  moderationReason: true,
  moderationNote: true,
  locked: true,
};

export function commentFieldOf(path: string): string | null {
  return fieldOfTree(COMMENT_FIELDS, path);
}

/** How many of a comment's reports its page lists. */
export const COMMENT_REPORTS_SHOWN = 50;

/** The query string of `GET /api/comment-reports` for one comment's reports, open first. */
export function commentReportsSearchParams(comment: string): URLSearchParams {
  return new URLSearchParams({
    "where[comment][equals]": comment,
    sort: "status,-createdAt",
    depth: "0",
    limit: String(COMMENT_REPORTS_SHOWN),
    "select[reason]": "true",
    "select[note]": "true",
    "select[status]": "true",
    "select[createdAt]": "true",
  });
}

const commentReportRow = z.looseObject({
  id: z.string(),
  reason: z.enum(COMMENT_REPORT_REASONS),
  note: storedText,
  status: z.enum(COMMENT_REPORT_STATUSES),
  createdAt: z.string(),
});
export type CommentReportRow = z.infer<typeof commentReportRow>;

export const commentReportsSchema = z.looseObject({
  docs: z.array(commentReportRow),
  totalDocs: z.number().int().nonnegative(),
});

export type ReportValues = { status: CommentReportStatus };

/** What the member sent, and who resolved it, which staff do not edit. */
export type ReportStatusFacts = RecordDates & {
  comment: RelatedRecord | null;
  reporter: RelatedRecord | null;
  reason: CommentReportReason;
  note: string;
  resolvedBy: RelatedRecord | null;
  resolvedAt: string | null;
};

export type EditorReport = {
  id: string;
  values: ReportValues;
  status: ReportStatusFacts;
};

const REPORT_READ = [
  "comment",
  "reporter",
  "reason",
  "note",
  "status",
  "resolvedBy",
  "resolvedAt",
  "createdAt",
  "updatedAt",
] as const;

/** The query string of `GET /api/comment-reports/<id>`, and of a save. */
export function reportSearchParams(): URLSearchParams {
  const params = recordSearchParams(REPORT_READ);
  params.set("populate[comments][body]", "true");
  return params;
}

export const storedReportSchema = z.looseObject({
  id: z.string(),
  comment: Related.nullish(),
  reporter: Related.nullish(),
  reason: z.enum(COMMENT_REPORT_REASONS),
  note: storedText,
  status: z.enum(COMMENT_REPORT_STATUSES),
  resolvedBy: Related.nullish(),
  resolvedAt: storedText,
  ...recordDates,
});
export type StoredReport = z.infer<typeof storedReportSchema>;

export function editorReport(stored: StoredReport): EditorReport {
  return {
    id: stored.id,
    values: { status: stored.status },
    status: {
      comment: stored.comment ? recordOf("comments", stored.comment) : null,
      reporter: personOf(stored.reporter),
      reason: stored.reason,
      note: stored.note ?? "",
      resolvedBy: personOf(stored.resolvedBy),
      resolvedAt: stored.resolvedAt ?? null,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
    },
  };
}

/** The JSON body of `PATCH /api/comment-reports/<id>`: its status only. */
export function reportSaveBody(values: ReportValues): Record<string, unknown> {
  return { status: values.status };
}

export function reportFieldOf(path: string): string | null {
  return fieldOfTree({ status: true }, path);
}

export type FeedbackValues = { status: FeedbackStatus };

/** What the member sent, which staff do not edit. */
export type FeedbackStatusFacts = RecordDates & {
  author: RelatedRecord | null;
  kind: FeedbackKind;
  message: string;
  page: string | null;
};

export type EditorFeedback = {
  id: string;
  values: FeedbackValues;
  status: FeedbackStatusFacts;
};

const FEEDBACK_READ = [
  "author",
  "kind",
  "message",
  "page",
  "status",
  "createdAt",
  "updatedAt",
] as const;

/** The query string of `GET /api/feedback/<id>`, and of a save. */
export function feedbackSearchParams(): URLSearchParams {
  return recordSearchParams(FEEDBACK_READ);
}

export const storedFeedbackSchema = z.looseObject({
  id: z.string(),
  author: Related.nullish(),
  kind: z.enum(FEEDBACK_KINDS),
  message: z.string(),
  page: storedText,
  status: z.enum(FEEDBACK_STATUSES),
  ...recordDates,
});
export type StoredFeedback = z.infer<typeof storedFeedbackSchema>;

export function editorFeedback(stored: StoredFeedback): EditorFeedback {
  return {
    id: stored.id,
    values: { status: stored.status },
    status: {
      author: personOf(stored.author),
      kind: stored.kind,
      message: stored.message,
      page: stored.page ?? null,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
    },
  };
}

/** The JSON body of `PATCH /api/feedback/<id>`: its status only. */
export function feedbackSaveBody(
  values: FeedbackValues,
): Record<string, unknown> {
  return { status: values.status };
}

export function feedbackFieldOf(path: string): string | null {
  return fieldOfTree({ status: true }, path);
}
