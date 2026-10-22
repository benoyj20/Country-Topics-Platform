import { rows } from "@/array-rows";
import { loadPayload } from "@/payload-instance";

import { byId, ids, type Named } from "./read";
import { listedTopics, TOPIC_LIST_LIMIT } from "./topic-lists";
import type { CountryPage, IndividualLink } from "./types";

// A country's page (read.ts).

const PEOPLE_LIMIT = 100;

/** A country's page; every ISO 3166-1 country has one, with or without topics. */
export async function loadCountryPage(
  slug: string,
): Promise<CountryPage | null> {
  const payload = await loadPayload();
  const { docs } = await payload.find({
    collection: "countries",
    where: { slug: { equals: slug } },
    select: { name: true, slug: true, region: true, subregion: true },
    limit: 1,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  });
  const country = docs[0];
  if (!country) return null;

  // The people the listed topics name, in any of the three ways, taken from
  // the topics themselves rather than from the country entries on profiles,
  // which are staff notes.
  const { list: topics, docs: listed } = await listedTopics(
    payload,
    { countries: { equals: country.id } },
    TOPIC_LIST_LIMIT,
    true,
  );
  const snippetIds = ids(
    listed.flatMap((topic) => rows(topic.evidence).map((row) => row.snippet)),
  );
  const { docs: quoted } =
    snippetIds.length > 0
      ? await payload.find({
          collection: "snippets",
          where: { id: { in: snippetIds } },
          select: { speaker: true },
          depth: 0,
          pagination: false,
          overrideAccess: true,
        })
      : { docs: [] };
  const individuals = await byId<Named>(
    payload,
    "individuals",
    ids([
      ...listed.flatMap((topic) => [
        ...rows(topic.people).map((row) => row.individual),
        ...(topic.linkedIndividuals ?? []),
      ]),
      ...quoted.map((snippet) => snippet.speaker),
    ]),
    { name: true, slug: true },
  );
  const people: IndividualLink[] = [...individuals.values()]
    .map(({ name, slug: individualSlug }) => ({ name, slug: individualSlug }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, PEOPLE_LIMIT);

  return {
    name: country.name,
    slug: country.slug,
    region: country.region ?? null,
    subregion: country.subregion ?? null,
    topics,
    people,
  };
}
