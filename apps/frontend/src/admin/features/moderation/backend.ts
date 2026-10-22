import "server-only";

import {
  commentReportsSchema,
  commentReportsSearchParams,
  commentSearchParams,
  commentTopicSlug,
  editorComment,
  editorFeedback,
  editorReport,
  feedbackSearchParams,
  reportSearchParams,
  storedCommentSchema,
  storedFeedbackSchema,
  storedReportSchema,
} from "@countrytopics/contracts";

import { readAsStaff } from "@/admin/backend";
import { isUuid } from "@/admin/list-state";
import { readRecord } from "@/admin/records/backend";
import { BackendError } from "@/backend/request";

// The moderation feature's reads for its editors, from Payload's REST API
// as the staff member, with the query a save is answered with.

/** A comment, with its topic's public address and its reports. */
export async function readComment(id: string) {
  if (!isUuid(id)) return null;
  const path = `/api/comment-reports?${commentReportsSearchParams(id)}`;
  const [stored, reports] = await Promise.all([
    readRecord("comments", id, commentSearchParams(), storedCommentSchema),
    readAsStaff(path, commentReportsSchema),
  ]);
  if (!stored) return null;
  if (!reports) throw new BackendError(path, 404);
  return {
    comment: editorComment(stored),
    topicSlug: commentTopicSlug(stored),
    reports,
  };
}

export async function readReport(id: string) {
  const stored = await readRecord(
    "comment-reports",
    id,
    reportSearchParams(),
    storedReportSchema,
  );
  return stored && editorReport(stored);
}

export async function readFeedback(id: string) {
  const stored = await readRecord(
    "feedback",
    id,
    feedbackSearchParams(),
    storedFeedbackSchema,
  );
  return stored && editorFeedback(stored);
}
