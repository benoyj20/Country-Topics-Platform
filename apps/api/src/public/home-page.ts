import { loadPayload } from "@/payload-instance";

import { countryLinks, ids, LISTED } from "./read";
import { topicList } from "./topic-lists";
import type { HomePage } from "./types";

// The home page (read.ts).

const HOME_TOPIC_LIMIT = 12;
/** More than the countries in ISO 3166-1, so the home page lists them all. */
const COUNTRY_LIMIT = 300;

export async function loadHomePage(): Promise<HomePage> {
  const payload = await loadPayload();
  const [topics, { values }] = await Promise.all([
    topicList(payload, {}, HOME_TOPIC_LIMIT),
    payload.findDistinct({
      collection: "topics",
      field: "countries",
      where: LISTED,
      limit: COUNTRY_LIMIT,
      depth: 0,
      overrideAccess: true,
    }),
  ]);
  const countryIds = ids(
    values.map((value: Record<string, unknown>) => value.countries),
  );
  const countries = [
    ...(await countryLinks(payload, countryIds)).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));
  return { topics, countries };
}
