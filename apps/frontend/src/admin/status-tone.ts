// The colour a stored status is shown in, as a badge in lists and editors:
// green for done or public, amber for waiting on staff, red for a problem,
// blue for a draft newer than what is public, grey for the rest. The
// badge's text says the status; the colour only helps scan a list. Values
// that are not statuses, such as a reference's kind, stay plain text.

export type StatusTone = "good" | "waiting" | "problem" | "info" | "plain";

const TONES: Record<string, StatusTone> = {
  // Topics (TOPIC_STATES)
  published: "good",
  in_review: "waiting",
  updated: "info",
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
const IN_COLLECTION: Partial<Record<string, Record<string, StatusTone>>> = {
  "link-archives": { archived: "good" },
};

/** The status's colour; null for a value that is not a status. */
export function statusTone(
  collection: string,
  value: string,
): StatusTone | null {
  return IN_COLLECTION[collection]?.[value] ?? TONES[value] ?? null;
}
