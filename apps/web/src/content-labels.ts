import type {
  ClaimStance,
  CommentReportReason,
  CommentReportStatus,
  CommentStatus,
  EvidenceKind,
  ReferenceKind,
  TopicChangeKind,
  TopicPersonRole,
  TopicState,
} from "@countrytopics/domain";

// Names shown for stored values, shared by the admin panel and the public
// pages so both say the same thing.

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

/** The licences a file may have; only files we may publish are uploaded. */
export const LICENCE_LABELS = {
  public_domain: "Public domain or CC0",
  cc_by: "CC BY",
  cc_by_sa: "CC BY-SA",
  other_open: "Other open licence (name it in Credit)",
  permission: "Used with the owner's permission",
  own_work: "Our own work",
  official_document: "Official or public record",
} as const;
export type Licence = keyof typeof LICENCE_LABELS;

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
};

export const COMMENT_REPORT_STATUS_LABELS: Record<CommentReportStatus, string> =
  {
    open: "Open",
    dismissed: "Dismissed",
    actioned: "Acted on",
  };
