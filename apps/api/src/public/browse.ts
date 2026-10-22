import {
  type BrowseQuery,
  effectiveSort,
  type ListKey,
} from "@countrytopics/contracts";
import { EVIDENCE_KINDS, EVIDENCE_KIND_LABELS } from "@countrytopics/domain";
import {
  type FacetCount,
  SEARCH_PAGE_SIZE,
  type TopicFilters,
} from "@countrytopics/search/topic-search";

import { topicSearch } from "@/search";

import { browseTerms } from "./cached";
import { loadIndividualLinks, loadPublicIndividualLinks } from "./individuals";
import type {
  BrowseFacetValue,
  BrowseFacets,
  BrowseResult,
  CountryLink,
} from "./types";

// Browsing and search for visitors (ADR 0008): the search index finds the
// topics; the read model turns the URL's slugs into the index's ids and the
// ids it returns into names. Everything in the index is a listed topic, and
// everyone it names is public, so its ids are safe to name.

/** No record has this id: a slug nobody has still narrows its facet to nothing. */
const NO_MATCH = "00000000-0000-0000-0000-000000000000";

type Named = { id: string; slug: string; name: string };

function idsFor(slugs: string[], records: Named[]): string[] {
  const bySlug = new Map(records.map((record) => [record.slug, record.id]));
  return [...new Set(slugs.map((slug) => bySlug.get(slug) ?? NO_MATCH))];
}

const languageNames = new Intl.DisplayNames(["en"], { type: "language" });

/** A language's English name, such as "Swahili" for sw; the code if unknown. */
export function languageLabel(code: string): string {
  try {
    return languageNames.of(code) ?? code;
  } catch {
    return code;
  }
}

type Option = { value: string; label: string; group: string | null };

/**
 * A facet's values: those the index counted, named, then any chosen value
 * it did not list, so a chosen filter always stays visible.
 */
function facetValues(
  counts: FacetCount[],
  byIndexValue: Map<string, Option>,
  chosen: string[],
  byUrlValue: Map<string, Option>,
): BrowseFacetValue[] {
  const values = new Map<string, BrowseFacetValue>();
  for (const { value, count } of counts) {
    const option = byIndexValue.get(value);
    if (option) values.set(option.value, { ...option, count });
  }
  for (const value of chosen) {
    const option = byUrlValue.get(value);
    if (option && !values.has(value)) {
      values.set(value, { ...option, count: null });
    }
  }
  return [...values.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function options(records: (Named & { region?: string | null })[]) {
  const byId = new Map<string, Option>();
  const bySlug = new Map<string, Option>();
  for (const record of records) {
    const option = {
      value: record.slug,
      label: record.name,
      group: record.region ?? null,
    };
    byId.set(record.id, option);
    bySlug.set(record.slug, option);
  }
  return { byId, bySlug };
}

/** Options keyed by their own value (evidence kinds, languages). */
function codeOptions(codes: string[], label: (code: string) => string) {
  const byCode = new Map(
    codes.map((code) => [
      code,
      { value: code, label: label(code), group: null },
    ]),
  );
  return { byId: byCode, bySlug: byCode };
}

/**
 * One page of listed topics for a browse request. The first page (no
 * cursor) also counts the total and each facet's values.
 */
export async function browseTopics(
  query: BrowseQuery,
  cursor: string | null,
): Promise<BrowseResult> {
  const [terms, chosenPeople] = await Promise.all([
    browseTerms(),
    loadPublicIndividualLinks(query.person),
  ]);
  const filters: TopicFilters = {
    countryIds:
      query.country.length > 0 ? idsFor(query.country, terms.countries) : [],
    categoryIds:
      query.category.length > 0 ? idsFor(query.category, terms.categories) : [],
    tagIds: query.tag.length > 0 ? idsFor(query.tag, terms.tags) : [],
    individualIds:
      query.person.length > 0 ? idsFor(query.person, chosenPeople) : [],
    evidenceKinds: query.evidence,
    languages: query.language,
    withReferences: query.references,
    publishedFrom: query.from,
    publishedTo: query.to,
  };
  const result = await topicSearch().search({
    text: query.q,
    filters,
    sort: effectiveSort(query),
    cursor,
    limit: SEARCH_PAGE_SIZE,
    withFacets: cursor === null,
  });

  const countries = new Map<string, CountryLink>(
    terms.countries.map(({ id, name, slug }) => [id, { name, slug }]),
  );
  const topics = result.hits.map((hit) => ({
    slug: hit.slug,
    title: hit.title,
    summary: hit.summary,
    state: hit.state,
    firstPublishedAt: hit.firstPublishedAt,
    lastPublishedAt: hit.lastPublishedAt,
    countries: hit.countryIds.flatMap((id) => {
      const country = countries.get(id);
      return country ? [country] : [];
    }),
    referenceCount: hit.referenceCount,
    commentCount: hit.commentCount,
  }));

  let facets: BrowseFacets | null = null;
  if (result.facets) {
    const counted = result.facets;
    const people = await loadIndividualLinks(
      counted.individuals.map(({ value }) => value),
    );
    const sources: Record<
      ListKey,
      { counts: FacetCount[]; lookup: ReturnType<typeof options> }
    > = {
      country: { counts: counted.countries, lookup: options(terms.countries) },
      category: {
        counts: counted.categories,
        lookup: options(terms.categories),
      },
      tag: { counts: counted.tags, lookup: options(terms.tags) },
      person: {
        counts: counted.individuals,
        lookup: options([...people, ...chosenPeople]),
      },
      evidence: {
        counts: counted.evidenceKinds,
        lookup: codeOptions(
          [...EVIDENCE_KINDS],
          (kind) =>
            EVIDENCE_KIND_LABELS[kind as keyof typeof EVIDENCE_KIND_LABELS],
        ),
      },
      language: {
        counts: counted.languages,
        lookup: codeOptions(
          [
            ...new Set([
              ...counted.languages.map(({ value }) => value),
              ...query.language,
            ]),
          ],
          languageLabel,
        ),
      },
    };
    const facet = (key: ListKey) =>
      facetValues(
        sources[key].counts,
        sources[key].lookup.byId,
        query[key],
        sources[key].lookup.bySlug,
      );
    facets = {
      country: facet("country"),
      category: facet("category"),
      tag: facet("tag"),
      person: facet("person"),
      evidence: facet("evidence"),
      language: facet("language"),
      references: counted.withReferences,
    };
  }

  return {
    topics,
    nextCursor: result.nextCursor,
    total: result.total,
    facets,
  };
}
