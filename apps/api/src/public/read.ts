import type { Payload, Where } from "payload";

import { relationId } from "@/audit";

import type { CountryLink } from "./types";

// The public read model: what visitors may see, loaded with the local API.
// Payload's own access rules keep these collections staff-only, so every
// query here overrides access and picks its fields itself; the visibility
// rules below are the whole of what is public.
//
// - A topic is public once published: visitors see its live version, never a
//   later draft. Archived topics keep their page but leave every list.
// - An individual is public while a published topic names them: in its list
//   of people, by a link in its text, or as the speaker of a snippet it uses
//   as evidence. Their page shows who they are, those topics, and only the
//   profile statements that carry their own evidence and confirmed sources
//   (statementIsBacked, ADR 0007). The bio and country roles are staff notes.
// - A file is also public while it is evidence for a statement shown on a
//   public individual's profile.
// - A file is public while a published topic uses it as evidence, or it is
//   the photo of a public individual.
//
// Each page's data is its own module, owned with its page (ADR 0015):
// topic-page.ts, individual-page.ts, country-page.ts, home-page.ts,
// files.ts for downloads, and browse.ts with browse-terms.ts for browsing.
// They are built from the shared modules (this file, topic-lists.ts,
// evidence.ts, individuals.ts, naming.ts, and profile-links.ts), never
// from each other; only cached.ts names them all.

export const PUBLISHED: Where = { _status: { equals: "published" } };
// `state` is set only by the server and is never empty, unlike `archived`.
export const LISTED: Where = {
  and: [PUBLISHED, { state: { in: ["published", "updated"] } }],
};
export const NEWEST_FIRST = ["-firstPublishedAt", "-id"];

export function ids(values: unknown[]): string[] {
  return [
    ...new Set(values.map(relationId).filter((id): id is string => !!id)),
  ];
}

/** Documents of a collection by id, with only the given fields. */
export async function byId<T extends { id: string }>(
  payload: Payload,
  collection: "countries" | "categories" | "tags" | "individuals" | "media",
  idList: string[],
  select: Record<string, true>,
): Promise<Map<string, T>> {
  if (idList.length === 0) return new Map();
  const { docs } = await payload.find({
    collection,
    where: { id: { in: idList } },
    select,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  return new Map((docs as unknown as T[]).map((doc) => [String(doc.id), doc]));
}

export type Named = { id: string; name: string; slug: string };

export async function countryLinks(
  payload: Payload,
  idList: string[],
): Promise<Map<string, CountryLink>> {
  const found = await byId<Named>(payload, "countries", idList, {
    name: true,
    slug: true,
  });
  return new Map(
    [...found].map(([id, { name, slug }]) => [id, { name, slug }]),
  );
}

export function linksOf<T>(map: Map<string, T>, idList: string[]): T[] {
  return idList.flatMap((id) => {
    const found = map.get(id);
    return found ? [found] : [];
  });
}
