import "server-only";

import {
  isAdmin,
  type EditedCollection,
  type Editor,
} from "@/admin/records/editor";

import { readComment, readFeedback, readReport } from "./backend";
import { CommentForm, FeedbackForm, ReportForm } from "./ModerationForms";

// The moderation feature's record pages, for the generic record page
// (app/(admin)/admin/collections/[collection]/[id]): a record's page,
// by its id, and a new record's, where staff may make one.

/** The start of what a member wrote, for a page's title. */
function shortened(text: string, length = 60): string {
  // By characters, so an emoji is never cut in half.
  const characters = Array.from(text.replace(/\s+/g, " ").trim());
  return characters.length > length
    ? `${characters.slice(0, length - 1).join("")}…`
    : characters.join("");
}

export const EDITORS = {
  comments: {
    record: async (id, account, notice) => {
      const found = await readComment(id);
      return (
        found && {
          title: found.comment.status.body
            ? `Comment: ${shortened(found.comment.status.body)}`
            : "A comment whose text was erased",
          body: (
            <CommentForm
              id={found.comment.id}
              values={found.comment.values}
              status={found.comment.status}
              topicSlug={found.topicSlug}
              reports={found.reports.docs}
              totalReports={found.reports.totalDocs}
              admin={isAdmin(account)}
              notice={notice}
            />
          ),
        }
      );
    },
  },
  "comment-reports": {
    record: async (id, account, notice) => {
      const report = await readReport(id);
      return (
        report && {
          title: "A report on a comment",
          body: (
            <ReportForm
              id={report.id}
              values={report.values}
              status={report.status}
              admin={isAdmin(account)}
              notice={notice}
            />
          ),
        }
      );
    },
  },
  feedback: {
    record: async (id, account, notice) => {
      const feedback = await readFeedback(id);
      return (
        feedback && {
          title: `Feedback: ${shortened(feedback.status.message)}`,
          body: (
            <FeedbackForm
              id={feedback.id}
              values={feedback.values}
              status={feedback.status}
              admin={isAdmin(account)}
              notice={notice}
            />
          ),
        }
      );
    },
  },
} satisfies Partial<Record<EditedCollection, Editor>>;
