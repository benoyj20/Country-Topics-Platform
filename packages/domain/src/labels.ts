import type { CommentReportReason } from "./comments.ts";
import type { FeedbackKind, FeedbackStatus } from "./feedback.ts";
import type { CommentReportStatus, CommentStatus } from "./moderation.ts";
import type { Role } from "./roles.ts";
import type { VideoCheckStatus } from "./snippets.ts";
import type {
  ClaimStance,
  EvidenceKind,
  Licence,
  LinkArchiveStatus,
  ReferenceCheckStatus,
  ReferenceKind,
} from "./topic-evidence.ts";
import type {
  TopicChangeKind,
  TopicPersonRole,
  TopicState,
} from "./topic-workflow.ts";

// Names shown for stored values, shared by the admin and the public pages
// so both say the same thing.

export const EVIDENCE_KIND_LABELS: Record<EvidenceKind, string> = {
  document: "Document (PDF)",
  image: "Image",
  link: "Web page",
  snippet: "Video snippet",
};

export const STANCE_LABELS: Record<ClaimStance, string> = {
  supports: "Supports",
  contradicts: "Contradicts",
  context: "Context",
};

export const TOPIC_STATE_LABELS: Record<TopicState, string> = {
  draft: "Draft",
  in_review: "In review",
  published: "Published",
  updated: "Updated",
  archived: "Archived",
};

export const TOPIC_CHANGE_LABELS: Record<TopicChangeKind, string> = {
  published: "First published",
  updated: "Updated",
  archived: "Archived",
  restored: "Restored",
};

export const PERSON_ROLE_LABELS: Record<TopicPersonRole, string> = {
  subject: "Subject",
  speaker: "Speaker",
  source: "Source",
  mentioned: "Mentioned",
};

export const REFERENCE_KIND_LABELS: Record<ReferenceKind, string> = {
  article: "Article or paper",
  book: "Book",
  chapter: "Book chapter",
  report: "Report",
  web_page: "Web page",
  dataset: "Dataset",
  other: "Other",
};

export const LICENCE_LABELS: Record<Licence, string> = {
  public_domain: "Public domain or CC0",
  cc_by: "CC BY",
  cc_by_sa: "CC BY-SA",
  other_open: "Other open licence (name it in Credit)",
  permission: "Used with the owner's permission",
  own_work: "Our own work",
  official_document: "Official or public record",
};

export const COMMENT_REPORT_REASON_LABELS: Record<CommentReportReason, string> =
  {
    spam: "Spam or advertising",
    abuse: "Harassment, hate, or threats",
    misleading: "False or misleading",
    "off-topic": "Off topic",
    other: "Something else",
  };

export const COMMENT_STATUS_LABELS: Record<CommentStatus, string> = {
  visible: "Visible",
  hidden: "Hidden by a moderator",
  removed: "Removed (text erased)",
  deleted: "Deleted with its author's account (text erased)",
};

export const COMMENT_REPORT_STATUS_LABELS: Record<CommentReportStatus, string> =
  {
    open: "Open",
    dismissed: "Dismissed",
    actioned: "Acted on",
  };

export const FEEDBACK_KIND_LABELS: Record<FeedbackKind, string> = {
  problem: "Something is not working",
  idea: "An idea or suggestion",
  other: "Something else",
};

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "New",
  done: "Done",
};

export const REFERENCE_CHECK_LABELS: Record<ReferenceCheckStatus, string> = {
  pending: "Being checked",
  resolved: "Confirmed",
  not_found: "Not found",
  failed: "Check could not finish",
};

export const VIDEO_CHECK_LABELS: Record<VideoCheckStatus, string> = {
  pending: "Being checked",
  playable: "Playable",
  not_embeddable: "Cannot be embedded",
  unavailable: "Removed or private",
  failed: "Check could not finish",
};

export const LINK_ARCHIVE_STATUS_LABELS: Record<LinkArchiveStatus, string> = {
  archived: "Archived",
  not_archived: "No copy",
  failed: "Could not check",
};

export const ROLE_LABELS: Record<Role, string> = {
  member: "Member",
  moderator: "Moderator",
  admin: "Admin",
};
