import { unstable_cache } from "next/cache";

import { PAGE_DATA_TAGS } from "@countrytopics/contracts";

import {
  PUBLIC_REVALIDATE_S,
  PUBLIC_TAGS,
  type PublicTag,
} from "@/public-cache";

import { noteLoaded, noteRead } from "./cache-report";
import { loadBrowseTerms } from "./browse-terms";
import { loadCountryPage } from "./country-page";
import { loadPublicFile } from "./files";
import { loadHomePage } from "./home-page";
import { loadIndividualPage } from "./individual-page";
import { loadTopicPage } from "./topic-page";

// The public read model, cached between requests and tagged with every
// collection each loader reads, so purging a collection's tag refreshes the
// data, here and in the frontend's copy.

function cached<Args extends string[], Result>(
  name: string,
  load: (...args: Args) => Promise<Result>,
  tags: readonly PublicTag[],
) {
  const read = unstable_cache(
    async (...args: Args) => noteLoaded(await load(...args)),
    ["public", name],
    { tags: [...tags], revalidate: PUBLIC_REVALIDATE_S },
  );
  return (...args: Args): Promise<Result> => {
    noteRead();
    return read(...args);
  };
}

const T = PUBLIC_TAGS;

// The page loaders' tags are the frontend's too, for the same data over
// /api/v1/pages/* (@countrytopics/contracts).
export const topicPage = cached(
  "topic-page",
  loadTopicPage,
  PAGE_DATA_TAGS.topic,
);

export const individualPage = cached(
  "individual-page",
  loadIndividualPage,
  PAGE_DATA_TAGS.individual,
);

export const countryPage = cached(
  "country-page",
  loadCountryPage,
  PAGE_DATA_TAGS.country,
);

export const homePage = cached("home-page", loadHomePage, PAGE_DATA_TAGS.home);

export const publicFile = cached("public-file", loadPublicFile, [
  T.media,
  T.topics,
  T.individuals,
  T.snippets,
  // Whether a profile statement that uses the file is shown.
  T.references,
]);

export const browseTerms = cached("browse-terms", loadBrowseTerms, [
  T.countries,
  T.categories,
  T.tags,
]);
