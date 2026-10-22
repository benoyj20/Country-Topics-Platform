import * as z from "zod";

import { type AdminCollection, appendBrackets } from "./admin-lists.ts";
import { payloadMessage } from "./payload-errors.ts";

// The admin's bulk actions (ADR 0014, phase 11), as Payload's panel offers
// them on its lists: select records, then publish, archive, edit, or
// delete them in one request (`PATCH` or `DELETE /api/<collection>` with a
// `where`). The backend's access rules and hooks decide for each record;
// those it refuses come back with a message each, and those its access
// rules leave out are not touched at all. Payload's panel can set any
// field on many records; these are the edits staff make in bulk.

/** What an action asks for before it runs. */
export type BulkInput =
  /** A topic's change note, needed to publish one published before. */
  | "changeNote"
  /** Why comments are hidden, which their authors are told. */
  | "moderationReason";

export type BulkAction = {
  /** Unique within its collection. */
  id: string;
  /** The button's text. */
  label: string;
  /** What was done, for the result: "Published 3 topics". */
  done: string;
  method: "PATCH" | "DELETE";
  /** What a PATCH sets on each record. */
  body?: Readonly<Record<string, unknown>>;
  /** Acts on each record's newest draft, as the panel's bulk publish does. */
  draft?: boolean;
  /** Only records this Payload `where` allows; the others are skipped. */
  scope?: Readonly<Record<string, unknown>>;
  /** Why a selected record was skipped: the scope, or the access rules. */
  skipped?: string;
  inputs?: readonly BulkInput[];
  /** Asked before it runs, with the number of records. */
  confirm?: (count: number) => string;
  /** Who may run it, as the backend's access rules allow. */
  by: "admins" | "staff";
  danger?: boolean;
};

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

const deleteAction = (one: string, many: string): BulkAction => ({
  id: "delete",
  label: "Delete",
  done: "Deleted",
  method: "DELETE",
  by: "admins",
  danger: true,
  confirm: (count) =>
    `Delete ${plural(count, one, many)}? They cannot be brought back. Anything still used elsewhere is kept.`,
});

export const ADMIN_BULK: Partial<
  Record<AdminCollection, readonly BulkAction[]>
> = {
  topics: [
    {
      id: "publish",
      label: "Publish",
      done: "Published",
      method: "PATCH",
      body: { _status: "published" },
      draft: true,
      inputs: ["changeNote"],
      by: "admins",
      confirm: (count) =>
        `Publish the newest draft of ${plural(count, "topic", "topics")}? Visitors see them at once.`,
    },
    {
      id: "archive",
      label: "Archive",
      done: "Archived",
      method: "PATCH",
      body: { _status: "published", archived: true },
      draft: true,
      // Archiving a topic never published would publish it.
      scope: { firstPublishedAt: { exists: true } },
      skipped: "It was never published: delete it instead.",
      inputs: ["changeNote"],
      by: "admins",
      confirm: (count) =>
        `Archive ${plural(count, "topic", "topics")}? Each one's newest draft is published with it, so check none holds unfinished changes. They leave lists at once; their pages and history stay.`,
    },
    {
      id: "ready",
      label: "Mark ready for review",
      done: "Marked ready for review",
      method: "PATCH",
      body: { readyForReview: true },
      draft: true,
      by: "admins",
    },
    {
      id: "not-ready",
      label: "Mark not ready",
      done: "Marked not ready for review",
      method: "PATCH",
      body: { readyForReview: false },
      draft: true,
      by: "admins",
    },
    {
      ...deleteAction("topic", "topics"),
      scope: { firstPublishedAt: { exists: false } },
      skipped: "It was published, so it is archived instead of deleted.",
    },
  ],
  references: [deleteAction("reference", "references")],
  snippets: [deleteAction("snippet", "snippets")],
  videos: [deleteAction("video", "videos")],
  media: [deleteAction("file", "files")],
  individuals: [deleteAction("individual", "individuals")],
  categories: [deleteAction("category", "categories")],
  tags: [deleteAction("tag", "tags")],
  comments: [
    {
      id: "hide",
      label: "Hide",
      done: "Hidden",
      method: "PATCH",
      body: { status: "hidden" },
      // A removed or deleted comment's text is gone; it stays as it is.
      scope: { status: { in: ["visible", "hidden"] } },
      skipped: "Its text was erased, so it stays as it is.",
      inputs: ["moderationReason"],
      by: "staff",
    },
    {
      id: "show",
      label: "Show again",
      done: "Shown again",
      method: "PATCH",
      body: { status: "visible", moderationReason: null },
      scope: { status: { in: ["visible", "hidden"] } },
      skipped: "Its text was erased, so it cannot be shown again.",
      by: "staff",
    },
    {
      id: "lock",
      label: "Lock threads",
      done: "Locked",
      method: "PATCH",
      body: { locked: true },
      scope: { parent: { exists: false } },
      skipped: "It is a reply; only a thread is locked.",
      by: "staff",
    },
    {
      id: "unlock",
      label: "Unlock threads",
      done: "Unlocked",
      method: "PATCH",
      body: { locked: false },
      scope: { parent: { exists: false } },
      skipped: "It is a reply; only a thread is locked.",
      by: "staff",
    },
  ],
  "comment-reports": [
    {
      id: "dismiss",
      label: "Dismiss",
      done: "Dismissed",
      method: "PATCH",
      body: { status: "dismissed" },
      by: "staff",
    },
    {
      id: "reopen",
      label: "Reopen",
      done: "Reopened",
      method: "PATCH",
      body: { status: "open" },
      by: "staff",
    },
  ],
  feedback: [
    {
      id: "done",
      label: "Mark done",
      done: "Marked done",
      method: "PATCH",
      body: { status: "done" },
      by: "staff",
    },
    {
      id: "new",
      label: "Mark new",
      done: "Marked new",
      method: "PATCH",
      body: { status: "new" },
      by: "staff",
    },
  ],
  users: [
    {
      ...deleteAction("account", "accounts"),
      confirm: (count) =>
        `Delete ${plural(count, "account", "accounts")}? Their comments' text is erased, and they cannot be brought back.`,
    },
  ],
  invitations: [deleteAction("invitation", "invitations")],
};

/** The actions `role` may run on `collection`'s list. */
export function bulkActions(
  collection: AdminCollection,
  role: "admin" | "moderator" | "member",
): readonly BulkAction[] {
  if (role === "member") return [];
  return (ADMIN_BULK[collection] ?? []).filter(
    (action) => action.by === "staff" || role === "admin",
  );
}

/** Records one bulk request may name by id: a page of the longest list. */
export const BULK_IDS_MAX = 100;

/** Records a bulk request over every match may change, at most. */
export const BULK_MATCHING_MAX = 1_000;

/**
 * Which records a bulk action is for: those selected by id, or every
 * record the list's filters match, as its `where` (adminListWhere).
 */
export type BulkTarget =
  | { kind: "ids"; ids: readonly string[] }
  | { kind: "matching"; where: Readonly<Record<string, unknown>> };

/**
 * The query string of a bulk action's request: its records, narrowed to
 * its scope, answered at depth 0. Nothing is left out with `select`: the
 * hooks that run after each change (the change log, the audit log, the
 * search index) are given the record as the request selects it. An edit
 * over every match stops at BULK_MATCHING_MAX records; Payload's bulk
 * delete takes no limit, so the admin offers every match only when there
 * are no more than that.
 */
export function bulkSearchParams(
  action: BulkAction,
  target: BulkTarget,
): URLSearchParams {
  const records =
    target.kind === "ids"
      ? { id: { in: [...target.ids].slice(0, BULK_IDS_MAX) } }
      : target.where;
  const params = new URLSearchParams({ depth: "0" });
  if (target.kind === "matching")
    params.set("limit", String(BULK_MATCHING_MAX));
  if (action.draft) params.set("draft", "true");
  appendBrackets(params, "where", {
    and: [records, ...(action.scope ? [action.scope] : [])],
  });
  return params;
}

/** The JSON body of a bulk PATCH, with what the action asked for. */
export function bulkBody(
  action: BulkAction,
  inputs: { changeNote?: string; moderationReason?: string },
): Record<string, unknown> {
  const body: Record<string, unknown> = { ...action.body };
  const note = inputs.changeNote?.trim();
  if (action.inputs?.includes("changeNote") && note) body.changeNote = note;
  if (action.inputs?.includes("moderationReason")) {
    body.moderationReason = inputs.moderationReason || null;
  }
  return body;
}

/** Payload's answer to a bulk request: the records changed, and those refused. */
export const bulkAnswerSchema = z.looseObject({
  docs: z.array(z.looseObject({ id: z.string() })),
  errors: z.array(
    z.looseObject({ id: z.string().nullish(), message: z.string().nullish() }),
  ),
});
export type BulkAnswer = z.infer<typeof bulkAnswerSchema>;

/** What became of each record a bulk action was for. */
export type BulkOutcome = {
  done: string[];
  refused: { id: string; message: string }[];
  /** Selected, but out of the action's scope or the reader's access. */
  skipped: string[];
};

/** A bulk answer, by record: the selected ids it names neither way were skipped. */
export function bulkOutcome(
  answer: BulkAnswer,
  selected: readonly string[] = [],
): BulkOutcome {
  const done = answer.docs.map((doc) => doc.id);
  const refused = answer.errors.flatMap((error) =>
    error.id
      ? [
          {
            id: error.id,
            message: error.message
              ? payloadMessage(error.message)
              : "It was refused.",
          },
        ]
      : [],
  );
  const named = new Set([...done, ...refused.map((error) => error.id)]);
  return {
    done,
    refused,
    skipped: selected.filter((id) => !named.has(id)),
  };
}
