import { statementIsBacked } from "@countrytopics/domain";
import type { Payload, Where } from "payload";

import { rows } from "@/array-rows";
import { relationId } from "@/audit";
import { loadPayload } from "@/payload-instance";
import type { Individual } from "@/payload-types";

import { publicReference, referencesById, resolveEvidence } from "./evidence";
import { byId, ids, type Named, PUBLISHED } from "./read";
import type { ProfileStatement, PublicEvidence } from "./types";

// Which individuals are public, and what of their profiles visitors see
// (read.ts).

/**
 * Which of the individuals a published topic names, in any of the three
 * ways (namingTopics), so that their pages exist.
 */
export async function publicIndividualIds(
  payload: Payload,
  candidates: string[],
): Promise<Set<string>> {
  const wanted = new Set(candidates);
  if (wanted.size === 0) return new Set();
  const { docs: spoken } = await payload.find({
    collection: "snippets",
    where: { speaker: { in: [...wanted] } },
    select: { speaker: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  const speakerOf = new Map(
    spoken.map((snippet) => [String(snippet.id), relationId(snippet.speaker)]),
  );
  const naming: Where[] = [
    { "people.individual": { in: [...wanted] } },
    { linkedIndividuals: { in: [...wanted] } },
  ];
  if (speakerOf.size > 0) {
    naming.push({ "evidence.snippet": { in: [...speakerOf.keys()] } });
  }
  const { docs } = await payload.find({
    collection: "topics",
    draft: false,
    where: { and: [PUBLISHED, { or: naming }] },
    select: { people: true, linkedIndividuals: true, evidence: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  const named = docs.flatMap((topic) => [
    ...rows(topic.people).map((row) => relationId(row.individual)),
    ...(topic.linkedIndividuals ?? []).map(relationId),
    ...rows(topic.evidence).map((row) =>
      speakerOf.get(relationId(row.snippet) ?? ""),
    ),
  ]);
  return new Set(
    named.filter(
      (id): id is string => typeof id === "string" && wanted.has(id),
    ),
  );
}

/** Whether a published topic names any of the individuals. */
export async function anyNamed(
  payload: Payload,
  naming: Where,
): Promise<boolean> {
  const { totalDocs } = await payload.count({
    collection: "topics",
    where: { and: [PUBLISHED, naming] },
    overrideAccess: true,
  });
  return totalDocs > 0;
}

export type WithStatements = Pick<Individual, "id" | "statements">;

/**
 * The statements on individuals' profiles that visitors may see, by
 * individual: each must carry its own evidence and sources and pass the
 * topic publishing check (statementIsBacked). The others are left out one by
 * one. Every individual's evidence and references load in one batch.
 */
export async function backedStatements(
  payload: Payload,
  individuals: WithStatements[],
): Promise<Map<string, ProfileStatement[]>> {
  const statements = individuals.flatMap((individual) =>
    rows(individual.statements).map((statement) => ({
      owner: String(individual.id),
      statement,
    })),
  );
  const evidenceRows = statements.flatMap(({ statement }) =>
    rows(statement.evidence),
  );
  const [resolved, references] = await Promise.all([
    resolveEvidence(payload, evidenceRows),
    referencesById(
      payload,
      ids(
        statements.flatMap(({ statement }) =>
          rows(statement.sources).map((source) => source.reference),
        ),
      ),
    ),
  ]);

  // A snippet's speaker is named on a profile only when they have a page
  // of their own, or are the person the profile is about.
  const owners = new Set(
    individuals.map((individual) => String(individual.id)),
  );
  const publicSpeakers = await publicIndividualIds(
    payload,
    resolved.flatMap(({ speakerId }) =>
      speakerId && !owners.has(speakerId) ? [speakerId] : [],
    ),
  );

  const result = new Map<string, ProfileStatement[]>(
    individuals.map((individual) => [String(individual.id), []]),
  );
  let position = 0;
  for (const { owner, statement } of statements) {
    const evidence = resolved.slice(
      position,
      position + rows(statement.evidence).length,
    );
    position += evidence.length;
    const cited = rows(statement.sources).map((source) => ({
      source,
      reference: references.get(relationId(source.reference) ?? ""),
    }));
    const backed = statementIsBacked({
      evidenceCount: evidence.filter(({ item }) => item).length,
      references: cited.map(({ reference }) => ({
        title: reference?.title ?? "Unknown reference",
        checkStatus: reference?.checkStatus ?? null,
      })),
      snippets: evidence.flatMap(({ check }) => (check ? [check] : [])),
    });
    if (!backed) continue;
    result.get(owner)?.push({
      text: statement.text,
      evidence: evidence.flatMap(({ item, speakerId }): PublicEvidence[] => {
        if (!item) return [];
        const named =
          !speakerId || speakerId === owner || publicSpeakers.has(speakerId);
        return item.kind === "snippet" && !named
          ? [{ ...item, snippet: { ...item.snippet, speaker: null } }]
          : [item];
      }),
      sources: cited.flatMap(({ source, reference }) =>
        reference
          ? [
              {
                passage: source.passage,
                locator: source.locator || null,
                reference: publicReference(reference),
              },
            ]
          : [],
      ),
    });
  }
  return result;
}

/**
 * Individuals by id, with their names and slugs. Only for ids from the
 * search index, which names only people that listed topics name.
 */
export async function loadIndividualLinks(ids: string[]): Promise<Named[]> {
  const found = await byId<Named>(await loadPayload(), "individuals", ids, {
    name: true,
    slug: true,
  });
  return [...found.values()].map(({ id, name, slug }) => ({
    id: String(id),
    name,
    slug,
  }));
}

/**
 * The public individuals among these slugs: a slug typed into a URL must
 * not reveal the name of someone who has no page.
 */
export async function loadPublicIndividualLinks(
  slugs: string[],
): Promise<Named[]> {
  if (slugs.length === 0) return [];
  const payload = await loadPayload();
  const { docs } = await payload.find({
    collection: "individuals",
    where: { slug: { in: slugs } },
    select: { name: true, slug: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  const visible = await publicIndividualIds(
    payload,
    docs.map((doc) => String(doc.id)),
  );
  return docs
    .filter((doc) => visible.has(String(doc.id)))
    .map((doc) => ({ id: String(doc.id), name: doc.name, slug: doc.slug }));
}
