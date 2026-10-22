import type { AdminCollection } from "@countrytopics/contracts";
import { VIDEO_CHECK_LABELS } from "@countrytopics/domain";

import { DATE_FIELDS, type CollectionText } from "@/admin/collection-text";

// What the admin calls the snippets feature's collections, their fields,
// and their stored values, as Payload's panel does (apps/api/src/collections),
// and the colours its statuses show in. Read through admin/collections.ts.

export const COLLECTIONS = {
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
      ...DATE_FIELDS,
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
      ...DATE_FIELDS,
    },
    values: { checkStatus: VIDEO_CHECK_LABELS },
    tones: {
      checkStatus: {
        pending: "waiting",
        playable: "good",
        not_embeddable: "problem",
        unavailable: "problem",
        failed: "problem",
      },
    },
  },
} satisfies Partial<Record<AdminCollection, CollectionText>>;
