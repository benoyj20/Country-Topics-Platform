import { unstable_cache } from "next/cache";
import { cache } from "react";

import {
  PUBLIC_REVALIDATE_S,
  PUBLIC_TAGS,
  type PublicTag,
} from "@/public-cache";

import {
  loadBrowseTerms,
  loadCountryPage,
  loadHomePage,
  loadIndividualPage,
  loadPublicFile,
  loadTopicPage,
} from "./content";

// The public read model, cached between requests and tagged with every
// collection each loader reads, so purging a collection's tag refreshes the
// data and the pages rendered from it (Next.js gives a page the tags of the
// data it used). React's cache shares one load between a page and its
// metadata within a request.

function cached<Args extends string[], Result>(
  name: string,
  load: (...args: Args) => Promise<Result>,
  tags: PublicTag[],
) {
  return cache(
    unstable_cache(load, ["public", name], {
      tags,
      revalidate: PUBLIC_REVALIDATE_S,
    }),
  );
}

const T = PUBLIC_TAGS;

export const topicPage = cached("topic-page", loadTopicPage, [
  T.topics,
  T.individuals,
  T.countries,
  T.categories,
  T.tags,
  T.snippets,
  T.references,
  T.media,
]);

export const individualPage = cached("individual-page", loadIndividualPage, [
  T.individuals,
  T.topics,
  T.countries,
  T.snippets,
  T.media,
  T.references,
]);

export const countryPage = cached("country-page", loadCountryPage, [
  T.countries,
  T.topics,
  T.individuals,
]);

export const homePage = cached("home-page", loadHomePage, [
  T.topics,
  T.countries,
]);

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
