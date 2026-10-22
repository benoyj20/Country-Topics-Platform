import {
  type BrowseQuery,
  BrowseResult as BrowseContract,
  EMPTY_BROWSE_QUERY,
} from "@countrytopics/contracts";
import {
  createRedisConnection,
  createSearchQueue,
  createTopicSearchSource,
  processSearchJob,
  SEARCH_REBUILD_EVERY_MS,
  searchJobSchema,
} from "@countrytopics/jobs";
import {
  createPostgresTopicSearch,
  type TopicFilters,
  type TopicSearchIndex,
  type TopicSearchRequest,
} from "@countrytopics/search";
import config from "@payload-config";
import {
  getPayload,
  type Payload,
  type RequiredDataFromCollectionSlug,
} from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as getTopics } from "@/app/api/v1/topics/route";
import type { Individual, Topic, User } from "@/payload-types";
import { browseTopics } from "@/public/browse";
import { serverEnv } from "@/env";
import { loadIndividualPage } from "@/public/content";
import type { BrowseResult } from "@/public/types";

import {
  file,
  linkNode,
  PNG_BYTES,
  richText,
  runReferenceCheck,
  runVideoCheck,
  workerSide,
} from "./fixtures";
import { countryId, SITE_URL, staffProfile } from "./helpers";

// Browsing and search (ADR 0008): publishing queues the topic for the search
// index, the worker's code builds its document from the database, and the
// API finds it. Every topic, person, and word here is made up for the
// tests. The topics are about Iceland and Norway, which no other test uses,
// and the made-up words are unique, so other tests' topics never match.
let payload: Payload;
let worker: Awaited<ReturnType<typeof workerSide>>;
let index: TopicSearchIndex;
let source: ReturnType<typeof createTopicSearchSource>;
let admin: User;
let iceland: { id: string; slug: string };
let norway: { id: string; slug: string };
let category: { id: string; slug: string };
let tag: { id: string; slug: string };
let subject: Individual;
let linked: Individual;
let speaker: Individual;
let draftOnly: Individual;
/** Iceland; a person, a linked person, an image, two references. */
let glacier: Topic;
/** Norway; a snippet in Swahili, one reference. */
let fjord: Topic;
/** Iceland; nothing cited, archived later. */
let volcano: Topic;

type TopicInput = RequiredDataFromCollectionSlug<"topics">;

async function country(code: string) {
  const id = await countryId(payload, code);
  const { slug } = await payload.findByID({
    collection: "countries",
    id,
    overrideAccess: true,
  });
  return { id, slug };
}

function person(name: string) {
  return payload.create({
    collection: "individuals",
    data: { name, slug: "" },
    user: admin,
    overrideAccess: false,
  });
}

async function confirmedReference(url: string) {
  const reference = await payload.create({
    collection: "references",
    data: {
      title: `TEST search report ${url}`,
      kind: "report",
      url,
      checkStatus: "pending",
    },
    user: admin,
    overrideAccess: false,
  });
  await runReferenceCheck(payload, worker.store, reference.id);
  return reference;
}

async function createAndPublish(data: Partial<TopicInput>) {
  const topic = await payload.create({
    collection: "topics",
    data: {
      slug: "",
      summary: "A fictional topic for the search tests.",
      body: richText("Fictional text."),
      ...data,
    } as TopicInput,
    draft: true,
    user: admin,
    overrideAccess: false,
  });
  return payload.update({
    collection: "topics",
    id: topic.id,
    data: { _status: "published" },
    user: admin,
    overrideAccess: false,
  });
}

/** Runs the queued search jobs as the worker would, oldest first. */
async function runSearchJobs(): Promise<number> {
  const jobs = await worker.queues.search.getJobs(
    ["waiting", "delayed", "prioritized"],
    0,
    -1,
    true,
  );
  for (const job of jobs) {
    await processSearchJob(
      searchJobSchema.parse(job.data),
      { source, index },
      { isFinal: false },
    );
    await job.remove();
  }
  return jobs.length;
}

async function browse(query: Partial<BrowseQuery>): Promise<BrowseResult> {
  return browseTopics({ ...EMPTY_BROWSE_QUERY, ...query }, null);
}

/** Slugs of the found topics, in order. */
async function found(query: Partial<BrowseQuery>): Promise<string[]> {
  return (await browse(query)).topics.map((topic) => topic.slug);
}

const OURS = () => [iceland.slug, norway.slug];

beforeAll(async () => {
  payload = await getPayload({ config });
  worker = await workerSide();
  index = createPostgresTopicSearch(worker.pool);
  source = createTopicSearchSource(worker.pool);
  admin = await staffProfile(payload, "search-admin", "admin");
  iceland = await country("IS");
  norway = await country("NO");
  const createdCategory = await payload.create({
    collection: "categories",
    data: { name: "TEST Search Category", slug: "" },
    overrideAccess: true,
  });
  category = { id: createdCategory.id, slug: createdCategory.slug };
  const createdTag = await payload.create({
    collection: "tags",
    data: { name: "TEST Search Tag", slug: "" },
    overrideAccess: true,
  });
  tag = { id: createdTag.id, slug: createdTag.slug };

  subject = await person("TEST Quillonbard Subject");
  linked = await person("TEST Linked Searchperson");
  speaker = await person("TEST Fjordspeaker Person");
  draftOnly = await person("TEST Hiddenpelican Draft");

  const image = await payload.create({
    collection: "media",
    data: { alt: "TEST search image", licence: "own_work" },
    file: file("search-evidence.png", "image/png", PNG_BYTES),
    user: admin,
    overrideAccess: false,
  });
  const snippet = await payload.create({
    collection: "snippets",
    data: {
      caption: "TEST search snippet",
      youtubeId: "TESTsrch001",
      startS: 10,
      endS: 20,
      speaker: speaker.id,
      language: "sw",
      transcriptTimebase: "video",
      transcriptText: "0:12 TEST the zirconwhale was spoken here",
    },
    user: admin,
    overrideAccess: false,
  });
  const videoId =
    typeof snippet.video === "string" ? snippet.video : snippet.video?.id;
  if (!videoId) throw new Error("The snippet has no video");
  await runVideoCheck(payload, worker.store, videoId);
  const [first, second, third] = await Promise.all([
    confirmedReference("https://example.org/search-1"),
    confirmedReference("https://example.org/search-2"),
    confirmedReference("https://example.org/search-3"),
  ]);

  glacier = await createAndPublish({
    title: "TEST Glacier topic",
    body: richText(
      "The quokkaglacier is a fictional word.",
      linkNode({ relationTo: "individuals", value: linked.id }),
    ),
    countries: [iceland.id],
    category: category.id,
    tags: [tag.id],
    people: [{ individual: subject.id, role: "subject" }],
    evidence: [{ kind: "image", title: "TEST search image", file: image.id }],
    references: [
      { reference: first.id, stance: "supports", passage: "Quoted." },
      { reference: second.id, stance: "context", passage: "Quoted." },
    ],
  });
  fjord = await createAndPublish({
    title: "TEST Fjord topic",
    countries: [norway.id],
    evidence: [{ kind: "snippet", snippet: snippet.id }],
    references: [
      { reference: third.id, stance: "supports", passage: "Quoted." },
    ],
  });
  volcano = await createAndPublish({
    title: "TEST Volcano topic",
    summary: "The lavamoth is another fictional word.",
    countries: [iceland.id],
  });
  await payload.create({
    collection: "topics",
    data: {
      title: "TEST draft search topic quokkaglacier",
      slug: "",
      countries: [iceland.id],
      people: [{ individual: draftOnly.id, role: "subject" }],
    } as TopicInput,
    draft: true,
    user: admin,
    overrideAccess: false,
  });
  await runSearchJobs();
});

afterAll(async () => {
  await worker?.close();
});

describe("indexing", () => {
  it("queues a topic when it is published, and not for a draft save", async () => {
    await payload.update({
      collection: "topics",
      id: volcano.id,
      data: { title: "TEST Volcano draft title" },
      draft: true,
      user: admin,
      overrideAccess: false,
    });
    expect(await worker.queues.search.getJobCounts("waiting")).toEqual({
      waiting: 0,
    });

    volcano = await payload.update({
      collection: "topics",
      id: volcano.id,
      data: {
        title: "TEST Volcano topic",
        _status: "published",
        changeNote: "TEST same title again.",
      },
      user: admin,
      overrideAccess: false,
    });
    const [job] = await worker.queues.search.getJobs(["waiting"]);
    expect(job?.data).toEqual({
      topicIds: [volcano.id],
      after: { table: "topics", id: volcano.id, updatedAt: volcano.updatedAt },
    });
    expect(await runSearchJobs()).toBe(1);
  });

  it("builds documents with everyone a topic names and what its evidence shows", async () => {
    const states = await source.topicStates([glacier.id, fjord.id]);
    expect(states.get(glacier.id)?.document).toMatchObject({
      slug: glacier.slug,
      countryIds: [iceland.id],
      categoryId: category.id,
      tagIds: [tag.id],
      individualIds: [subject.id, linked.id].sort(),
      evidenceKinds: ["image"],
      languages: [],
      referenceCount: 2,
    });
    expect(states.get(fjord.id)?.document).toMatchObject({
      individualIds: [speaker.id],
      evidenceKinds: ["snippet"],
      languages: ["sw"],
      referenceCount: 1,
    });
  });

  it("names the same people as their public pages", async () => {
    for (const individual of [subject, linked, speaker]) {
      const page = await loadIndividualPage(individual.slug);
      expect(await found({ person: [individual.slug] })).toEqual(
        page?.topics.items.map((topic) => topic.slug),
      );
    }
  });

  it("keeps a newer document when an older read arrives later", async () => {
    const state = (await source.topicStates([glacier.id])).get(glacier.id);
    if (!state?.document) throw new Error("The topic is not listed");
    const older = {
      ...state.document,
      title: "TEST stale title",
      version: "2000-01-01T00:00:00.000Z",
    };
    expect(await index.upsert(older)).toBe(false);
    await index.remove(glacier.id, older.version);
    expect(await found({ q: "quokkaglacier" })).toEqual([glacier.slug]);
  });

  it("waits for the save that queued a job before indexing", async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    await expect(
      processSearchJob(
        {
          topicIds: [glacier.id],
          after: { table: "topics", id: glacier.id, updatedAt: future },
        },
        { source, index },
        { isFinal: false },
      ),
    ).rejects.toThrow(/not saved yet/);
  });

  it("leaves out evidence the topic page does not show", async () => {
    const { rows } = await worker.pool.query<{ file_id: string }>(
      "SELECT file_id FROM topics_evidence WHERE _parent_id = $1 AND kind = 'image'",
      [glacier.id],
    );
    const fileId = rows[0]?.file_id;
    const { rows: before } = await worker.pool.query<{ filename: string }>(
      "SELECT filename FROM media WHERE id = $1",
      [fileId],
    );
    await worker.pool.query("UPDATE media SET filename = NULL WHERE id = $1", [
      fileId,
    ]);
    try {
      const document = (await source.topicStates([glacier.id])).get(
        glacier.id,
      )?.document;
      expect(document?.evidenceKinds).toEqual([]);
      expect(document?.text.evidence).toBe("");
    } finally {
      await worker.pool.query("UPDATE media SET filename = $2 WHERE id = $1", [
        fileId,
        before[0]?.filename,
      ]);
    }
  });

  it("rebuilds every listed topic and drops documents of topics no longer listed", async () => {
    const state = (await source.topicStates([volcano.id])).get(volcano.id);
    if (!state?.document) throw new Error("The topic is not listed");
    const ghost = "01920000-0000-7000-8000-00000000dead";
    await index.upsert({ ...state.document, topicId: ghost, slug: "ghost" });
    await processSearchJob(
      { rebuild: true },
      { source, index },
      {
        isFinal: false,
      },
    );
    const indexed = [...(await index.indexedVersions()).keys()];
    expect(indexed).not.toContain(ghost);
    expect(indexed).toEqual(
      expect.arrayContaining([glacier.id, fjord.id, volcano.id]),
    );
    // Nothing changed since: the next rebuild rewrites nothing.
    const again = await processSearchJob(
      { rebuild: true },
      { source, index },
      { isFinal: false },
    );
    expect(again).toMatchObject({ indexed: 0, kept: 0, removed: 0 });
    expect(again.unchanged).toBe(indexed.length);
  });
  it("does not add back a removed topic from a read made before the removal", async () => {
    const state = (await source.topicStates([glacier.id])).get(glacier.id);
    if (!state?.document) throw new Error("The topic is not listed");
    await index.remove(glacier.id, state.version);
    expect(await index.upsert(state.document)).toBe(false);
    expect(await found({ q: "quokkaglacier" })).toEqual([]);
    // A read made after a later change brings it back.
    const later = new Date(Date.parse(state.version) + 1).toISOString();
    expect(await index.upsert({ ...state.document, version: later })).toBe(
      true,
    );
    expect(await found({ q: "quokkaglacier" })).toEqual([glacier.slug]);
  });
});

describe("search", () => {
  it("finds topics by their words, their people's names, and what speakers say", async () => {
    expect(await found({ q: "quokkaglacier" })).toEqual([glacier.slug]);
    expect(await found({ q: "Quillonbard" })).toEqual([glacier.slug]);
    expect(await found({ q: "lavamoth" })).toEqual([volcano.slug]);
    expect(await found({ q: "zirconwhale" })).toEqual([fjord.slug]);
    // Words match in any form ("topics" finds "topic"), all of them.
    expect(await found({ q: "fjord topics", country: OURS() })).toEqual([
      fjord.slug,
    ]);
  });

  it("never finds drafts or names only drafts mention", async () => {
    expect(await found({ q: "Hiddenpelican" })).toEqual([]);
    expect(await found({ person: [draftOnly.slug] })).toEqual([]);
  });

  it("filters by any value within a facet and by every facet together", async () => {
    expect(await found({ country: [iceland.slug] })).toEqual([
      volcano.slug,
      glacier.slug,
    ]);
    expect(await found({ country: OURS() })).toHaveLength(3);
    expect(await found({ category: [category.slug] })).toEqual([glacier.slug]);
    expect(await found({ tag: [tag.slug] })).toEqual([glacier.slug]);
    expect(await found({ person: [speaker.slug] })).toEqual([fjord.slug]);
    expect(
      await found({ country: OURS(), evidence: ["snippet", "image"] }),
    ).toEqual([fjord.slug, glacier.slug]);
    expect(await found({ country: OURS(), language: ["sw"] })).toEqual([
      fjord.slug,
    ]);
    expect(await found({ country: [iceland.slug], references: true })).toEqual([
      glacier.slug,
    ]);
    const today = new Date().toISOString().slice(0, 10);
    expect(
      await found({ country: OURS(), from: today, to: today }),
    ).toHaveLength(3);
    expect(await found({ country: OURS(), to: "2000-01-01" })).toEqual([]);
  });

  it("matches nothing for a value no record has, rather than ignoring it", async () => {
    expect(await found({ country: ["no-such-country"] })).toEqual([]);
    expect(await found({ tag: ["no-such-tag"], country: OURS() })).toEqual([]);
  });

  it("counts each facet's values given the other filters, not its own", async () => {
    const result = await browse({ country: [iceland.slug], references: true });
    expect(result.total).toBe(1);
    const countries = result.facets?.country ?? [];
    expect(countries.find((item) => item.value === norway.slug)).toEqual({
      value: norway.slug,
      label: "Norway",
      count: 1,
      group: "Europe",
    });
    expect(countries.find((item) => item.value === iceland.slug)?.count).toBe(
      1,
    );
    expect(
      result.facets?.person.find((item) => item.value === subject.slug),
    ).toMatchObject({ label: "TEST Quillonbard Subject", count: 1 });
  });

  it("sorts by references and pages through every topic once", async () => {
    expect(await found({ country: OURS(), sort: "referenced" })).toEqual([
      glacier.slug,
      fjord.slug,
      volcano.slug,
    ]);

    const filters: TopicFilters = {
      countryIds: [iceland.id, norway.id],
      categoryIds: [],
      tagIds: [],
      individualIds: [],
      evidenceKinds: [],
      languages: [],
      withReferences: false,
      publishedFrom: null,
      publishedTo: null,
    };
    for (const sort of ["newest", "updated", "referenced"] as const) {
      const request: TopicSearchRequest = {
        text: null,
        filters,
        sort,
        cursor: null,
        limit: 1,
        withFacets: false,
      };
      const seen: string[] = [];
      for (let page = 0; page < 5; page += 1) {
        const result = await index.search(request);
        seen.push(...result.hits.map((hit) => hit.topicId));
        if (!result.nextCursor) break;
        request.cursor = result.nextCursor;
      }
      expect(seen.sort()).toEqual([glacier.id, fjord.id, volcano.id].sort());
    }
  });
});

describe("keeping the index current", () => {
  it("re-indexes the topics that name a person when they are renamed", async () => {
    const renamed = await payload.update({
      collection: "individuals",
      id: subject.id,
      data: { name: "TEST Renamed Marbleheron" },
      user: admin,
      overrideAccess: false,
    });
    // The rename makes a newer version of the topic's document.
    expect(
      (await source.topicStates([glacier.id])).get(glacier.id)?.version,
    ).toBe(renamed.updatedAt);
    expect(await runSearchJobs()).toBe(1);
    expect(await found({ q: "Marbleheron" })).toEqual([glacier.slug]);
    expect(await found({ q: "Quillonbard" })).toEqual([]);
  });

  it("re-indexes the topics a snippet is in when its language changes", async () => {
    const { docs } = await payload.find({
      collection: "snippets",
      where: { youtubeId: { equals: "TESTsrch001" } },
      overrideAccess: true,
    });
    await payload.update({
      collection: "snippets",
      id: docs[0]?.id ?? "",
      data: { language: "is" },
      user: admin,
      overrideAccess: false,
    });
    expect(await runSearchJobs()).toBe(1);
    expect(await found({ country: OURS(), language: ["is"] })).toEqual([
      fjord.slug,
    ]);
  });

  it("rebuilds as soon as the worker starts, then every hour", async () => {
    const env = serverEnv();
    const connection = createRedisConnection(env.redisUrl, "producer");
    const queue = createSearchQueue({ connection, prefix: env.queuePrefix });
    try {
      await queue.scheduleRebuilds();
      // The schedule may add a run of its own at once, depending on where
      // the hour falls; the rebuild on start does not wait for it.
      const waiting = await worker.queues.search.getJobs(["waiting"]);
      const onStart = waiting.filter((job) => !job.id?.startsWith("repeat:"));
      expect(onStart.map((job) => job.data)).toEqual([{ rebuild: true }]);
      const schedulers = await worker.queues.search.getJobSchedulers();
      expect(schedulers).toMatchObject([
        { key: "search-rebuild", every: SEARCH_REBUILD_EVERY_MS },
      ]);
    } finally {
      await worker.queues.search.removeJobScheduler("search-rebuild");
      await worker.queues.search.drain(true);
      await queue.close();
      await connection.quit();
    }
  });

  it("takes an archived topic out of search", async () => {
    await payload.update({
      collection: "topics",
      id: volcano.id,
      data: {
        archived: true,
        _status: "published",
        changeNote: "TEST archived.",
      },
      user: admin,
      overrideAccess: false,
    });
    expect(await runSearchJobs()).toBe(1);
    expect(await found({ q: "lavamoth" })).toEqual([]);
  });
});

describe("GET /api/v1/topics", () => {
  const get = (search: string) =>
    getTopics(new Request(`${SITE_URL}/api/v1/topics?${search}`));

  it("answers with results that shared caches may keep for a minute", async () => {
    const response = await get(`country=${iceland.slug}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    );
    const body = (await response.json()) as BrowseResult;
    // It holds nothing the shared contract does not list.
    expect(BrowseContract.parse(body)).toEqual(body);
    expect(body.topics.map((topic) => topic.slug)).toEqual([glacier.slug]);
    expect(body.topics[0]).toMatchObject({
      countries: [{ name: "Iceland", slug: iceland.slug }],
      referenceCount: 2,
    });
    // Ids stay inside the site.
    expect(JSON.stringify(body)).not.toContain(glacier.id);
  });

  it("refuses values that are not valid, and cursors it did not issue", async () => {
    const invalid = await get("country=Not%20A%20Slug&sort=random");
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      problems: [
        'Country: "Not A Slug" is not valid.',
        '"random" is not a way to sort.',
      ],
    });
    expect((await get("cursor=forged")).status).toBe(400);
    expect(await (await get("utm_source=mail")).json()).toMatchObject({
      problems: ['"utm_source" is not a parameter.'],
    });
  });

  it("sends the same request written another way to its one address", async () => {
    const response = await get(
      `tag=${tag.slug}&language=IS&country=${iceland.slug}&sort=newest`,
    );
    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe(
      `${SITE_URL}/api/v1/topics?country=${iceland.slug}&tag=${tag.slug}&language=is`,
    );
    // Behind the frontend's pass-through the request names the backend's
    // own address, which browsers never use; the redirect names the site.
    const passedOn = await getTopics(
      new Request(
        `http://localhost:3002/api/v1/topics?sort=newest&tag=${tag.slug}`,
      ),
    );
    expect(passedOn.headers.get("Location")).toBe(
      `${SITE_URL}/api/v1/topics?tag=${tag.slug}`,
    );
  });

  it("does not name someone without a public page when their slug is typed", async () => {
    const response = await get(`person=${draftOnly.slug}`);
    const body = (await response.json()) as BrowseResult;
    expect(body.topics).toEqual([]);
    expect(JSON.stringify(body)).not.toContain("Hiddenpelican");
  });
});
