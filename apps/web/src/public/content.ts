import { type SnippetEvidence, statementIsBacked } from "@countrytopics/domain";
import type { Payload, Where } from "payload";

import { rows } from "@/array-rows";
import { relationId } from "@/audit";
import type { Licence } from "@/content-labels";
import { richTextLinkTargets } from "@/editor";
import { loadPayload } from "@/payload-instance";
import { snippetEvidence } from "@/snippet-evidence";

import { namingTopics } from "./naming";
import { profileLinks } from "./profile-links";
import type {
  Individual,
  LinkArchive,
  Media,
  Reference,
  Snippet,
  Topic,
  Video,
} from "@/payload-types";

import type {
  BrowseTerms,
  CitedReference,
  CountryLink,
  CountryPage,
  HomePage,
  IndividualLink,
  IndividualPage,
  LimitedList,
  ProfileStatement,
  PublicEvidence,
  PublicFile,
  PublicReference,
  PublicSnippet,
  TopicChangeEntry,
  TopicPage,
  TopicSummary,
} from "./types";

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

/** Topics in one list on a page; filters and paging arrive with search. */
export const TOPIC_LIST_LIMIT = 50;
export const HOME_TOPIC_LIMIT = 12;
/** More than the countries in ISO 3166-1, so the home page lists them all. */
const COUNTRY_LIMIT = 300;
const PEOPLE_LIMIT = 100;

const PUBLISHED: Where = { _status: { equals: "published" } };
// `state` is set only by the server and is never empty, unlike `archived`.
const LISTED: Where = {
  and: [PUBLISHED, { state: { in: ["published", "updated"] } }],
};
const NEWEST_FIRST = ["-firstPublishedAt", "-id"];

const SUMMARY_FIELDS = {
  slug: true,
  title: true,
  summary: true,
  state: true,
  firstPublishedAt: true,
  lastPublishedAt: true,
  countries: true,
} as const;

function ids(values: unknown[]): string[] {
  return [
    ...new Set(values.map(relationId).filter((id): id is string => !!id)),
  ];
}

/** Documents of a collection by id, with only the given fields. */
async function byId<T extends { id: string }>(
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

type Named = { id: string; name: string; slug: string };

async function countryLinks(
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

function linksOf<T>(map: Map<string, T>, idList: string[]): T[] {
  return idList.flatMap((id) => {
    const found = map.get(id);
    return found ? [found] : [];
  });
}

type SummaryFields = Pick<
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

async function summaries(
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
async function listedTopics(
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
async function topicList(
  payload: Payload,
  where: Where,
  limit: number,
): Promise<LimitedList<TopicSummary>> {
  return (await listedTopics(payload, where, limit)).list;
}

/**
 * Which of the individuals a published topic names, in any of the three
 * ways (namingTopics), so that their pages exist.
 */
async function publicIndividualIds(
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

function publicFile(media: Media): PublicFile | null {
  if (!media.filename || !media.mimeType) return null;
  return {
    url: `/files/${media.id}`,
    filename: media.filename,
    mimeType: media.mimeType,
    filesize: media.filesize ?? null,
    width: media.width ?? null,
    height: media.height ?? null,
    alt: media.alt,
    licence: media.licence satisfies Licence,
    credit: media.credit ?? null,
    sourceUrl: media.sourceUrl ?? null,
  };
}

const FILE_FIELDS = {
  filename: true,
  mimeType: true,
  filesize: true,
  width: true,
  height: true,
  alt: true,
  licence: true,
  credit: true,
  sourceUrl: true,
} as const;

/** Whether a published topic names any of the individuals. */
async function anyNamed(payload: Payload, naming: Where): Promise<boolean> {
  const { totalDocs } = await payload.count({
    collection: "topics",
    where: { and: [PUBLISHED, naming] },
    overrideAccess: true,
  });
  return totalDocs > 0;
}

type SnippetFields = Pick<
  Snippet,
  | "id"
  | "caption"
  | "youtubeId"
  | "startS"
  | "endS"
  | "speaker"
  | "language"
  | "transcript"
  | "video"
>;
type VideoFields = Pick<
  Video,
  | "id"
  | "title"
  | "channel"
  | "checkStatus"
  | "checkMessage"
  | "confirmedAt"
  | "durationS"
>;

/** A snippet as visitors see it, and the facts the evidence rule checks. */
type ResolvedSnippet = {
  snippet: PublicSnippet;
  check: SnippetEvidence;
  speakerId: string | null;
};

const UNAVAILABLE_MESSAGE = "YouTube no longer plays this video here.";

async function snippetsById(
  payload: Payload,
  idList: string[],
): Promise<Map<string, ResolvedSnippet>> {
  if (idList.length === 0) return new Map();
  const { docs } = await payload.find({
    collection: "snippets",
    where: { id: { in: idList } },
    select: {
      caption: true,
      youtubeId: true,
      startS: true,
      endS: true,
      speaker: true,
      language: true,
      transcript: true,
      video: true,
    },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  const snippets = docs as SnippetFields[];
  const videoIds = ids(snippets.map((snippet) => snippet.video));
  const { docs: videoDocs } =
    videoIds.length > 0
      ? await payload.find({
          collection: "videos",
          where: { id: { in: videoIds } },
          select: {
            title: true,
            channel: true,
            checkStatus: true,
            checkMessage: true,
            confirmedAt: true,
            durationS: true,
          },
          depth: 0,
          pagination: false,
          overrideAccess: true,
        })
      : { docs: [] };
  const videos = new Map(
    (videoDocs as VideoFields[]).map((video) => [String(video.id), video]),
  );
  const speakers = await byId<Named>(
    payload,
    "individuals",
    ids(snippets.map((snippet) => snippet.speaker)),
    { name: true, slug: true },
  );
  return new Map(
    snippets.map((snippet) => {
      const video = videos.get(relationId(snippet.video) ?? "");
      const speaker = speakers.get(relationId(snippet.speaker) ?? "");
      const gone =
        video?.checkStatus === "unavailable" ||
        video?.checkStatus === "not_embeddable";
      const resolved: ResolvedSnippet = {
        snippet: {
          youtubeId: snippet.youtubeId,
          start_s: snippet.startS,
          end_s: snippet.endS,
          caption: snippet.caption,
          speaker: speaker ? { name: speaker.name, slug: speaker.slug } : null,
          language: snippet.language,
          segments: rows(snippet.transcript).map((segment) => ({
            start_s: segment.startS,
            end_s: segment.endS,
            text: segment.text,
          })),
          videoTitle: video?.title ?? null,
          channel: video?.channel ?? null,
          videoUnavailable: gone
            ? (video?.checkMessage ?? UNAVAILABLE_MESSAGE)
            : null,
        },
        check: snippetEvidence(snippet, video),
        speakerId: speaker ? String(speaker.id) : null,
      };
      return [String(snippet.id), resolved];
    }),
  );
}

type EvidenceRow = NonNullable<Topic["evidence"]>[number];

/**
 * Each evidence row as visitors see it, in the same positions: null for a
 * row whose file or snippet is gone. Snippet rows also carry what the
 * evidence rule checks.
 */
async function resolveEvidence(
  payload: Payload,
  evidence: EvidenceRow[],
): Promise<
  {
    item: PublicEvidence | null;
    check: SnippetEvidence | null;
    speakerId?: string | null;
  }[]
> {
  const urls = evidence.flatMap((row) =>
    row.kind === "link" && row.url ? [row.url] : [],
  );
  const [files, snippets, { docs: archiveDocs }] = await Promise.all([
    byId<Media>(
      payload,
      "media",
      ids(evidence.map((row) => row.file)),
      FILE_FIELDS,
    ),
    snippetsById(payload, ids(evidence.map((row) => row.snippet))),
    urls.length > 0
      ? payload.find({
          collection: "link-archives",
          where: { url: { in: urls }, status: { equals: "archived" } },
          select: { url: true, archiveUrl: true, capturedAt: true },
          depth: 0,
          pagination: false,
          overrideAccess: true,
        })
      : Promise.resolve({ docs: [] }),
  ]);
  const archives = new Map(
    (archiveDocs as Pick<LinkArchive, "url" | "archiveUrl" | "capturedAt">[])
      .filter((doc) => doc.archiveUrl)
      .map((doc) => [doc.url, doc]),
  );

  return evidence.map((row) => {
    const base = { title: row.title || null, note: row.note || null };
    if (row.kind === "snippet") {
      const found = snippets.get(relationId(row.snippet) ?? "");
      return found
        ? {
            item: { ...base, kind: "snippet", snippet: found.snippet },
            check: found.check,
            speakerId: found.speakerId,
          }
        : { item: null, check: null };
    }
    if (row.kind === "link") {
      if (!row.url) return { item: null, check: null };
      const archive = archives.get(row.url);
      return {
        item: {
          ...base,
          kind: "link",
          url: row.url,
          archive: archive?.archiveUrl
            ? {
                url: archive.archiveUrl,
                capturedAt: archive.capturedAt ?? null,
              }
            : null,
          otherArchiveUrl: row.archiveUrl || null,
        },
        check: null,
      };
    }
    const media = files.get(relationId(row.file) ?? "");
    const file = media ? publicFile(media) : null;
    return {
      item: file ? { ...base, kind: row.kind, file } : null,
      check: null,
    };
  });
}

async function evidenceOf(
  payload: Payload,
  evidence: EvidenceRow[],
): Promise<PublicEvidence[]> {
  return (await resolveEvidence(payload, evidence)).flatMap(({ item }) =>
    item ? [item] : [],
  );
}

function publicReference(reference: Reference): PublicReference {
  return {
    kind: reference.kind,
    title: reference.title,
    authors: (reference.authors ?? "")
      .split("\n")
      .map((author) => author.trim())
      .filter(Boolean),
    containerTitle: reference.containerTitle ?? null,
    publisher: reference.publisher ?? null,
    publishedDate: reference.publishedDate ?? null,
    doi: reference.doi ?? null,
    isbn: reference.isbn ?? null,
    url: reference.url ?? null,
  };
}

/** References by id, with what citations show and their check status. */
async function referencesById(
  payload: Payload,
  referenceIds: string[],
): Promise<Map<string, Reference>> {
  if (referenceIds.length === 0) return new Map();
  const { docs } = await payload.find({
    collection: "references",
    where: { id: { in: referenceIds } },
    select: {
      kind: true,
      title: true,
      authors: true,
      containerTitle: true,
      publisher: true,
      publishedDate: true,
      doi: true,
      isbn: true,
      url: true,
      checkStatus: true,
    },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  return new Map((docs as Reference[]).map((doc) => [String(doc.id), doc]));
}

async function referencesOf(
  payload: Payload,
  cited: NonNullable<Topic["references"]>,
): Promise<CitedReference[]> {
  const references = await referencesById(
    payload,
    ids(cited.map((row) => row.reference)),
  );
  return cited.flatMap((row) => {
    const reference = references.get(relationId(row.reference) ?? "");
    return reference
      ? [
          {
            stance: row.stance,
            passage: row.passage,
            locator: row.locator || null,
            reference: publicReference(reference),
          },
        ]
      : [];
  });
}

/** Page addresses for the body's links to public topics and individuals. */
async function bodyLinksOf(
  payload: Payload,
  body: Topic["body"],
): Promise<Record<string, string>> {
  const targets = richTextLinkTargets(body);
  const topicIds = targets
    .filter((target) => target.relationTo === "topics")
    .map((target) => target.id);
  const individualIds = targets
    .filter((target) => target.relationTo === "individuals")
    .map((target) => target.id);
  const links: Record<string, string> = {};
  if (topicIds.length > 0) {
    const { docs } = await payload.find({
      collection: "topics",
      draft: false,
      where: { and: [PUBLISHED, { id: { in: topicIds } }] },
      select: { slug: true },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    });
    for (const doc of docs) links[`topics:${doc.id}`] = `/topics/${doc.slug}`;
  }
  // A published topic that links an individual names them, which makes them
  // public.
  const individuals = await byId<Named>(payload, "individuals", individualIds, {
    slug: true,
    name: true,
  });
  for (const [id, individual] of individuals) {
    links[`individuals:${id}`] = `/individuals/${individual.slug}`;
  }
  return links;
}

async function changesOf(
  payload: Payload,
  topicId: string,
): Promise<TopicChangeEntry[]> {
  const { docs } = await payload.find({
    collection: "topic-changes",
    where: { topic: { equals: topicId } },
    // Not who made the change: staff accounts stay private.
    select: { kind: true, note: true, createdAt: true },
    sort: "-createdAt",
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  return docs.map((doc) => ({
    kind: doc.kind,
    note: doc.note,
    date: doc.createdAt,
  }));
}

/** A published topic's page, or null when no published topic has the slug. */
export async function loadTopicPage(slug: string): Promise<TopicPage | null> {
  const payload = await loadPayload();
  const { docs } = await payload.find({
    collection: "topics",
    draft: false,
    where: { and: [PUBLISHED, { slug: { equals: slug } }] },
    select: {
      ...SUMMARY_FIELDS,
      body: true,
      category: true,
      tags: true,
      people: true,
      evidence: true,
      references: true,
    },
    limit: 1,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  });
  const topic = docs[0];
  if (!topic) return null;

  // Independent reads, outside any transaction: run together, so the first
  // visit after a purge waits for the slowest rather than for all of them.
  const people = rows(topic.people);
  const named = { name: true, slug: true } as const;
  const [
    [summary],
    categories,
    tags,
    individuals,
    bodyLinks,
    evidence,
    references,
    changes,
  ] = await Promise.all([
    summaries(payload, [topic]),
    byId<Named>(payload, "categories", ids([topic.category]), named),
    byId<Named>(payload, "tags", ids(topic.tags ?? []), named),
    byId<Named>(
      payload,
      "individuals",
      ids(people.map((row) => row.individual)),
      named,
    ),
    bodyLinksOf(payload, topic.body),
    evidenceOf(payload, rows(topic.evidence)),
    referencesOf(payload, rows(topic.references)),
    changesOf(payload, String(topic.id)),
  ]);
  const category = categories.get(relationId(topic.category) ?? "");

  return {
    ...(summary as TopicSummary),
    category: category ? { name: category.name, slug: category.slug } : null,
    tags: linksOf(tags, ids(topic.tags ?? [])).map(({ name, slug }) => ({
      name,
      slug,
    })),
    people: people.flatMap((row) => {
      const individual = individuals.get(relationId(row.individual) ?? "");
      return individual
        ? [
            {
              individual: { name: individual.name, slug: individual.slug },
              role: row.role,
            },
          ]
        : [];
    }),
    body: topic.body,
    bodyLinks,
    evidence,
    references,
    changes,
  };
}

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

type WithStatements = Pick<Individual, "id" | "statements">;

/**
 * The statements on individuals' profiles that visitors may see, by
 * individual: each must carry its own evidence and sources and pass the
 * topic publishing check (statementIsBacked). The others are left out one by
 * one. Every individual's evidence and references load in one batch.
 */
async function backedStatements(
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

/** What the storage plugin needs to find a file: its record's storage fields. */
export type StoredFile = Pick<Media, "id" | "filename" | "_objectKey">;

/**
 * The record of a file visitors may download, or null: it must be evidence
 * in a published topic, or the photo of a public individual.
 */
export async function loadPublicFile(
  id: string,
): Promise<{ file: PublicFile; stored: StoredFile } | null> {
  const payload = await loadPayload();
  const media = (await payload.findByID({
    collection: "media",
    id,
    select: { ...FILE_FIELDS, _objectKey: true },
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
  })) as Media | null;
  const file = media ? publicFile(media) : null;
  if (!media || !file) return null;

  const evidence = await payload.count({
    collection: "topics",
    where: { and: [PUBLISHED, { "evidence.file": { equals: id } }] },
    overrideAccess: true,
  });
  let isPublic = evidence.totalDocs > 0;
  if (!isPublic) {
    // Evidence in a profile statement counts only while that statement is
    // shown: backed, on the profile of a public individual. Filtering to
    // the individuals with such a statement first lets one query ask
    // whether any of them is public.
    const { docs: citing } = await payload.find({
      collection: "individuals",
      where: { "statements.evidence.file": { equals: id } },
      select: { statements: true },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    });
    const shown = await backedStatements(payload, citing as WithStatements[]);
    const showing = [...shown]
      .filter(([, statements]) =>
        statements.some((statement) =>
          statement.evidence.some(
            (item) =>
              (item.kind === "image" || item.kind === "document") &&
              item.file.url === `/files/${id}`,
          ),
        ),
      )
      .map(([individualId]) => individualId);
    isPublic =
      showing.length > 0 &&
      (await anyNamed(payload, await namingTopics(payload, showing)));
  }
  if (!isPublic) {
    const { docs: portrayed } = await payload.find({
      collection: "individuals",
      where: { photo: { equals: id } },
      select: { slug: true },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    });
    isPublic =
      portrayed.length > 0 &&
      (await anyNamed(
        payload,
        await namingTopics(
          payload,
          portrayed.map((individual) => String(individual.id)),
        ),
      ));
  }
  if (!isPublic) return null;
  return {
    file,
    stored: {
      id: String(media.id),
      filename: media.filename,
      _objectKey: media._objectKey,
    },
  };
}

/**
 * Every country, category, and tag, for browsing: their slugs in URLs
 * become ids for the search index, and the index's ids become names.
 */
export async function loadBrowseTerms(): Promise<BrowseTerms> {
  const payload = await loadPayload();
  const all = { depth: 0, pagination: false, overrideAccess: true } as const;
  const [countries, categories, tags] = await Promise.all([
    payload.find({
      collection: "countries",
      select: { name: true, slug: true, region: true },
      sort: "name",
      ...all,
    }),
    payload.find({
      collection: "categories",
      select: { name: true, slug: true },
      sort: "name",
      ...all,
    }),
    payload.find({
      collection: "tags",
      select: { name: true, slug: true },
      sort: "name",
      ...all,
    }),
  ]);
  const term = (doc: { id: string; name: string; slug: string }) => ({
    id: String(doc.id),
    name: doc.name,
    slug: doc.slug,
  });
  return {
    countries: countries.docs.map((doc) => ({
      ...term(doc),
      region: doc.region ?? null,
    })),
    categories: categories.docs.map(term),
    tags: tags.docs.map(term),
  };
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
