import {
  EVIDENCE_KINDS,
  type EvidenceKind,
  isLanguageTag,
  isSlug,
  SEARCH_TEXT_MAX_LENGTH,
  TOPIC_SORTS,
  type TopicSort,
} from "@countrytopics/domain";

// A browse request as it appears in a URL: /topics?country=kenya&sort=...
// for people, and /api/v1/topics with the same parameters for the page's
// requests. Values are slugs and codes, so links read well and stay valid
// when ids change. Used in the browser too, so it imports no server code.
//
// One canonical form per request (fixed key order, sorted values, defaults
// left out) means equal requests share one URL and one cache entry.

/** Values per facet; more would only make the URL and the query longer. */
export const BROWSE_VALUES_MAX = 20;

export type BrowseQuery = {
  q: string | null;
  country: string[];
  category: string[];
  tag: string[];
  person: string[];
  evidence: EvidenceKind[];
  language: string[];
  /** Only topics citing a reference. */
  references: boolean;
  /** First published from/to these days, YYYY-MM-DD. */
  from: string | null;
  to: string | null;
  /** Null for the default: relevance with search words, newest without. */
  sort: TopicSort | null;
};

export const EMPTY_BROWSE_QUERY: BrowseQuery = {
  q: null,
  country: [],
  category: [],
  tag: [],
  person: [],
  evidence: [],
  language: [],
  references: false,
  from: null,
  to: null,
  sort: null,
};

export type ListKey =
  "country" | "category" | "tag" | "person" | "evidence" | "language";

const LIST_KEYS: ListKey[] = [
  "country",
  "category",
  "tag",
  "person",
  "evidence",
  "language",
];

const LIST_LABELS: Record<ListKey, string> = {
  country: "Country",
  category: "Category",
  tag: "Tag",
  person: "Person",
  evidence: "Evidence",
  language: "Language",
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function isDay(value: string): boolean {
  if (!DAY.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

const isEvidenceKind = (value: string): value is EvidenceKind =>
  (EVIDENCE_KINDS as readonly string[]).includes(value);

const isSort = (value: string): value is TopicSort =>
  (TOPIC_SORTS as readonly string[]).includes(value);

const LIST_CHECKS: Record<ListKey, (value: string) => boolean> = {
  country: isSlug,
  category: isSlug,
  tag: isSlug,
  person: isSlug,
  evidence: isEvidenceKind,
  language: isLanguageTag,
};

/** The sort used when none is chosen. */
export function defaultSort(query: Pick<BrowseQuery, "q">): TopicSort {
  return query.q ? "relevance" : "newest";
}

/** The sort in effect: relevance needs search words. */
export function effectiveSort(query: BrowseQuery): TopicSort {
  if (query.sort === "relevance" && !query.q) return "newest";
  return query.sort ?? defaultSort(query);
}

/** The parameters a browse request may have. */
export const BROWSE_PARAMS = [
  "q",
  ...LIST_KEYS,
  "references",
  "from",
  "to",
  "sort",
] as const;

/**
 * Reads a browse request. Values that are not valid are left out and each
 * is described in `problems`, so a page can still show the rest of a
 * mistyped link and the API can refuse it. Parameters that are not browse
 * parameters are listed in `unknown`: the page ignores them (a link may
 * carry a campaign tag), and the API refuses them.
 */
export function parseBrowseQuery(params: URLSearchParams): {
  query: BrowseQuery;
  problems: string[];
  unknown: string[];
} {
  const problems: string[] = [];
  const single = (key: string): string | null => {
    const values = params.getAll(key);
    if (values.length > 1) problems.push(`"${key}" was given more than once.`);
    return values[0] ?? null;
  };

  const query: BrowseQuery = { ...EMPTY_BROWSE_QUERY };
  const q = single("q")?.replace(/\s+/g, " ").trim() ?? "";
  if (q.length > SEARCH_TEXT_MAX_LENGTH) {
    problems.push(
      `The search words are longer than ${SEARCH_TEXT_MAX_LENGTH} characters.`,
    );
  } else if (q) {
    query.q = q;
  }

  for (const key of LIST_KEYS) {
    // Language codes are compared in lower case, as the index stores them.
    const values = [
      ...new Set(
        params
          .getAll(key)
          .map((value) => (key === "language" ? value.toLowerCase() : value)),
      ),
    ];
    const valid = values.filter((value) => LIST_CHECKS[key](value));
    if (valid.length < values.length) {
      problems.push(
        `${LIST_LABELS[key]}: "${values.find((value) => !LIST_CHECKS[key](value))}" is not valid.`,
      );
    }
    if (valid.length > BROWSE_VALUES_MAX) {
      problems.push(
        `${LIST_LABELS[key]}: choose at most ${BROWSE_VALUES_MAX}.`,
      );
    }
    (query[key] as string[]) = valid.slice(0, BROWSE_VALUES_MAX).sort();
  }

  const references = single("references");
  if (references === "1") query.references = true;
  else if (references !== null) {
    problems.push('"references" must be 1 (topics that cite a reference).');
  }

  for (const key of ["from", "to"] as const) {
    const value = single(key);
    if (value === null || value === "") continue;
    if (isDay(value)) query[key] = value;
    else problems.push(`"${key}" must be a date such as 2026-10-17.`);
  }
  if (query.from && query.to && query.from > query.to) {
    problems.push('"from" was after "to", so the two dates were swapped.');
    [query.from, query.to] = [query.to, query.from];
  }

  const sort = single("sort");
  if (sort !== null && sort !== "") {
    // The default, or relevance without words to rank, is left out.
    if (isSort(sort)) {
      query.sort =
        sort === defaultSort(query) || (sort === "relevance" && !query.q)
          ? null
          : sort;
    } else problems.push(`"${sort}" is not a way to sort.`);
  }
  const known = new Set<string>(BROWSE_PARAMS);
  const unknown = [...new Set(params.keys())].filter((key) => !known.has(key));
  return { query, problems, unknown };
}

/** The canonical URL parameters of a browse request. */
export function browseSearchParams(query: BrowseQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  for (const key of LIST_KEYS) {
    for (const value of [...new Set(query[key])].sort()) {
      params.append(key, value);
    }
  }
  if (query.references) params.set("references", "1");
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.sort && query.sort !== defaultSort(query)) {
    params.set("sort", query.sort);
  }
  return params;
}

/** The page address of a browse request, such as /topics?country=kenya. */
export function browseHref(query: Partial<BrowseQuery> = {}): string {
  const search = browseSearchParams({
    ...EMPTY_BROWSE_QUERY,
    ...query,
  }).toString();
  return search ? `/topics?${search}` : "/topics";
}

/** How many filters are chosen, for "Filters (3)". */
export function filterCount(query: BrowseQuery): number {
  return (
    LIST_KEYS.reduce((count, key) => count + query[key].length, 0) +
    (query.references ? 1 : 0) +
    (query.from ? 1 : 0) +
    (query.to ? 1 : 0)
  );
}
