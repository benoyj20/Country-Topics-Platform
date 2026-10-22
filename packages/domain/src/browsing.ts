// How topics can be browsed (ADR 0008), shared by the search adapter, the
// backend's browse route, and the site's topics page.

export const TOPIC_SORTS = [
  /** Best text match first; only with search words. */
  "relevance",
  /** First published, newest first. */
  "newest",
  /** Last published (an update or the first publish), newest first. */
  "updated",
  /** Most references cited, then newest first. */
  "referenced",
  /** Most comments (replies included), then newest first. */
  "discussed",
] as const;
export type TopicSort = (typeof TOPIC_SORTS)[number];

/** Search words, as typed; longer queries are refused rather than cut. */
export const SEARCH_TEXT_MAX_LENGTH = 200;
