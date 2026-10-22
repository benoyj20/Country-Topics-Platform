import "server-only";

import {
  type Account,
  type AdminCollection,
  type AdminCondition,
  adminListSearchParams,
  type AdminPage,
  adminPageSchema,
  adminRowSchema,
} from "@countrytopics/contracts";

import { BackendError } from "@/backend/request";

import { readAsStaff } from "./backend";

// The dashboard's reads (ADR 0014, phase 11): what waits for staff and
// what they worked on lately, each a short list read as the lists are, so
// the backend's access rules decide what each staff member sees.

/** How many records each of the dashboard's lists shows. */
export const DASHBOARD_ROWS = 5;

async function newest(
  collection: AdminCollection,
  conditions: AdminCondition[],
  sort: string,
): Promise<AdminPage> {
  const path = `/api/${collection}?${adminListSearchParams(collection, {
    conditions,
    sort,
    page: 1,
    limit: DASHBOARD_ROWS,
  })}`;
  const page = await readAsStaff(
    path,
    adminPageSchema(adminRowSchema(collection)),
  );
  if (!page) throw new BackendError(path, 404);
  return page;
}

export type Dashboard = {
  /** Drafts marked ready for review, waiting for an admin to publish them. */
  review: AdminPage;
  /** Reports on comments nobody has dealt with yet. */
  reports: AdminPage;
  /** Feedback nobody has marked done. */
  feedback: AdminPage;
  /** Topics the reader edited last. */
  mine: AdminPage;
  /** The newest entries in the topics' change logs. */
  changes: AdminPage;
};

export async function readDashboard(account: Account): Promise<Dashboard> {
  const [review, reports, feedback, mine, changes] = await Promise.all([
    newest("topics", [{ field: "readyForReview", equals: true }], "-updatedAt"),
    newest(
      "comment-reports",
      [{ field: "status", equals: "open" }],
      "-createdAt",
    ),
    newest("feedback", [{ field: "status", equals: "new" }], "-createdAt"),
    newest(
      "topics",
      [{ field: "lastEditedBy", equals: account.id }],
      "-updatedAt",
    ),
    newest("topic-changes", [], "-createdAt"),
  ]);
  return { review, reports, feedback, mine, changes };
}
