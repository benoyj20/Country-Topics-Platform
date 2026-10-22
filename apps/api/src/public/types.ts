import type { CountryLink, TermLink } from "@countrytopics/contracts";

// What the public pages show. The types, and the schemas that check them,
// live in @countrytopics/contracts, which the frontend shares (ADR 0014);
// they are re-exported here for the site's code.

export type {
  BrowseFacets,
  BrowseFacetValue,
  BrowseResult,
  BrowseTopic,
  CitedReference,
  CountryLink,
  CountryPage,
  HomePage,
  IndividualLink,
  IndividualPage,
  LimitedList,
  ProfileSource,
  ProfileStatement,
  PublicEvidence,
  PublicFile,
  PublicReference,
  PublicSnippet,
  PublicTopicState,
  TermLink,
  TopicChangeEntry,
  TopicPage,
  TopicSummary,
} from "@countrytopics/contracts";

type Labelled<T> = T & { id: string };

/** Every country, category, and tag browsing can filter by, with its id. */
export type BrowseTerms = {
  countries: Labelled<CountryLink & { region: string | null }>[];
  categories: Labelled<TermLink>[];
  tags: Labelled<TermLink>[];
};
