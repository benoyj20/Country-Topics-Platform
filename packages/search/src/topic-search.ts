import type { EvidenceKind } from "@countrytopics/domain";

// The search adapter (ADR 0008): F1 browsing, filters, and full-text search
// over listed topics. The index is a copy, rebuilt from PostgreSQL by the
// worker; any engine that can store these documents, filter on their facets,
// and rank text can implement it (PostgreSQL full text now, Meilisearch or
// OpenSearch when facet load requires it, ADR 0001).

export const TOPIC_SORTS = [
  /** Best text match first; only with search words. */
  "relevance",
  /** First published, newest first. */
  "newest",
  /** Last published (an update or the first publish), newest first. */
  "updated",
  /** Most references cited, then newest first. */
  "referenced",
] as const;
export type TopicSort = (typeof TOPIC_SORTS)[number];

/** Search words, as typed; longer queries are refused rather than cut. */
export const SEARCH_TEXT_MAX_LENGTH = 200;
/** Topics in one page of results. */
export const SEARCH_PAGE_SIZE = 20;
/** Values listed per facet, most topics first; selected ones are always kept. */
export const FACET_VALUE_LIMIT = 100;

/** A listed topic as the index stores it: everything browsing filters, sorts, shows, or matches. */
export type TopicSearchDocument = {
  topicId: string;
  slug: string;
  title: string;
  summary: string;
  /** Listed topics only: archived and draft topics are not indexed. */
  state: "published" | "updated";
  firstPublishedAt: string;
  lastPublishedAt: string;
  countryIds: string[];
  categoryId: string | null;
  tagIds: string[];
  /** Everyone the topic names: its people, links in its text, and snippet speakers. */
  individualIds: string[];
  /** The kinds of evidence the topic shows. */
  evidenceKinds: EvidenceKind[];
  /** The languages of its snippets. */
  languages: string[];
  referenceCount: number;
  /** What search words match, from most to least important. */
  text: {
    title: string;
    /** The summary, and the names of its countries, category, tags, and people. */
    summary: string;
    body: string;
    /** Evidence titles, snippet captions, and what the snippets' speakers say. */
    evidence: string;
  };
  /**
   * The topic's last change (its updatedAt). An index keeps the newest
   * document it was given, so a job that read the topic earlier but
   * finished later cannot bring back an older copy.
   */
  version: string;
};

/** Facet filters: any of the values within a facet, all facets together. */
export type TopicFilters = {
  countryIds: string[];
  categoryIds: string[];
  tagIds: string[];
  individualIds: string[];
  evidenceKinds: EvidenceKind[];
  languages: string[];
  /** Only topics citing at least one reference. */
  withReferences: boolean;
  /** First published on or after this day (UTC), as YYYY-MM-DD. */
  publishedFrom: string | null;
  /** First published on or before this day (UTC), as YYYY-MM-DD. */
  publishedTo: string | null;
};

export type TopicSearchRequest = {
  /** Search words, or null to browse. */
  text: string | null;
  filters: TopicFilters;
  /** "relevance" needs text. */
  sort: TopicSort;
  /** From the previous page's `nextCursor`, for the same request. */
  cursor: string | null;
  limit: number;
  /** Count topics per facet value and in total; the first page needs them. */
  withFacets: boolean;
};

export type TopicSearchHit = Pick<
  TopicSearchDocument,
  | "topicId"
  | "slug"
  | "title"
  | "summary"
  | "state"
  | "firstPublishedAt"
  | "lastPublishedAt"
  | "countryIds"
  | "referenceCount"
>;

export type FacetCount = { value: string; count: number };

/**
 * For each facet, the topics each value would match given every other
 * filter and the search words, so choosing a value never shows a count that
 * the facet's own selection already narrowed.
 */
export type TopicFacets = {
  countries: FacetCount[];
  categories: FacetCount[];
  tags: FacetCount[];
  individuals: FacetCount[];
  evidenceKinds: FacetCount[];
  languages: FacetCount[];
  /** Topics citing a reference. */
  withReferences: number;
};

export type TopicSearchResult = {
  hits: TopicSearchHit[];
  /** For the next page; null on the last one. */
  nextCursor: string | null;
  /** Present when the request asked for facets. */
  total: number | null;
  facets: TopicFacets | null;
};

/** A cursor that this index did not issue for this request. */
export class InvalidCursorError extends Error {
  constructor() {
    super("The page cursor is not valid for this search.");
    this.name = "InvalidCursorError";
  }
}

export type TopicSearchIndex = {
  /**
   * Adds or replaces a topic's document. Returns false, changing nothing,
   * when the index already holds a newer version.
   */
  upsert(document: TopicSearchDocument): Promise<boolean>;
  /**
   * Removes a topic that is no longer listed. With a version (the topic's
   * updatedAt when it was read), a document newer than that is kept: it was
   * indexed from a later save.
   */
  remove(topicId: string, version: string | null): Promise<void>;
  /** Every indexed topic id, for rebuilds. */
  indexedIds(): Promise<string[]>;
  search(request: TopicSearchRequest): Promise<TopicSearchResult>;
};
