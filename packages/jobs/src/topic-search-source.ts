import { type EvidenceKind, richTextPlainText } from "@countrytopics/domain";
import type { TopicSearchDocument } from "@countrytopics/search";
import type { Pool } from "pg";

import type { SearchSourceChange, TopicSearchSource } from "./search-jobs.ts";

// Search documents built from the tables of the web app's Payload
// collections, as the worker's other stores read them (content-store.ts).
// The main "topics" row is the live version: draft saves go to the versions
// table only. What a document holds mirrors what the public pages show
// (apps/web/src/public/content.ts):
// - a topic is listed while published and not archived;
// - it names its people, the individuals its text links to
//   (linkedIndividuals), and the speakers of the snippets it uses;
// - an evidence row counts only while its file, snippet, or address is
//   there, and only a clip's own transcript lines are public;
// - its comment count includes replies (ADR 0009); votes do not change
//   comment rows' updated_at, so they never re-index a topic.
// The web app's integration tests compare the two.
//
// A document's version is the latest updated_at of the topic and every row
// it reads here. Each table below has a hook in the web app that re-indexes
// the topics showing a row when a field read here changes
// (apps/web/src/search-index.ts); a field added here needs its hook to
// watch it too. The hourly rebuild catches anything missed.

const LISTED = `t._status = 'published' AND t.state IN ('published', 'updated')`;

/** The tables whose saves can change a search document. */
export const SEARCH_SOURCE_TABLES = [
  "topics",
  "individuals",
  "countries",
  "categories",
  "tags",
  "snippets",
  "media",
  "comments",
] as const;

type TopicRow = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  body: unknown;
  listed: boolean;
  state: string;
  first_published_at: Date | null;
  last_published_at: Date | null;
  updated_at: Date;
  version: Date;
  category_id: string | null;
  category_name: string | null;
  country_ids: string[];
  country_names: string[];
  tag_ids: string[];
  tag_names: string[];
  individual_ids: string[];
  individual_names: string[];
  evidence_kinds: EvidenceKind[];
  languages: string[];
  evidence_text: string;
  reference_count: number;
  comment_count: number;
};

const TOPIC_ROWS = `
SELECT t.id::text AS id, t.slug, t.title, t.summary, t.body,
       (${LISTED}) AS listed, t.state::text AS state,
       t.first_published_at, t.last_published_at, t.updated_at,
       GREATEST(t.updated_at, category.updated_at, countries.updated_at,
                tags.updated_at, named.updated_at, evidence.updated_at,
                discussion.updated_at)
         AS version,
       t.category_id::text AS category_id, category.name AS category_name,
       COALESCE(countries.ids, '{}') AS country_ids,
       COALESCE(countries.names, '{}') AS country_names,
       COALESCE(tags.ids, '{}') AS tag_ids,
       COALESCE(tags.names, '{}') AS tag_names,
       COALESCE(named.ids, '{}') AS individual_ids,
       COALESCE(named.names, '{}') AS individual_names,
       COALESCE(evidence.kinds, '{}') AS evidence_kinds,
       COALESCE(evidence.languages, '{}') AS languages,
       COALESCE(evidence.text, '') AS evidence_text,
       (SELECT count(*)::int FROM topics_references cited
         WHERE cited._parent_id = t.id AND cited.reference_id IS NOT NULL)
         AS reference_count,
       COALESCE(discussion.count, 0) AS comment_count
  FROM topics t
  LEFT JOIN categories category ON category.id = t.category_id
  LEFT JOIN LATERAL (
    SELECT array_agg(c.id::text ORDER BY r."order") AS ids,
           array_agg(c.name ORDER BY r."order") AS names,
           max(c.updated_at) AS updated_at
      FROM topics_rels r JOIN countries c ON c.id = r.countries_id
     WHERE r.parent_id = t.id AND r.path = 'countries'
  ) countries ON TRUE
  LEFT JOIN LATERAL (
    SELECT array_agg(g.id::text ORDER BY r."order") AS ids,
           array_agg(g.name ORDER BY r."order") AS names,
           max(g.updated_at) AS updated_at
      FROM topics_rels r JOIN tags g ON g.id = r.tags_id
     WHERE r.parent_id = t.id AND r.path = 'tags'
  ) tags ON TRUE
  LEFT JOIN LATERAL (
    SELECT array_agg(i.id::text ORDER BY i.id) AS ids,
           array_agg(concat_ws(' ', i.name, aliases.names) ORDER BY i.id) AS names,
           max(i.updated_at) AS updated_at
      FROM individuals i
      LEFT JOIN LATERAL (
        SELECT string_agg(a.name, ' ' ORDER BY a._order) AS names
          FROM individuals_aliases a WHERE a._parent_id = i.id
      ) aliases ON TRUE
     WHERE i.id IN (
       SELECT p.individual_id FROM topics_people p WHERE p._parent_id = t.id
       UNION
       SELECT r.individuals_id FROM topics_rels r
        WHERE r.parent_id = t.id AND r.path = 'linkedIndividuals'
       UNION
       SELECT s.speaker_id FROM topics_evidence e
         JOIN snippets s ON s.id = e.snippet_id
        WHERE e._parent_id = t.id AND e.kind = 'snippet')
  ) named ON TRUE
  LEFT JOIN LATERAL (
    SELECT array_agg(DISTINCT ev.kind) FILTER (WHERE ev.shown) AS kinds,
           array_agg(DISTINCT lower(ev.language))
             FILTER (WHERE ev.shown AND ev.language IS NOT NULL) AS languages,
           string_agg(ev.text, E'\\n' ORDER BY ev._order)
             FILTER (WHERE ev.shown) AS text,
           max(ev.updated_at) AS updated_at
      FROM (
        SELECT e._order, e.kind::text AS kind, s.language,
               concat_ws(' ', e.title, s.caption, lines.text) AS text,
               GREATEST(s.updated_at, m.updated_at) AS updated_at,
               (e.kind = 'snippet' AND s.id IS NOT NULL)
                 OR (e.kind = 'link' AND COALESCE(e.url, '') <> '')
                 OR (e.kind IN ('image', 'document')
                     AND m.filename IS NOT NULL AND m.mime_type IS NOT NULL)
                 AS shown
          FROM topics_evidence e
          LEFT JOIN snippets s ON s.id = e.snippet_id AND e.kind = 'snippet'
          LEFT JOIN media m
            ON m.id = e.file_id AND e.kind IN ('image', 'document')
          LEFT JOIN LATERAL (
            SELECT string_agg(x.text, ' ' ORDER BY x._order) AS text
              FROM snippets_transcript x WHERE x._parent_id = s.id
          ) lines ON TRUE
         WHERE e._parent_id = t.id
      ) ev
  ) evidence ON TRUE
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS count, max(c.updated_at) AS updated_at
      FROM comments c WHERE c.topic_id = t.id
  ) discussion ON TRUE
 WHERE t.id = ANY($1::uuid[])`;

/** The search document of a listed topic; null for any other topic. */
export function topicDocument(row: TopicRow): TopicSearchDocument | null {
  if (!row.listed || !row.first_published_at) return null;
  const firstPublishedAt = row.first_published_at.toISOString();
  return {
    topicId: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary ?? "",
    state: row.state === "updated" ? "updated" : "published",
    firstPublishedAt,
    lastPublishedAt: row.last_published_at?.toISOString() ?? firstPublishedAt,
    countryIds: row.country_ids,
    categoryId: row.category_id,
    tagIds: row.tag_ids,
    individualIds: row.individual_ids,
    evidenceKinds: row.evidence_kinds,
    languages: row.languages,
    referenceCount: row.reference_count,
    commentCount: row.comment_count,
    text: {
      title: row.title,
      summary: [
        row.summary ?? "",
        ...row.country_names,
        row.category_name ?? "",
        ...row.tag_names,
        ...row.individual_names,
      ]
        .filter(Boolean)
        .join("\n"),
      body: richTextPlainText(row.body),
      evidence: row.evidence_text,
    },
    version: row.version.toISOString(),
  };
}

export function createTopicSearchSource(pool: Pool): TopicSearchSource {
  return {
    async listedTopicIds() {
      const { rows } = await pool.query<{ id: string }>(
        `SELECT t.id::text AS id FROM topics t WHERE ${LISTED}`,
      );
      return rows.map((row) => row.id);
    },

    async topicStates(topicIds) {
      const { rows } = await pool.query<TopicRow>(TOPIC_ROWS, [topicIds]);
      return new Map(
        rows.map((row) => [
          row.id,
          {
            document: topicDocument(row),
            version: row.version.toISOString(),
          },
        ]),
      );
    },

    async changeVisible({ table, id, updatedAt }: SearchSourceChange) {
      // The table name comes from the fixed list, never from the job as text.
      const name = SEARCH_SOURCE_TABLES.find((known) => known === table);
      if (!name) return false;
      const { rows } = await pool.query<{ visible: boolean }>(
        `SELECT updated_at >= $2::timestamptz AS visible FROM "${name}" WHERE id = $1`,
        [id, updatedAt],
      );
      return rows[0]?.visible ?? false;
    },
  };
}
