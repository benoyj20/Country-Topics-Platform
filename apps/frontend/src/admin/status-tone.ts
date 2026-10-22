import type { AdminCollection } from "@countrytopics/contracts";

// The colour a stored status is shown in, as a badge in lists and editors:
// green for done or public, amber for waiting on staff, red for a problem,
// blue for a role or for work newer than what is public, grey for the
// rest. The badge's text says the status; the colour only helps scan a
// list. Other choices, such as a reference's kind or a change's kind, stay
// plain text.

export type StatusTone = "good" | "waiting" | "problem" | "info" | "plain";

/** The fields that hold a status, by collection. */
const STATUS_FIELDS: Partial<Record<AdminCollection, readonly string[]>> = {
  topics: ["state"],
  references: ["checkStatus"],
  videos: ["checkStatus"],
  "link-archives": ["status"],
  comments: ["status"],
  "comment-reports": ["status"],
  feedback: ["status"],
  users: ["role"],
  invitations: ["role"],
};

const TONES: Record<string, StatusTone> = {
  // Topics (TOPIC_STATES): "updated" is published again, so public too.
  published: "good",
  updated: "good",
  in_review: "waiting",
  draft: "plain",
  archived: "plain",
  // Comments and reports (COMMENT_STATUSES, COMMENT_REPORT_STATUSES)
  visible: "good",
  hidden: "problem",
  removed: "problem",
  deleted: "plain",
  open: "waiting",
  dismissed: "plain",
  actioned: "good",
  // Feedback (FEEDBACK_STATUSES)
  new: "waiting",
  done: "good",
  // The worker's checks (VIDEO_CHECK_STATUSES, REFERENCE_CHECK_STATUSES,
  // LINK_ARCHIVE_STATUSES)
  pending: "waiting",
  playable: "good",
  resolved: "good",
  not_embeddable: "problem",
  unavailable: "problem",
  not_found: "problem",
  not_archived: "plain",
  failed: "problem",
  // Roles
  admin: "info",
  moderator: "info",
  member: "plain",
};

/** Where a value means something else: a link copied to an archive. */
const IN_COLLECTION: Partial<
  Record<AdminCollection, Record<string, StatusTone>>
> = {
  "link-archives": { archived: "good" },
};

/** The colour of a status field's value; null for any other field. */
export function statusTone(
  collection: AdminCollection,
  field: string,
  value: string,
): StatusTone | null {
  if (!STATUS_FIELDS[collection]?.includes(field)) return null;
  return IN_COLLECTION[collection]?.[value] ?? TONES[value] ?? "plain";
}
