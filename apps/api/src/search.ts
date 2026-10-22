import {
  createPostgresTopicSearch,
  type TopicSearchIndex,
} from "@countrytopics/search";

import { readPool } from "@/read-pool";

// The search index the public pages read (ADR 0008). It is a table in the
// database, read through the read pool; the worker writes it on the
// primary.

let index: TopicSearchIndex | undefined;

export function topicSearch(): TopicSearchIndex {
  index ??= createPostgresTopicSearch(readPool());
  return index;
}
