import type { Payload, Where } from "payload";

import type { Topic } from "@/payload-types";

import { countryLinks, ids, LISTED, linksOf, NEWEST_FIRST } from "./read";
import type { LimitedList, TopicSummary } from "./types";

// Lists of published topics, as the public pages show them (read.ts).

/** Topics in one list on a page; filters and paging arrive with search. */
export const TOPIC_LIST_LIMIT = 50;

export const SUMMARY_FIELDS = {
  slug: true,
  title: true,
  summary: true,
  state: true,
  firstPublishedAt: true,
  lastPublishedAt: true,
  countries: true,
} as const;

export type SummaryFields = Pick<
  Topic,
  | "id"
  | "slug"
  | "title"
  | "summary"
  | "state"
  | "firstPublishedAt"
  | "lastPublishedAt"
  | "countries"
>;

function publicState(state: Topic["state"]): TopicSummary["state"] {
  return state === "archived" || state === "updated" ? state : "published";
}

export async function summaries(
  payload: Payload,
  topics: SummaryFields[],
): Promise<TopicSummary[]> {
  const countries = await countryLinks(
    payload,
    ids(topics.flatMap((topic) => topic.countries ?? [])),
  );
  return topics.map((topic) => ({
    slug: topic.slug,
    title: topic.title,
    summary: topic.summary,
    state: publicState(topic.state),
    firstPublishedAt: topic.firstPublishedAt ?? null,
    lastPublishedAt: topic.lastPublishedAt ?? null,
    countries: linksOf(countries, ids(topic.countries ?? [])),
  }));
}

/** The fields that say whom a topic names. */
type NamingFields = Pick<Topic, "people" | "linkedIndividuals" | "evidence">;

/**
 * Listed topics matching `where`, newest first, up to `limit`, with the
 * documents themselves; `withNaming` also loads whom each topic names.
 */
export async function listedTopics(
  payload: Payload,
  where: Where,
  limit: number,
  withNaming = false,
) {
  const { docs } = await payload.find({
    collection: "topics",
    draft: false,
    where: { and: [LISTED, where] },
    select: withNaming
      ? {
          ...SUMMARY_FIELDS,
          people: true,
          linkedIndividuals: true,
          evidence: true,
        }
      : SUMMARY_FIELDS,
    sort: NEWEST_FIRST,
    // One more than shown says whether there are more.
    limit: limit + 1,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  });
  // Payload types the result by one branch of the select; the naming fields
  // are there exactly when withNaming asked for them.
  const shown = docs.slice(0, limit) as (SummaryFields &
    Partial<NamingFields>)[];
  const list: LimitedList<TopicSummary> = {
    items: await summaries(payload, shown),
    more: docs.length > limit,
  };
  return { list, docs: shown };
}

/** Listed topics matching `where`, newest first, up to `limit`. */
export async function topicList(
  payload: Payload,
  where: Where,
  limit: number,
): Promise<LimitedList<TopicSummary>> {
  return (await listedTopics(payload, where, limit)).list;
}
