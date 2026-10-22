import type { AdminCollection } from "@countrytopics/contracts";
import {
  COMMENT_REPORT_REASON_LABELS,
  COMMENT_REPORT_STATUS_LABELS,
  COMMENT_STATUS_LABELS,
  FEEDBACK_KIND_LABELS,
  FEEDBACK_STATUS_LABELS,
  LICENCE_LABELS,
  LINK_ARCHIVE_STATUS_LABELS,
  REFERENCE_CHECK_LABELS,
  REFERENCE_KIND_LABELS,
  ROLE_LABELS,
  TOPIC_CHANGE_LABELS,
  TOPIC_STATE_LABELS,
  VIDEO_CHECK_LABELS,
} from "@countrytopics/domain";

// What the admin calls each collection, its fields, and their stored
// values, as Payload's panel does (apps/web/src/collections). What a list
// reads is in packages/contracts (admin-lists.ts).

export type AdminGroup = "Content" | "Discussion" | "Administration";

export const ADMIN_GROUPS: readonly AdminGroup[] = [
  "Content",
  "Discussion",
  "Administration",
];

export type CollectionText = {
  plural: string;
  singular: string;
  group: AdminGroup;
  /** Shown above the list, as the panel's description. */
  description?: string;
  /** Field names as staff know them; a field without one is shown as named. */
  fields: Record<string, string>;
  /** Names for stored values, by field. */
  values?: Record<string, Readonly<Record<string, string>>>;
};

const dates = { createdAt: "Created", updatedAt: "Updated" };

export const COLLECTION_TEXT: Record<AdminCollection, CollectionText> = {
  topics: {
    plural: "Topics",
    singular: "Topic",
    group: "Content",
    fields: {
      title: "Title",
      summary: "Summary",
      state: "State",
      countries: "Countries",
      category: "Category",
      tags: "Tags",
      readyForReview: "Ready for review",
      archived: "Archived",
      ...dates,
    },
    values: { state: TOPIC_STATE_LABELS },
  },
  "topic-changes": {
    plural: "Topic changes",
    singular: "Topic change",
    group: "Content",
    fields: {
      topic: "Topic",
      kind: "Kind",
      note: "Note",
      actor: "By",
      ...dates,
    },
    values: { kind: TOPIC_CHANGE_LABELS },
  },
  references: {
    plural: "References",
    singular: "Reference",
    group: "Content",
    fields: {
      title: "Title",
      kind: "Kind",
      checkStatus: "Check",
      authors: "Authors",
      doi: "DOI",
      isbn: "ISBN",
      ...dates,
    },
    values: {
      kind: REFERENCE_KIND_LABELS,
      checkStatus: REFERENCE_CHECK_LABELS,
    },
  },
  snippets: {
    plural: "Snippets",
    singular: "Snippet",
    group: "Content",
    description:
      "Clips of YouTube videos with what is said in them. Topics use them as evidence.",
    fields: {
      caption: "Caption",
      transcriptText: "Transcript",
      speaker: "Speaker",
      video: "Video",
      language: "Language",
      ...dates,
    },
  },
  videos: {
    plural: "Videos",
    singular: "Video",
    group: "Content",
    description:
      "YouTube videos that snippets are cut from. Added when a snippet is saved; the worker checks each one with YouTube.",
    fields: {
      title: "Title",
      channel: "Channel",
      youtubeId: "YouTube id",
      checkStatus: "Check",
      durationS: "Length (seconds)",
      checkedAt: "Checked",
      ...dates,
    },
    values: { checkStatus: VIDEO_CHECK_LABELS },
  },
  media: {
    plural: "Files",
    singular: "File",
    group: "Content",
    description:
      "Documents and images used as evidence, and photos of individuals. Record the licence of every file.",
    fields: {
      filename: "File",
      alt: "Description",
      licence: "Licence",
      credit: "Credit",
      mimeType: "Type",
      ...dates,
    },
    values: {
      licence: LICENCE_LABELS,
      mimeType: {
        "image/jpeg": "JPEG image",
        "image/png": "PNG image",
        "image/webp": "WebP image",
        "application/pdf": "PDF document",
      },
    },
  },
  "link-archives": {
    plural: "Archived links",
    singular: "Archived link",
    group: "Content",
    description:
      "Filled in by the worker: copies of evidence links and reference links in the Wayback Machine.",
    fields: {
      url: "Link",
      status: "Status",
      capturedAt: "Copy taken",
      checkedAt: "Checked",
      ...dates,
    },
    values: { status: LINK_ARCHIVE_STATUS_LABELS },
  },
  individuals: {
    plural: "Individuals",
    singular: "Individual",
    group: "Content",
    fields: {
      name: "Name",
      summary: "Role or description",
      wikidataId: "Wikidata ID",
      ...dates,
    },
  },
  countries: {
    plural: "Countries",
    singular: "Country",
    group: "Content",
    fields: {
      name: "Name",
      code: "ISO 3166-1 alpha-2",
      isoName: "ISO short name",
      region: "Region",
      subregion: "Subregion",
      ...dates,
    },
  },
  categories: {
    plural: "Categories",
    singular: "Category",
    group: "Content",
    fields: { name: "Name", slug: "Slug", ...dates },
  },
  tags: {
    plural: "Tags",
    singular: "Tag",
    group: "Content",
    fields: { name: "Name", slug: "Slug", ...dates },
  },
  comments: {
    plural: "Comments",
    singular: "Comment",
    group: "Discussion",
    description:
      "Written by members on topic pages. Staff hide comments that break the rules and lock threads; the text itself cannot be edited.",
    fields: {
      body: "Comment",
      topic: "Topic",
      author: "Author",
      status: "Status",
      locked: "Thread locked",
      parent: "A reply",
      ...dates,
    },
    values: { status: COMMENT_STATUS_LABELS },
  },
  "comment-reports": {
    plural: "Comment reports",
    singular: "Comment report",
    group: "Discussion",
    description:
      "Sent by members from topic pages, open ones first. Open the comment to hide it, which marks its reports acted on, or dismiss a report that needs nothing done.",
    fields: {
      comment: "Comment",
      reason: "Reason",
      note: "Note",
      status: "Status",
      ...dates,
    },
    values: {
      reason: COMMENT_REPORT_REASON_LABELS,
      status: COMMENT_REPORT_STATUS_LABELS,
    },
  },
  users: {
    plural: "Users",
    singular: "User",
    group: "Administration",
    fields: {
      email: "Email",
      name: "Name",
      displayName: "Public name",
      role: "Role",
      ...dates,
    },
    values: { role: ROLE_LABELS },
  },
  invitations: {
    plural: "Invitations",
    singular: "Invitation",
    group: "Administration",
    fields: {
      email: "Email",
      role: "Role",
      acceptedAt: "Accepted",
      ...dates,
    },
    values: { role: ROLE_LABELS },
  },
  feedback: {
    plural: "Feedback",
    singular: "Feedback",
    group: "Administration",
    description:
      "Sent by members from the Feedback link at the bottom of every page, new first.",
    fields: {
      message: "Message",
      kind: "Kind",
      page: "Page",
      status: "Status",
      author: "From",
      ...dates,
    },
    values: { kind: FEEDBACK_KIND_LABELS, status: FEEDBACK_STATUS_LABELS },
  },
  "audit-log": {
    plural: "Audit log",
    singular: "Audit entry",
    group: "Administration",
    fields: {
      action: "Action",
      actor: "By",
      targetCollection: "Collection",
      targetId: "Record",
      ...dates,
    },
  },
};

/** A field's name as staff know it. */
export function fieldLabel(collection: AdminCollection, field: string): string {
  return COLLECTION_TEXT[collection].fields[field] ?? field;
}

/** A stored value's name, or the value itself. */
export function valueLabel(
  collection: AdminCollection,
  field: string,
  value: string,
): string {
  return COLLECTION_TEXT[collection].values?.[field]?.[value] ?? value;
}
