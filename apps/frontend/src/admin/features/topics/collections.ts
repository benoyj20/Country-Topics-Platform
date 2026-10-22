import type { AdminCollection } from "@countrytopics/contracts";
import {
  TOPIC_CHANGE_LABELS,
  TOPIC_STATE_LABELS,
  type TopicState,
} from "@countrytopics/domain";

import { DATE_FIELDS, type CollectionText } from "@/admin/collection-text";
import type { StatusTone } from "@/admin/status-tone";

// What the admin calls the topics feature's collections, their fields,
// and their stored values, as Payload's panel does (apps/api/src/collections),
// and the colours its statuses show in. Read through admin/collections.ts.

export const COLLECTIONS = {
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
      ...DATE_FIELDS,
    },
    values: { state: TOPIC_STATE_LABELS },
    tones: {
      state: {
        published: "good",
        updated: "good",
        in_review: "waiting",
        draft: "plain",
        archived: "plain",
      } satisfies Record<TopicState, StatusTone>,
    },
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
      ...DATE_FIELDS,
    },
    values: { kind: TOPIC_CHANGE_LABELS },
  },
} satisfies Partial<Record<AdminCollection, CollectionText>>;
