import type { Pool } from "pg";
import * as z from "zod";

import {
  FACET_VALUE_LIMIT,
  InvalidCursorError,
  type FacetCount,
  type TopicFacets,
  type TopicSearchDocument,
  type TopicSearchHit,
  type TopicSearchIndex,
  type TopicSearchRequest,
  type TopicSort,
} from "./topic-search.ts";

// The search adapter on PostgreSQL full text (ADR 0008). Documents live in
// the "search_topics" table (created by the web app's migration
// 20261018_010000_search_topics), apart from Payload's tables: it is a copy
// the worker rebuilds, with one row per listed topic, the facets as arrays
// with GIN indexes, and a weighted tsvector. Every query is parameterised;
// table, column, and configuration names are fixed.

/**
 * The text search configuration. The site is in English (MVP plan); names
 * and other languages are still matched word for word, without stemming.
 */
const CONFIG = "'english'";

/**
 * Each text part is cut to this many characters before indexing, which
 * keeps a tsvector far below PostgreSQL's 1 MB limit; a topic's body is much
 * shorter.
 */
export const INDEXED_TEXT_MAX_LENGTH = 100_000;

/** Cursors longer than this are not ones the index issued. */
const CURSOR_MAX_LENGTH = 300;

type Queryable = Pick<Pool, "query">;

/** Collects query parameters and gives their placeholders. */
class Params {
  readonly values: unknown[] = [];
  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

type FacetName = keyof TopicFacets;

type Clause = { facet: FacetName | null; sql: string };

/** The filter conditions of a request, each tagged with its facet. */
function clauses(request: TopicSearchRequest, params: Params): Clause[] {
  const { filters, text } = request;
  const list: Clause[] = [];
  if (text) {
    list.push({
      facet: null,
      sql: `t.document @@ websearch_to_tsquery(${CONFIG}, ${params.add(text)})`,
    });
  }
  const overlap = (
    facet: FacetName,
    column: string,
    type: "uuid" | "varchar",
    values: string[],
  ) => {
    if (values.length > 0) {
      list.push({
        facet,
        sql: `t.${column} && ${params.add(values)}::${type}[]`,
      });
    }
  };
  overlap("countries", "country_ids", "uuid", filters.countryIds);
  if (filters.categoryIds.length > 0) {
    list.push({
      facet: "categories",
      sql: `t.category_id = ANY(${params.add(filters.categoryIds)}::uuid[])`,
    });
  }
  overlap("tags", "tag_ids", "uuid", filters.tagIds);
  overlap("individuals", "individual_ids", "uuid", filters.individualIds);
  overlap("evidenceKinds", "evidence_kinds", "varchar", filters.evidenceKinds);
  overlap("languages", "languages", "varchar", filters.languages);
  if (filters.withReferences) {
    list.push({ facet: "withReferences", sql: "t.reference_count > 0" });
  }
  // Days are whole UTC days: "to" includes all of its day.
  if (filters.publishedFrom) {
    list.push({
      facet: null,
      sql: `t.first_published_at >= (${params.add(filters.publishedFrom)}::date)::timestamp AT TIME ZONE 'UTC'`,
    });
  }
  if (filters.publishedTo) {
    list.push({
      facet: null,
      sql: `t.first_published_at < (${params.add(filters.publishedTo)}::date + 1)::timestamp AT TIME ZONE 'UTC'`,
    });
  }
  return list;
}

function where(list: Clause[], except: FacetName | null = null): string {
  const kept = list.filter(
    (clause) => except === null || clause.facet !== except,
  );
  return kept.length > 0
    ? kept.map((clause) => clause.sql).join(" AND ")
    : "TRUE";
}

// Sort keys, in order, all descending; the cursor holds the last hit's keys.
const iso = z.iso.datetime();
const uuid = z.uuid();
const CURSOR_KEYS = {
  relevance: z.tuple([z.number().finite(), iso, uuid]),
  newest: z.tuple([iso, uuid]),
  updated: z.tuple([iso, uuid]),
  referenced: z.tuple([z.number().int().nonnegative(), iso, uuid]),
} as const;

type CursorKeys = (string | number)[];

export function encodeCursor(sort: TopicSort, keys: CursorKeys): string {
  return Buffer.from(JSON.stringify({ s: sort, k: keys })).toString(
    "base64url",
  );
}

/** The keys a cursor holds; throws InvalidCursorError for anything else. */
export function decodeCursor(sort: TopicSort, cursor: string): CursorKeys {
  if (cursor.length > CURSOR_MAX_LENGTH || !/^[\w-]+$/.test(cursor)) {
    throw new InvalidCursorError();
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new InvalidCursorError();
  }
  const parsed = z
    .object({ s: z.literal(sort), k: CURSOR_KEYS[sort] })
    .safeParse(decoded);
  if (!parsed.success) throw new InvalidCursorError();
  return parsed.data.k;
}

/** The sort's key expressions, most significant first. */
function sortKeys(sort: TopicSort, rank: string | null): string[] {
  switch (sort) {
    case "relevance":
      return [rank ?? "0::float8", "t.first_published_at", "t.topic_id"];
    case "newest":
      return ["t.first_published_at", "t.topic_id"];
    case "updated":
      return ["t.last_published_at", "t.topic_id"];
    case "referenced":
      return ["t.reference_count", "t.first_published_at", "t.topic_id"];
  }
}

const KEY_TYPES: Record<TopicSort, string[]> = {
  relevance: ["float8", "timestamptz", "uuid"],
  newest: ["timestamptz", "uuid"],
  updated: ["timestamptz", "uuid"],
  referenced: ["int4", "timestamptz", "uuid"],
};

type HitRow = {
  topic_id: string;
  slug: string;
  title: string;
  summary: string;
  state: TopicSearchHit["state"];
  first_published_at: Date;
  last_published_at: Date;
  country_ids: string[];
  reference_count: number;
  rank: number;
};

function cursorOf(sort: TopicSort, row: HitRow): string {
  const published = row.first_published_at.toISOString();
  switch (sort) {
    case "relevance":
      return encodeCursor(sort, [row.rank, published, row.topic_id]);
    case "newest":
      return encodeCursor(sort, [published, row.topic_id]);
    case "updated":
      return encodeCursor(sort, [
        row.last_published_at.toISOString(),
        row.topic_id,
      ]);
    case "referenced":
      return encodeCursor(sort, [row.reference_count, published, row.topic_id]);
  }
}

const ARRAY_FACETS: [FacetName, string][] = [
  ["countries", "country_ids"],
  ["tags", "tag_ids"],
  ["individuals", "individual_ids"],
  ["evidenceKinds", "evidence_kinds"],
  ["languages", "languages"],
];

async function facetsOf(
  db: Queryable,
  request: TopicSearchRequest,
): Promise<{ total: number; facets: TopicFacets }> {
  const params = new Params();
  const list = clauses(request, params);
  const top = `ORDER BY count(*) DESC, value LIMIT ${FACET_VALUE_LIMIT}`;
  const parts = [
    ...ARRAY_FACETS.map(
      ([facet, column]) =>
        `(SELECT '${facet}' AS facet, value::text AS value, count(*)::int AS count
            FROM search_topics t CROSS JOIN LATERAL unnest(t.${column}) AS value
           WHERE ${where(list, facet)} GROUP BY value ${top})`,
    ),
    `(SELECT 'categories' AS facet, t.category_id::text AS value, count(*)::int AS count
        FROM search_topics t
       WHERE t.category_id IS NOT NULL AND ${where(list, "categories")}
       GROUP BY t.category_id
       ORDER BY count(*) DESC, t.category_id LIMIT ${FACET_VALUE_LIMIT})`,
    `(SELECT 'withReferences', NULL, count(*)::int FROM search_topics t
       WHERE t.reference_count > 0 AND ${where(list, "withReferences")})`,
    `(SELECT 'total', NULL, count(*)::int FROM search_topics t WHERE ${where(list)})`,
  ];
  const { rows } = await db.query<{
    facet: FacetName | "total";
    value: string | null;
    count: number;
  }>(parts.join(" UNION ALL "), params.values);

  const facets: TopicFacets = {
    countries: [],
    categories: [],
    tags: [],
    individuals: [],
    evidenceKinds: [],
    languages: [],
    withReferences: 0,
  };
  let total = 0;
  for (const row of rows) {
    if (row.facet === "total") total = row.count;
    else if (row.facet === "withReferences") facets.withReferences = row.count;
    else if (row.value !== null) {
      (facets[row.facet] as FacetCount[]).push({
        value: row.value,
        count: row.count,
      });
    }
  }
  return { total, facets };
}

async function hitsOf(
  db: Queryable,
  request: TopicSearchRequest,
): Promise<{ hits: TopicSearchHit[]; nextCursor: string | null }> {
  // Relevance without words has nothing to rank; it falls back to newest.
  const sort: TopicSort =
    request.sort === "relevance" && !request.text ? "newest" : request.sort;
  const params = new Params();
  const list = clauses(request, params);
  const rank =
    sort === "relevance" && request.text
      ? `ts_rank(t.document, websearch_to_tsquery(${CONFIG}, ${params.add(request.text)}))::float8`
      : null;
  const keys = sortKeys(sort, rank);
  const conditions = [where(list)];
  if (request.cursor) {
    const after = decodeCursor(sort, request.cursor);
    const types = KEY_TYPES[sort];
    conditions.push(
      `(${keys.join(", ")}) < (${after
        .map((value, index) => `${params.add(value)}::${types[index]}`)
        .join(", ")})`,
    );
  }
  const limit = params.add(request.limit + 1);
  const { rows } = await db.query<HitRow>(
    `SELECT t.topic_id::text AS topic_id, t.slug, t.title, t.summary, t.state,
            t.first_published_at, t.last_published_at,
            t.country_ids::text[] AS country_ids, t.reference_count,
            ${rank ?? "0::float8"} AS rank
       FROM search_topics t
      WHERE ${conditions.join(" AND ")}
      ORDER BY ${keys.map((key) => `${key} DESC`).join(", ")}
      LIMIT ${limit}`,
    params.values,
  );
  const shown = rows.slice(0, request.limit);
  const last = shown.at(-1);
  return {
    hits: shown.map((row) => ({
      topicId: row.topic_id,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      state: row.state,
      firstPublishedAt: row.first_published_at.toISOString(),
      lastPublishedAt: row.last_published_at.toISOString(),
      countryIds: row.country_ids,
      referenceCount: row.reference_count,
    })),
    nextCursor:
      rows.length > request.limit && last ? cursorOf(sort, last) : null,
  };
}

const cut = (text: string) => text.slice(0, INDEXED_TEXT_MAX_LENGTH);

export function createPostgresTopicSearch(db: Queryable): TopicSearchIndex {
  return {
    async upsert(document: TopicSearchDocument) {
      const { text } = document;
      const { rowCount } = await db.query(
        `INSERT INTO search_topics AS current (
           topic_id, slug, title, summary, state, first_published_at,
           last_published_at, country_ids, category_id, tag_ids,
           individual_ids, evidence_kinds, languages, reference_count,
           document, version, indexed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::uuid[], $9, $10::uuid[],
           $11::uuid[], $12::varchar[], $13::varchar[], $14,
           setweight(to_tsvector(${CONFIG}, $15), 'A')
             || setweight(to_tsvector(${CONFIG}, $16), 'B')
             || setweight(to_tsvector(${CONFIG}, $17), 'C')
             || setweight(to_tsvector(${CONFIG}, $18), 'D'),
           $19, now())
         ON CONFLICT (topic_id) DO UPDATE SET
           slug = EXCLUDED.slug, title = EXCLUDED.title,
           summary = EXCLUDED.summary, state = EXCLUDED.state,
           first_published_at = EXCLUDED.first_published_at,
           last_published_at = EXCLUDED.last_published_at,
           country_ids = EXCLUDED.country_ids,
           category_id = EXCLUDED.category_id, tag_ids = EXCLUDED.tag_ids,
           individual_ids = EXCLUDED.individual_ids,
           evidence_kinds = EXCLUDED.evidence_kinds,
           languages = EXCLUDED.languages,
           reference_count = EXCLUDED.reference_count,
           document = EXCLUDED.document, version = EXCLUDED.version,
           indexed_at = EXCLUDED.indexed_at
         WHERE current.version <= EXCLUDED.version`,
        [
          document.topicId,
          document.slug,
          document.title,
          document.summary,
          document.state,
          document.firstPublishedAt,
          document.lastPublishedAt,
          document.countryIds,
          document.categoryId,
          document.tagIds,
          document.individualIds,
          document.evidenceKinds,
          document.languages,
          document.referenceCount,
          cut(text.title),
          cut(text.summary),
          cut(text.body),
          cut(text.evidence),
          document.version,
        ],
      );
      return rowCount === 1;
    },

    async remove(topicId, version) {
      await db.query(
        `DELETE FROM search_topics
          WHERE topic_id = $1
            AND ($2::timestamptz IS NULL OR version <= $2::timestamptz)`,
        [topicId, version],
      );
    },

    async indexedIds() {
      const { rows } = await db.query<{ topic_id: string }>(
        "SELECT topic_id::text AS topic_id FROM search_topics",
      );
      return rows.map((row) => row.topic_id);
    },

    async search(request) {
      const [page, counted] = await Promise.all([
        hitsOf(db, request),
        request.withFacets ? facetsOf(db, request) : null,
      ]);
      return {
        ...page,
        total: counted?.total ?? null,
        facets: counted?.facets ?? null,
      };
    },
  };
}
