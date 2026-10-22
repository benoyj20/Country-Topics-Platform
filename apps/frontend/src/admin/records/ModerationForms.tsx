"use client";

import {
  type CommentReportRow,
  type CommentStatusFacts,
  commentFieldOf,
  commentSaveBody,
  commentSearchParams,
  type CommentValues,
  editorComment,
  editorFeedback,
  editorReport,
  type FeedbackStatusFacts,
  feedbackFieldOf,
  feedbackSaveBody,
  feedbackSearchParams,
  type FeedbackValues,
  type ReportStatusFacts,
  reportFieldOf,
  reportSaveBody,
  reportSearchParams,
  type ReportValues,
  storedCommentSchema,
  storedFeedbackSchema,
  storedReportSchema,
} from "@countrytopics/contracts";
import {
  COMMENT_REPORT_REASON_LABELS,
  COMMENT_REPORT_STATUS_LABELS,
  COMMENT_REPORT_STATUSES,
  COMMENT_STATUS_LABELS,
  COMMENT_STATUSES,
  commentModerationProblem,
  type CommentStatus,
  FEEDBACK_KIND_LABELS,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_STATUSES,
  MODERATION_NOTE_MAX_LENGTH,
  MODERATION_REASONS,
} from "@countrytopics/domain";
import Link from "next/link";
import type { ReactNode } from "react";

import { formatDateTime } from "@/format";

import { CheckField } from "../components/Field";
import type { FieldTexts } from "../field-text";
import { personName } from "../record-name";
import { safeHref } from "../safe-href";
import { saveRecord } from "../write";
import { SelectInput, TextArea } from "./inputs";
import { type FormApi, RecordForm } from "./RecordForm";

// The moderation editors, as Payload's panel moderates (ADR 0010;
// apps/web/src/collections/Comments.ts, CommentReports.ts, Feedback.ts):
// what a member wrote is shown, never edited, and staff set only its
// status. The backend checks each change and does what follows from it:
// closing a hidden comment's reports, telling its author, erasing a
// removed comment's text, and auditing all of it.

const COMMENT_TEXTS: FieldTexts = {
  status: {
    label: "Status",
    description:
      "Hidden comments leave the topic page; their author is told why. Only admins can remove one, which erases its text for good: use it only when the law requires it.",
  },
  moderationReason: { label: "Reason", description: "Shown to the author." },
  moderationNote: {
    label: "Note for staff",
    description: "Never shown to members.",
  },
  locked: {
    label: "Lock this thread",
    description:
      "No new replies or votes in the thread; it stays readable and reportable.",
  },
};

const REASON_OPTIONS = MODERATION_REASONS.map((value) => ({
  value,
  label: COMMENT_REPORT_REASON_LABELS[value],
}));

/**
 * What the reader may set a comment's status to, from the status it has,
 * by the rules the backend checks (commentModerationProblem).
 */
function statusOptions(saved: CommentStatus, admin: boolean): CommentStatus[] {
  return COMMENT_STATUSES.filter(
    (status) =>
      status === saved ||
      commentModerationProblem({
        previous: { status: saved, reason: null, locked: false },
        // Any reason: only whether the status may change is asked here.
        next: { status, reason: MODERATION_REASONS[0], locked: false },
        admin,
        thread: true,
      }) === null,
  );
}

/** Whether a comment with `status` needs a reason, by the same rules. */
function needsReason(saved: CommentStatus, status: CommentStatus): boolean {
  return (
    commentModerationProblem({
      previous: { status: saved, reason: null, locked: false },
      next: { status, reason: null, locked: false },
      admin: true,
      thread: true,
    })?.field === "reason"
  );
}

/** Facts about a record: wide in the main column, narrow beside it. */
function Facts({
  rows,
  wide = true,
}: {
  rows: [string, ReactNode][];
  wide?: boolean;
}) {
  return (
    <dl className={wide ? "admin-details wide" : "admin-details"}>
      {rows.map(([term, value]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * What a member wrote, as staff read it: never a link, never edited. Null
 * when it could not be read, which is not the same as erased.
 */
function Written({ text, erased }: { text: string | null; erased: string }) {
  if (text === null) {
    return <p className="admin-muted">Its text could not be read.</p>;
  }
  return text ? (
    <blockquote className="admin-quote">{text}</blockquote>
  ) : (
    <p className="admin-muted">{erased}</p>
  );
}

export function CommentForm({
  id,
  values,
  status,
  topicSlug,
  reports,
  totalReports,
  admin,
  notice,
}: {
  id: string;
  values: CommentValues;
  status: CommentStatusFacts;
  /** The topic's public address, to see the comment where members do. */
  topicSlug: string | null;
  reports: CommentReportRow[];
  totalReports: number;
  /** Whether the reader is an admin, who may remove comments. */
  admin: boolean;
  notice?: string;
}) {
  return (
    <RecordForm
      id={id}
      values={values}
      status={status}
      noun="comment"
      collection="comments"
      canEdit
      readOnlyNotice=""
      notice={notice}
      texts={COMMENT_TEXTS}
      order={Object.keys(COMMENT_TEXTS)}
      saveBody={commentSaveBody}
      save={(saving, sent) =>
        saveRecord(
          {
            collection: "comments",
            id: saving,
            query: commentSearchParams(),
            body: commentSaveBody(sent),
            fieldOf: commentFieldOf,
            schema: storedCommentSchema,
          },
          editorComment,
        )
      }
      confirmSave={(sent, current) =>
        sent.status === "removed" && current?.savedStatus !== "removed"
          ? "Remove this comment? Its text is erased for good, and it cannot be shown again. Do this only when the law requires it."
          : null
      }
      side={(_, current) => (
        <CommentReports
          reports={reports}
          total={totalReports}
          comment={id}
          moderation={current}
          admin={admin}
        />
      )}
    >
      {(form, current) => (
        <CommentFields
          form={form}
          id={id}
          // As the last save left it, before the page is read again.
          facts={current ?? status}
          topicSlug={topicSlug}
          admin={admin}
        />
      )}
    </RecordForm>
  );
}

function CommentFields({
  form,
  id,
  facts,
  topicSlug,
  admin,
}: {
  form: FormApi<CommentValues>;
  id: string;
  facts: CommentStatusFacts;
  topicSlug: string | null;
  admin: boolean;
}) {
  const { values } = form;
  const thread = facts.parent === null;
  const options = statusOptions(facts.savedStatus, admin);
  const locked = form.field("locked");
  return (
    <>
      <section className="admin-card" aria-labelledby="comment-text">
        <h2 id="comment-text">The comment</h2>
        <Written
          text={facts.body}
          erased={
            facts.savedStatus === "deleted"
              ? "Its text was erased when its author deleted their account."
              : "Its text was erased when it was removed."
          }
        />
        <Facts
          rows={[
            [
              "Topic",
              facts.topic ? (
                <>
                  <Link href={`/admin/collections/topics/${facts.topic.id}`}>
                    {facts.topic.title || "Untitled topic"}
                  </Link>
                  {/* Only a visible comment is on the topic's page. */}
                  {topicSlug && facts.savedStatus === "visible" && (
                    <>
                      {" · "}
                      <a
                        href={`/topics/${encodeURIComponent(topicSlug)}#comment-${id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        See it on the site
                      </a>
                    </>
                  )}
                </>
              ) : (
                "None"
              ),
            ],
            [
              "In reply to",
              facts.parent ? (
                <Link href={`/admin/collections/comments/${facts.parent.id}`}>
                  {facts.parent.title === null
                    ? "A comment that could not be read"
                    : facts.parent.title || "A comment whose text was erased"}
                </Link>
              ) : (
                "Nothing: it starts a thread"
              ),
            ],
            ["Author", personName(facts.author, { admin, staff: false })],
            ["Score", String(facts.score)],
            ["Posted", formatDateTime(facts.createdAt)],
          ]}
        />
        <p className="admin-muted">Staff cannot change what a member wrote.</p>
      </section>
      <SelectInput
        form={form}
        name="status"
        options={options.map((value) => ({
          value,
          label: COMMENT_STATUS_LABELS[value],
        }))}
        required
      />
      {needsReason(facts.savedStatus, values.status) && (
        <SelectInput
          form={form}
          name="moderationReason"
          options={REASON_OPTIONS}
          placeholder="Choose a reason"
          required
        />
      )}
      <TextArea
        form={form}
        name="moderationNote"
        maxLength={MODERATION_NOTE_MAX_LENGTH}
      />
      {thread && (
        <CheckField
          {...locked}
          checked={values.locked}
          onChange={(checked) => form.set({ locked: checked })}
        />
      )}
    </>
  );
}

/** The comment's reports, open first, and who last moderated it. */
function CommentReports({
  reports,
  total,
  comment,
  moderation,
  admin,
}: {
  reports: CommentReportRow[];
  total: number;
  comment: string;
  moderation: CommentStatusFacts | null;
  admin: boolean;
}) {
  return (
    <>
      <section className="admin-card" aria-labelledby="comment-reports">
        <h2 id="comment-reports">Reports</h2>
        {reports.length === 0 ? (
          <p className="admin-muted">Nobody has reported it.</p>
        ) : (
          <ul className="admin-log">
            {reports.map((report) => (
              <li key={report.id}>
                <Link href={`/admin/collections/comment-reports/${report.id}`}>
                  {COMMENT_REPORT_REASON_LABELS[report.reason]}
                </Link>
                <span>
                  <span
                    className={
                      report.status === "open"
                        ? "admin-badge"
                        : "admin-badge good"
                    }
                  >
                    {COMMENT_REPORT_STATUS_LABELS[report.status]}
                  </span>{" "}
                  <span className="admin-muted">
                    {formatDateTime(report.createdAt)}
                  </span>
                </span>
                {report.note && <span>{report.note}</span>}
              </li>
            ))}
          </ul>
        )}
        {total > reports.length && (
          <p className="admin-muted">
            And {total - reports.length} more:{" "}
            <Link
              href={`/admin/collections/comment-reports?comment=${encodeURIComponent(comment)}`}
            >
              list them all
            </Link>
            .
          </p>
        )}
        <p className="admin-muted">
          Members send reports from topic pages. Hiding the comment marks its
          open reports acted on.
        </p>
      </section>
      {moderation?.moderatedAt && (
        <section className="admin-card" aria-labelledby="comment-moderated">
          <h2 id="comment-moderated">Last moderated</h2>
          <Facts
            wide={false}
            rows={[
              [
                "By",
                personName(moderation.moderatedBy, { admin, staff: true }),
              ],
              ["At", formatDateTime(moderation.moderatedAt)],
            ]}
          />
        </section>
      )}
    </>
  );
}

const STATUS_TEXTS: FieldTexts = {
  status: { label: "Status" },
};

export function ReportForm({
  id,
  values,
  status,
  admin,
  notice,
}: {
  id: string;
  values: ReportValues;
  status: ReportStatusFacts;
  admin: boolean;
  notice?: string;
}) {
  return (
    <RecordForm
      id={id}
      values={values}
      status={status}
      noun="report"
      collection="comment-reports"
      canEdit
      readOnlyNotice=""
      notice={notice}
      texts={{
        status: {
          label: "Status",
          description:
            "Dismiss a report that needs nothing done. To act on it, open the comment and hide it, which marks its reports acted on.",
        },
      }}
      order={["status"]}
      saveBody={reportSaveBody}
      save={(saving, sent) =>
        saveRecord(
          {
            collection: "comment-reports",
            id: saving,
            query: reportSearchParams(),
            body: reportSaveBody(sent),
            fieldOf: reportFieldOf,
            schema: storedReportSchema,
          },
          editorReport,
        )
      }
      details={(current) => ({
        rows: current.resolvedAt
          ? [
              [
                "Resolved by",
                personName(current.resolvedBy, { admin, staff: true }),
              ],
              ["Resolved", formatDateTime(current.resolvedAt)],
            ]
          : [],
      })}
    >
      {(form) => (
        <>
          <section className="admin-card" aria-labelledby="report-text">
            <h2 id="report-text">The report</h2>
            <Facts
              rows={[
                ["Reason", COMMENT_REPORT_REASON_LABELS[status.reason]],
                ["Note", status.note || "None"],
                [
                  "Reported by",
                  personName(status.reporter, { admin, staff: false }),
                ],
                ["Sent", formatDateTime(status.createdAt)],
              ]}
            />
          </section>
          <section className="admin-card" aria-labelledby="report-comment">
            <h2 id="report-comment">The comment</h2>
            {status.comment ? (
              <>
                <Written
                  text={status.comment.title}
                  erased="Its text was erased."
                />
                <p>
                  <Link
                    href={`/admin/collections/comments/${status.comment.id}`}
                  >
                    Open the comment to moderate it
                  </Link>
                </p>
              </>
            ) : (
              <p className="admin-muted">The comment is gone.</p>
            )}
          </section>
          <SelectInput
            form={form}
            name="status"
            options={COMMENT_REPORT_STATUSES.map((value) => ({
              value,
              label: COMMENT_REPORT_STATUS_LABELS[value],
            }))}
            required
          />
        </>
      )}
    </RecordForm>
  );
}

/** The page feedback was sent from: a link when it is one of this site's. */
function SitePage({ page }: { page: string | null }) {
  const href = page?.startsWith("/") ? safeHref(page) : undefined;
  if (!href) return <>{page ?? "None"}</>;
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {page}
    </a>
  );
}

export function FeedbackForm({
  id,
  values,
  status,
  admin,
  notice,
}: {
  id: string;
  values: FeedbackValues;
  status: FeedbackStatusFacts;
  admin: boolean;
  notice?: string;
}) {
  return (
    <RecordForm
      id={id}
      values={values}
      status={status}
      noun="feedback"
      collection="feedback"
      canEdit
      readOnlyNotice=""
      notice={notice}
      texts={STATUS_TEXTS}
      order={["status"]}
      saveBody={feedbackSaveBody}
      save={(saving, sent) =>
        saveRecord(
          {
            collection: "feedback",
            id: saving,
            query: feedbackSearchParams(),
            body: feedbackSaveBody(sent),
            fieldOf: feedbackFieldOf,
            schema: storedFeedbackSchema,
          },
          editorFeedback,
        )
      }
    >
      {(form) => (
        <>
          <section className="admin-card" aria-labelledby="feedback-text">
            <h2 id="feedback-text">What they sent</h2>
            <Written text={status.message} erased="No message." />
            <Facts
              rows={[
                ["Kind", FEEDBACK_KIND_LABELS[status.kind]],
                ["Page", <SitePage key="page" page={status.page} />],
                ["From", personName(status.author, { admin, staff: false })],
                ["Sent", formatDateTime(status.createdAt)],
              ]}
            />
          </section>
          <SelectInput
            form={form}
            name="status"
            options={FEEDBACK_STATUSES.map((value) => ({
              value,
              label: FEEDBACK_STATUS_LABELS[value],
            }))}
            required
          />
        </>
      )}
    </RecordForm>
  );
}
