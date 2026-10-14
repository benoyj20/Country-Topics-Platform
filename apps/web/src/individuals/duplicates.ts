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
  /**
   * True when a name or alias being added is exactly another individual's: the
   * server refuses to save until the admin confirms a different person.
   */
  needsConfirmation: boolean;
};

export type DuplicateCandidate = {
  /** The name and aliases as they will be saved. */
  names: readonly string[];
  /** The name and aliases already saved, which were confirmed before. */
  previousNames?: readonly string[];
  wikidataId?: string | null;
  /** The individual being edited, which is not a duplicate of itself. */
  excludeId?: string | null;
  /** Skip the similar-spelling search (the save check needs exact matches only). */
  exactOnly?: boolean;
};

/** The distinct, non-empty name keys for a list of names. */
export function nameKeys(names: readonly string[]): string[] {
  return [...new Set(names.map(personNameKey).filter(Boolean))];
}

/**
 * Individuals who may be the same person: the same name or alias once case,
 * accents, punctuation, and word order are ignored; the same Wikidata item; or,
 * unless `exactOnly`, a similar spelling of the name or an alias. Exact matches
 * come first. Exact queries use `req`, and so its transaction.
 */
export async function findPossibleDuplicates(
  req: PayloadRequest,
  {
    names,
    previousNames = [],
    wikidataId,
    excludeId,
    exactOnly = false,
  }: DuplicateCandidate,
): Promise<PossibleDuplicate[]> {
  const keys = nameKeys(names);
  const previousKeys = new Set(nameKeys(previousNames));
  const newKeys = new Set(keys.filter((key) => !previousKeys.has(key)));
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
    select: {
      name: true,
      summary: true,
      nameKey: true,
      aliases: true,
      wikidataId: true,
    },
    limit: MAX_DUPLICATE_MATCHES,
    depth: 0,
    overrideAccess: true,
    req,
  });
  const matches: PossibleDuplicate[] = exact.docs.map((doc) => {
    const docKeys = [
      doc.nameKey,
      ...(doc.aliases ?? []).map((alias) => alias.key),
    ].filter((key): key is string => Boolean(key));
    return {
      id: String(doc.id),
      name: doc.name,
      summary: doc.summary ?? null,
      matchedOn:
        wikidataId && doc.wikidataId === wikidataId
          ? "wikidata"
          : doc.nameKey && keys.includes(doc.nameKey)
            ? "name"
            : "alias",
      needsConfirmation: docKeys.some((key) => newKeys.has(key)),
    };
  });

  const room = MAX_DUPLICATE_MATCHES - matches.length;
  if (exactOnly || keys.length === 0 || room <= 0) return matches;
  const seen = new Set(matches.map((match) => match.id));
  const similarIds = (
    await similarlyNamedIds(req, keys, excludeId, room + seen.size)
  )
    .filter((id) => !seen.has(id))
    .slice(0, room);
  if (similarIds.length === 0) return matches;

  const similar = await req.payload.find({
    collection: "individuals",
    where: { id: { in: similarIds } },
    select: { name: true, summary: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  });
  const byId = new Map(similar.docs.map((doc) => [String(doc.id), doc]));
  for (const id of similarIds) {
    const doc = byId.get(id);
    if (doc) {
      matches.push({
        id,
        name: doc.name,
        summary: doc.summary ?? null,
        matchedOn: "similar name",
        needsConfirmation: false,
      });
    }
  }
  return matches;
}

/**
 * Ids of individuals whose name or alias key is similar to one of `keys`, most
 * similar first, in one query. `%` finds candidates through the trigram
 * indexes; the threshold then keeps the close ones.
 */
async function similarlyNamedIds(
  req: PayloadRequest,
  keys: readonly string[],
  excludeId: string | null | undefined,
  limit: number,
): Promise<string[]> {
  const { drizzle } = req.payload.db as unknown as PostgresAdapter;
  const keyList = sql`ARRAY[${sql.join(
    keys.map((key) => sql`${key}`),
    sql`, `,
  )}]::text[]`;
  const notSelf = excludeId ? sql`AND id <> ${excludeId}::uuid` : sql``;
  const result = await drizzle.execute<{ id: string }>(sql`
    SELECT id FROM (
      SELECT i.id, similarity(i.name_key, k.key) AS score
        FROM unnest(${keyList}) AS k(key)
        JOIN individuals i ON i.name_key % k.key
      UNION ALL
      SELECT a._parent_id AS id, similarity(a.key, k.key) AS score
        FROM unnest(${keyList}) AS k(key)
        JOIN individuals_aliases a ON a.key % k.key
    ) AS candidates
    WHERE score >= ${SIMILAR_NAME_THRESHOLD} ${notSelf}
    GROUP BY id
    ORDER BY max(score) DESC
    LIMIT ${limit}
  `);
  return result.rows.map((row) => String(row.id));
}

/**
 * Serialises saves that add the same name keys, so two admins (or a double
 * click) cannot both pass the duplicate check before either is committed. The
 * locks belong to the request's transaction and end with it.
 */
export async function lockNameKeys(
  req: PayloadRequest,
  keys: readonly string[],
): Promise<void> {
  const adapter = req.payload.db as unknown as PostgresAdapter;
  const transactionID = await req.transactionID;
  const session =
    transactionID === undefined ? undefined : adapter.sessions[transactionID];
  if (!session) return;
  // A fixed order, so two saves never wait on each other's locks.
  for (const key of [...keys].sort()) {
    await session.db.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`individual-name:${key}`}))`,
    );
  }
}
