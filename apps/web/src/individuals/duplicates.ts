import { personNameKey } from "@countrytopics/domain";
import { type PostgresAdapter, sql } from "@payloadcms/db-postgres";
import type { PayloadRequest, Where } from "payload";

export const MAX_DUPLICATE_MATCHES = 10;
// pg_trgm similarity between name keys (0 to 1) above which a different
// spelling is worth showing, such as a transliteration or a typo.
const SIMILAR_NAME_THRESHOLD = 0.6;

export type DuplicateMatch = "wikidata" | "name" | "alias" | "similar name";

export type PossibleDuplicate = {
  id: string;
  name: string;
  summary: string | null;
  matchedOn: DuplicateMatch;
};

export type DuplicateCandidate = {
  /** The name and any aliases being entered. */
  names: readonly string[];
  wikidataId?: string | null;
  /** The individual being edited, which is not a duplicate of itself. */
  excludeId?: string | null;
};

/** The distinct, non-empty name keys for a list of names. */
export function nameKeys(names: readonly string[]): string[] {
  return [...new Set(names.map(personNameKey).filter(Boolean))];
}

/**
 * Individuals who may be the same person: the same name or alias once case,
 * accents, punctuation, and word order are ignored; the same Wikidata item; or
 * a similar spelling of the name or an alias. Exact matches come first.
 */
export async function findPossibleDuplicates(
  req: PayloadRequest,
  { names, wikidataId, excludeId }: DuplicateCandidate,
): Promise<PossibleDuplicate[]> {
  const keys = nameKeys(names);
  const matchers: Where[] = [];
  if (keys.length > 0) {
    matchers.push({ nameKey: { in: keys } }, { "aliases.key": { in: keys } });
  }
  if (wikidataId) matchers.push({ wikidataId: { equals: wikidataId } });
  if (matchers.length === 0) return [];

  const notSelf: Where[] = excludeId ? [{ id: { not_equals: excludeId } }] : [];
  const exact = await req.payload.find({
    collection: "individuals",
    where: { and: [...notSelf, { or: matchers }] },
    select: { name: true, summary: true, nameKey: true, wikidataId: true },
    limit: MAX_DUPLICATE_MATCHES,
    depth: 0,
    overrideAccess: true,
    req,
  });
  const matches: PossibleDuplicate[] = exact.docs.map((doc) => ({
    id: String(doc.id),
    name: doc.name,
    summary: doc.summary ?? null,
    matchedOn:
      wikidataId && doc.wikidataId === wikidataId
        ? "wikidata"
        : doc.nameKey && keys.includes(doc.nameKey)
          ? "name"
          : "alias",
  }));

  const room = MAX_DUPLICATE_MATCHES - matches.length;
  if (keys.length === 0 || room <= 0) return matches;
  const seen = new Set(matches.map((match) => match.id));
  if (excludeId) seen.add(excludeId);
  const similarIds = await similarlyNamedIds(req, keys, room + seen.size);
  const newIds = similarIds.filter((id) => !seen.has(id)).slice(0, room);
  if (newIds.length === 0) return matches;

  const similar = await req.payload.find({
    collection: "individuals",
    where: { id: { in: newIds } },
    select: { name: true, summary: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  });
  const byId = new Map(similar.docs.map((doc) => [String(doc.id), doc]));
  for (const id of newIds) {
    const doc = byId.get(id);
    if (doc) {
      matches.push({
        id,
        name: doc.name,
        summary: doc.summary ?? null,
        matchedOn: "similar name",
      });
    }
  }
  return matches;
}

/**
 * Ids of individuals whose name or alias key is similar to one of `keys`, most
 * similar first. `%` finds candidates through the trigram indexes; the
 * threshold then keeps the close ones.
 */
async function similarlyNamedIds(
  req: PayloadRequest,
  keys: readonly string[],
  limit: number,
): Promise<string[]> {
  const { drizzle } = req.payload.db as unknown as PostgresAdapter;
  const scores = new Map<string, number>();
  for (const key of keys) {
    const result = await drizzle.execute<{ id: string; score: number }>(sql`
      SELECT id, max(score) AS score FROM (
        SELECT id, similarity(name_key, ${key}) AS score
          FROM individuals WHERE name_key % ${key}
        UNION ALL
        SELECT _parent_id AS id, similarity(key, ${key}) AS score
          FROM individuals_aliases WHERE key % ${key}
      ) AS candidates
      WHERE score >= ${SIMILAR_NAME_THRESHOLD}
      GROUP BY id
      ORDER BY score DESC
      LIMIT ${limit}
    `);
    for (const row of result.rows) {
      const id = String(row.id);
      scores.set(id, Math.max(scores.get(id) ?? 0, Number(row.score)));
    }
  }
  return [...scores]
    .sort(([, a], [, b]) => b - a)
    .map(([id]) => id)
    .slice(0, limit);
}
