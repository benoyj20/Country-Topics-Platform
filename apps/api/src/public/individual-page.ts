import { rows } from "@/array-rows";
import { relationId } from "@/audit";
import { loadPayload } from "@/payload-instance";
import type { Individual, Media } from "@/payload-types";

import { FILE_FIELDS, publicFile } from "./evidence";
import { anyNamed, backedStatements } from "./individuals";
import { namingTopics } from "./naming";
import { profileLinks } from "./profile-links";
import { byId, ids } from "./read";
import { TOPIC_LIST_LIMIT, topicList } from "./topic-lists";
import type { IndividualPage } from "./types";

// A public individual's page (read.ts).

type IndividualFields = Pick<
  Individual,
  | "id"
  | "name"
  | "slug"
  | "aliases"
  | "photo"
  | "links"
  | "wikidataId"
  | "statements"
>;

/** A public individual's page, or null when no public individual has the slug. */
export async function loadIndividualPage(
  slug: string,
): Promise<IndividualPage | null> {
  const payload = await loadPayload();
  const { docs } = await payload.find({
    collection: "individuals",
    where: { slug: { equals: slug } },
    select: {
      name: true,
      slug: true,
      aliases: true,
      photo: true,
      links: true,
      wikidataId: true,
      statements: true,
    },
    limit: 1,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  });
  const individual = docs[0] as IndividualFields | undefined;
  if (!individual) return null;
  const naming = await namingTopics(payload, [String(individual.id)]);
  if (!(await anyNamed(payload, naming))) return null;

  const [photos, topics, statements] = await Promise.all([
    byId<Media>(payload, "media", ids([individual.photo]), FILE_FIELDS),
    topicList(payload, naming, TOPIC_LIST_LIMIT),
    backedStatements(payload, [individual]),
  ]);
  const photo = photos.get(relationId(individual.photo) ?? "");
  return {
    name: individual.name,
    slug: individual.slug,
    aliases: rows(individual.aliases).map((alias) => alias.name),
    photo: photo ? publicFile(photo) : null,
    links: profileLinks(
      rows(individual.links).map(({ label, url }) => ({ label, url })),
      individual.wikidataId ?? null,
    ),
    statements: statements.get(String(individual.id)) ?? [],
    topics,
  };
}
