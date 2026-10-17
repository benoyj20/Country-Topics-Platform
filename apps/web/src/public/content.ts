import { profileIsBacked } from "@countrytopics/domain";
import type { Payload, Where } from "payload";

import { relationId } from "@/audit";
import type { Licence } from "@/content-labels";
import { richTextLinkTargets } from "@/editor";
import { loadPayload } from "@/payload-instance";
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
  CitedReference,
  CountryLink,
  CountryPage,
  HomePage,
  IndividualLink,
  IndividualPage,
  LimitedList,
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
//   as evidence. Their page shows who they are and those topics, and the bio
//   and country roles only while the profile cites sources that are all
//   confirmed (profileIsBacked, ADR 0007).
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

function rows<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
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
    ids(topics.flatMap((topic) => rows(topic.countries))),
  );
  return topics.map((topic) => ({
    slug: topic.slug,
    title: topic.title,
    summary: topic.summary,
    state: publicState(topic.state),
    firstPublishedAt: topic.firstPublishedAt ?? null,
    lastPublishedAt: topic.lastPublishedAt ?? null,
    countries: linksOf(countries, ids(rows(topic.countries))),
  }));
}

/** Listed topics matching `where`, newest first, up to `limit`. */
async function topicList(
  payload: Payload,
  where: Where,
  limit: number,
): Promise<LimitedList<TopicSummary>> {
  const { docs } = await payload.find({
    collection: "topics",
    draft: false,
    where: { and: [LISTED, where] },
    select: SUMMARY_FIELDS,
    sort: NEWEST_FIRST,
    // One more than shown says whether there are more.
    limit: limit + 1,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  });
  return {
    items: await summaries(payload, docs.slice(0, limit)),
    more: docs.length > limit,
  };
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

/** The condition for topics that name any of the individuals. */
async function namingTopics(
  payload: Payload,
  individualIds: string[],
): Promise<Where> {
  // Snippets are not versioned with topics: a published topic quotes the
  // speaker its snippet names now, as its page shows.
  const { docs: spoken } = await payload.find({
    collection: "snippets",
    where: { speaker: { in: individualIds } },
    // Only the ids are needed; Payload always returns them.
    select: { youtubeId: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  const naming: Where[] = [
    { "people.individual": { in: individualIds } },
    { linkedIndividuals: { in: individualIds } },
  ];
  if (spoken.length > 0) {
    naming.push({ "evidence.snippet": { in: spoken.map((doc) => doc.id) } });
  }
  return { or: naming };
}

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
  "id" | "title" | "channel" | "checkStatus" | "checkMessage"
>;

const UNAVAILABLE_MESSAGE = "YouTube no longer plays this video here.";

async function snippetsById(
  payload: Payload,
  idList: string[],
): Promise<Map<string, PublicSnippet>> {
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
      return [
        String(snippet.id),
        {
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
      ];
    }),
  );
}

async function evidenceOf(
  payload: Payload,
  evidence: NonNullable<Topic["evidence"]>,
): Promise<PublicEvidence[]> {
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

  return evidence.flatMap((row): PublicEvidence[] => {
    const base = { title: row.title || null, note: row.note || null };
    if (row.kind === "snippet") {
      const snippet = snippets.get(relationId(row.snippet) ?? "");
      return snippet ? [{ ...base, kind: "snippet", snippet }] : [];
    }
    if (row.kind === "link") {
      if (!row.url) return [];
      const archive = archives.get(row.url);
      return [
        {
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
      ];
    }
    const media = files.get(relationId(row.file) ?? "");
    const file = media ? publicFile(media) : null;
    return file ? [{ ...base, kind: row.kind, file }] : [];
  });
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
    byId<Named>(payload, "tags", ids(rows(topic.tags)), named),
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
    tags: linksOf(tags, ids(rows(topic.tags))).map(({ name, slug }) => ({
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
  | "summary"
  | "photo"
  | "links"
  | "wikidataId"
  | "bio"
  | "countries"
  | "sources"
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
      summary: true,
      photo: true,
      links: true,
      wikidataId: true,
      bio: true,
      countries: true,
      sources: true,
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

  const sources = rows(individual.sources);
  const roles = rows(individual.countries);
  const [photos, topics, references, countries] = await Promise.all([
    byId<Media>(payload, "media", ids([individual.photo]), FILE_FIELDS),
    topicList(payload, naming, TOPIC_LIST_LIMIT),
    referencesById(payload, ids(sources.map((row) => row.reference))),
    countryLinks(payload, ids(roles.map((row) => row.country))),
  ]);
  const photo = photos.get(relationId(individual.photo) ?? "");
  const cited = sources.map((row) => ({
    row,
    reference: references.get(relationId(row.reference) ?? ""),
  }));
  const backed = profileIsBacked(
    cited.map(({ reference }) => ({
      checkStatus: reference?.checkStatus ?? null,
    })),
  );
  return {
    name: individual.name,
    slug: individual.slug,
    aliases: rows(individual.aliases).map((alias) => alias.name),
    summary: individual.summary ?? null,
    photo: photo ? publicFile(photo) : null,
    links: rows(individual.links).map(({ label, url }) => ({ label, url })),
    wikidataId: individual.wikidataId ?? null,
    backed: backed
      ? {
          bio: individual.bio || null,
          countries: roles.flatMap((row) => {
            const country = countries.get(relationId(row.country) ?? "");
            return country
              ? [
                  {
                    country,
                    role: row.role || null,
                    startDate: row.startDate || null,
                    endDate: row.endDate || null,
                  },
                ]
              : [];
          }),
          sources: cited.flatMap(({ row, reference }) =>
            reference
              ? [
                  {
                    passage: row.passage,
                    locator: row.locator || null,
                    reference: publicReference(reference),
                  },
                ]
              : [],
          ),
        }
      : null,
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

  const topics = await topicList(
    payload,
    { countries: { equals: country.id } },
    TOPIC_LIST_LIMIT,
  );
  // The people the listed topics name, from the topics themselves rather
  // than the individuals' own country entries, which cite no evidence.
  const { docs: naming } = await payload.find({
    collection: "topics",
    draft: false,
    where: { and: [LISTED, { countries: { equals: country.id } }] },
    select: { people: true },
    sort: NEWEST_FIRST,
    limit: TOPIC_LIST_LIMIT,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  });
  const individuals = await byId<Named>(
    payload,
    "individuals",
    ids(
      naming.flatMap((topic) =>
        rows(topic.people).map((row) => row.individual),
      ),
    ),
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
  const topics = await topicList(payload, {}, HOME_TOPIC_LIMIT);
  const { values } = await payload.findDistinct({
    collection: "topics",
    field: "countries",
    where: LISTED,
    limit: COUNTRY_LIMIT,
    depth: 0,
    overrideAccess: true,
  });
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
