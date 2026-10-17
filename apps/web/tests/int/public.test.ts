import config from "@payload-config";
import {
  getPayload,
  type Payload,
  type RequiredDataFromCollectionSlug,
} from "payload";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as z from "zod";

import { GET as getFile } from "@/app/(frontend)/files/[id]/route";
import type { Individual, Media, Topic, User } from "@/payload-types";
import {
  loadCountryPage,
  loadHomePage,
  loadIndividualPage,
  loadPublicFile,
  loadTopicPage,
} from "@/public/content";
import { PUBLIC_TAGS } from "@/public-cache";

import {
  file,
  linkNode,
  PDF_BYTES,
  PNG_BYTES,
  richText,
  runReferenceCheck,
  runVideoCheck,
  workerSide,
} from "./fixtures";
import { countryId, SITE_URL, staffProfile } from "./helpers";
import { purgedTags } from "./purged-tags";

// What visitors may see. Every topic, person, file, and video here is made
// up for the tests; YouTube and the reference services are never called.
let payload: Payload;
let worker: Awaited<ReturnType<typeof workerSide>>;
let admin: User;
let kenya: string;
let kenyaSlug: string;

type TopicInput = RequiredDataFromCollectionSlug<"topics">;

let subject: Individual;
let linkedOnly: Individual;
let speakerOnly: Individual;
let draftOnly: Individual;
let portrayed: Individual;
let unnamedWithPhoto: Individual;
let image: Media;
let pdf: Media;
let privateFile: Media;
let photo: Media;
let hiddenPhoto: Media;
let live: Topic;
let archived: Topic;
let draft: Topic;

function individual(name: string, data: Partial<Individual> = {}) {
  return payload.create({
    collection: "individuals",
    data: { name, slug: "", ...data },
    user: admin,
    overrideAccess: false,
  });
}

function upload(name: string, mimetype: string, data: Buffer) {
  return payload.create({
    collection: "media",
    data: {
      alt: `TEST ${name}`,
      licence: "own_work",
      credit: "TEST credit",
    },
    file: file(name, mimetype, data),
    user: admin,
    overrideAccess: false,
  });
}

async function confirmedReference(url: string) {
  const reference = await payload.create({
    collection: "references",
    data: {
      title: `TEST report at ${url}`,
      kind: "report",
      url,
      authors: "A. Example\nB. Example",
      publishedDate: "2024-05",
      checkStatus: "pending",
    },
    user: admin,
    overrideAccess: false,
  });
  await runReferenceCheck(payload, worker.store, reference.id);
  return reference;
}

function createTopic(data: Partial<TopicInput>) {
  return payload.create({
    collection: "topics",
    data: {
      title: "TEST public topic",
      slug: "",
      summary: "A fictional topic for the public page tests.",
      body: richText("Fictional text."),
      countries: [kenya],
      ...data,
    } as TopicInput,
    draft: true,
    user: admin,
    overrideAccess: false,
  });
}

const validationError = z.object({
  data: z.object({ errors: z.array(z.object({ path: z.string() })) }),
});

async function refusedPaths(promise: Promise<unknown>): Promise<string[]> {
  try {
    await promise;
  } catch (error) {
    return validationError.parse(error).data.errors.map((entry) => entry.path);
  }
  throw new Error("Expected the save to be refused");
}

function snippetOf(data: { caption: string; speaker?: string }) {
  return payload.create({
    collection: "snippets",
    // The same video as the one beforeAll had the worker confirm.
    data: {
      youtubeId: "TESTpubl001",
      startS: 10,
      endS: 20,
      language: "en",
      transcriptTimebase: "video",
      ...data,
    },
    user: admin,
    overrideAccess: false,
  });
}

function publish(id: string, data: Partial<TopicInput> = {}) {
  return payload.update({
    collection: "topics",
    id,
    data: { ...data, _status: "published" },
    user: admin,
    overrideAccess: false,
  });
}

beforeAll(async () => {
  payload = await getPayload({ config });
  worker = await workerSide();
  admin = await staffProfile(payload, "public-admin", "admin");
  kenya = await countryId(payload, "KE");
  kenyaSlug = (
    await payload.findByID({
      collection: "countries",
      id: kenya,
      overrideAccess: true,
    })
  ).slug;

  subject = await individual("TEST Public Subject", {
    summary: "TEST minister",
    bio: "TEST bio that cites no evidence",
    aliases: [{ name: "TEST Alias Subject" }],
    links: [{ label: "Official page", url: "https://example.org/subject" }],
  });
  linkedOnly = await individual("TEST Linked In Text");
  speakerOnly = await individual("TEST Snippet Speaker");
  draftOnly = await individual("TEST Only In A Draft");
  image = await upload("public-evidence.png", "image/png", PNG_BYTES);
  pdf = await upload("public-evidence.pdf", "application/pdf", PDF_BYTES);
  privateFile = await upload("never-used.png", "image/png", PNG_BYTES);
  photo = await upload("portrait.png", "image/png", PNG_BYTES);
  hiddenPhoto = await upload("hidden-portrait.png", "image/png", PNG_BYTES);
  portrayed = await individual("TEST Portrayed Person", { photo: photo.id });
  unnamedWithPhoto = await individual("TEST Unnamed With Photo", {
    photo: hiddenPhoto.id,
  });

  const snippet = await payload.create({
    collection: "snippets",
    data: {
      caption: "TEST public snippet",
      youtubeId: "TESTpubl001",
      startS: 10,
      endS: 20,
      speaker: speakerOnly.id,
      language: "en",
      transcriptTimebase: "video",
      transcriptText: [
        "0:12 TEST spoken inside the clip",
        "0:25 TEST pasted line outside the clip",
      ].join("\n"),
    },
    user: admin,
    overrideAccess: false,
  });
  const videoId =
    typeof snippet.video === "string" ? snippet.video : snippet.video?.id;
  if (!videoId) throw new Error("The snippet has no video");
  await runVideoCheck(payload, worker.store, videoId);
  const reference = await confirmedReference("https://example.org/public-1");

  draft = await createTopic({
    title: "TEST draft topic",
    people: [{ individual: draftOnly.id, role: "subject" }],
  });
  live = await createTopic({
    title: "TEST live topic",
    body: richText(
      "Fictional text.",
      linkNode({ relationTo: "individuals", value: linkedOnly.id }),
      linkNode({ relationTo: "topics", value: draft.id }),
      linkNode("https://example.org/outside"),
    ),
    people: [
      { individual: subject.id, role: "subject" },
      { individual: portrayed.id, role: "mentioned" },
    ],
    evidence: [
      { kind: "image", title: "TEST image", file: image.id },
      { kind: "document", title: "TEST document", file: pdf.id },
      { kind: "link", title: "TEST page", url: "https://example.org/page" },
      { kind: "snippet", snippet: snippet.id, note: "TEST what it shows" },
    ],
    references: [
      { reference: reference.id, stance: "supports", passage: "Quoted." },
    ],
  });
  live = await publish(live.id);
  // A later draft: visitors keep seeing the published version.
  await payload.update({
    collection: "topics",
    id: live.id,
    data: { title: "TEST unpublished new title" },
    draft: true,
    user: admin,
    overrideAccess: false,
  });

  archived = await createTopic({ title: "TEST archived topic" });
  await publish(archived.id);
  archived = await publish(archived.id, {
    archived: true,
    changeNote: "TEST no longer current.",
  });
});

afterAll(async () => {
  await worker?.close();
});

beforeEach(() => {
  purgedTags.length = 0;
});

describe("topic pages", () => {
  it("show the live version of a published topic, with public fields only", async () => {
    const page = await loadTopicPage(live.slug);
    expect(page).toMatchObject({
      title: "TEST live topic",
      state: "published",
      countries: [{ name: "Kenya", slug: kenyaSlug }],
      people: [
        {
          individual: { name: "TEST Public Subject", slug: subject.slug },
          role: "subject",
        },
        {
          individual: { name: "TEST Portrayed Person", slug: portrayed.slug },
          role: "mentioned",
        },
      ],
      references: [
        {
          stance: "supports",
          passage: "Quoted.",
          reference: {
            authors: ["A. Example", "B. Example"],
            publishedDate: "2024-05",
            url: "https://example.org/public-1",
          },
        },
      ],
      changes: [{ kind: "published", note: "First published." }],
    });
    expect(page?.evidence.map((item) => item.kind)).toEqual([
      "image",
      "document",
      "link",
      "snippet",
    ]);
    expect(page?.evidence[0]).toMatchObject({
      file: { url: `/files/${image.id}`, mimeType: "image/png" },
    });
    expect(page?.evidence[3]).toMatchObject({
      note: "TEST what it shows",
      snippet: {
        caption: "TEST public snippet",
        speaker: { name: "TEST Snippet Speaker", slug: speakerOnly.slug },
        videoTitle: "A synthetic clip",
        videoUnavailable: null,
        segments: [{ text: "TEST spoken inside the clip" }],
      },
    });

    // Staff-only details never reach the page: who edited, check details,
    // pasted transcript text outside the clip, later drafts.
    const json = JSON.stringify(page);
    for (const leak of [
      "TEST unpublished new title",
      "TEST pasted line outside the clip",
      admin.email,
      "lastEditedBy",
      "checkStatus",
      "transcriptText",
      "_objectKey",
    ]) {
      expect(json).not.toContain(leak);
    }
  });

  it("link the body to public pages only", async () => {
    const page = await loadTopicPage(live.slug);
    expect(page?.bodyLinks).toEqual({
      [`individuals:${linkedOnly.id}`]: `/individuals/${linkedOnly.slug}`,
    });
  });

  it("keep archived topics, and do not exist for drafts", async () => {
    expect(await loadTopicPage(archived.slug)).toMatchObject({
      state: "archived",
      changes: [{ kind: "archived" }, { kind: "published" }],
    });
    expect(await loadTopicPage(draft.slug)).toBeNull();
    expect(await loadTopicPage("no-such-topic")).toBeNull();
  });
});

describe("lists", () => {
  it("list published topics that are not archived, newest first", async () => {
    const home = await loadHomePage();
    const slugs = home.topics.items.map((topic) => topic.slug);
    expect(slugs).toContain(live.slug);
    expect(slugs).not.toContain(archived.slug);
    expect(slugs).not.toContain(draft.slug);
    expect(home.countries).toContainEqual({ name: "Kenya", slug: kenyaSlug });

    const country = await loadCountryPage(kenyaSlug);
    expect(country?.topics.items.map((topic) => topic.slug)).toContain(
      live.slug,
    );
    const people = country?.people.map((person) => person.slug);
    expect(people).toContain(subject.slug);
    expect(people).not.toContain(draftOnly.slug);
  });

  it("give every country a page, with or without topics", async () => {
    const tanzania = await payload.findByID({
      collection: "countries",
      id: await countryId(payload, "TZ"),
      overrideAccess: true,
    });
    expect(await loadCountryPage(tanzania.slug)).toMatchObject({
      name: tanzania.name,
      topics: { items: [], more: false },
    });
    expect(await loadCountryPage("no-such-country")).toBeNull();
  });
});

describe("individual pages", () => {
  it("exist while a published topic names the person, in any way", async () => {
    for (const person of [subject, linkedOnly, speakerOnly, portrayed]) {
      const page = await loadIndividualPage(person.slug);
      expect(page?.topics.items.map((topic) => topic.slug)).toContain(
        live.slug,
      );
    }
    expect(await loadIndividualPage(draftOnly.slug)).toBeNull();
    expect(await loadIndividualPage(unnamedWithPhoto.slug)).toBeNull();
  });

  it("show who the person is, but not the bio or country roles without sources", async () => {
    const page = await loadIndividualPage(subject.slug);
    expect(page).toMatchObject({
      name: "TEST Public Subject",
      summary: "TEST minister",
      aliases: ["TEST Alias Subject"],
      links: [{ label: "Official page", url: "https://example.org/subject" }],
      photo: null,
    });
    expect(page?.backed).toBeNull();
    expect(JSON.stringify(page)).not.toContain("TEST bio");
    expect((await loadIndividualPage(portrayed.slug))?.photo?.url).toBe(
      `/files/${photo.id}`,
    );
  });
});

describe("files", () => {
  it("are public as evidence of a published topic or a public person's photo", async () => {
    expect(await loadPublicFile(image.id)).not.toBeNull();
    expect(await loadPublicFile(pdf.id)).not.toBeNull();
    expect(await loadPublicFile(photo.id)).not.toBeNull();
    expect(await loadPublicFile(privateFile.id)).toBeNull();
    expect(await loadPublicFile(hiddenPhoto.id)).toBeNull();
  });

  it("are served with their stored type and public cache headers", async () => {
    const get = (id: string) =>
      getFile(new Request(`${SITE_URL}/files/${id}`), {
        params: Promise.resolve({ id }),
      });

    const response = await get(image.id);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toContain(
      "script-src 'none'",
    );
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PNG_BYTES);

    // Ranges and revalidation work as on Payload's own file route.
    const etag = response.headers.get("etag");
    expect(etag).toBeTruthy();
    const unchanged = await getFile(
      new Request(`${SITE_URL}/files/${image.id}`, {
        headers: { "if-none-match": etag ?? "" },
      }),
      { params: Promise.resolve({ id: image.id }) },
    );
    expect(unchanged.status).toBe(304);
    expect(unchanged.headers.get("cache-control")).toBe("public, max-age=3600");
    const part = await getFile(
      new Request(`${SITE_URL}/files/${image.id}`, {
        headers: { range: "bytes=0-7" },
      }),
      { params: Promise.resolve({ id: image.id }) },
    );
    expect(part.status).toBe(206);
    expect(Buffer.from(await part.arrayBuffer())).toEqual(
      PNG_BYTES.subarray(0, 8),
    );

    for (const id of [privateFile.id, hiddenPhoto.id, "not-a-uuid"]) {
      const refused = await get(id);
      expect(refused.status).toBe(404);
      await refused.body?.cancel();
    }
  });
});

describe("cache purges", () => {
  it("purge topic pages when a publish changes the live version, not on draft saves", async () => {
    await payload.update({
      collection: "topics",
      id: live.id,
      data: { summary: "A fictional draft change." },
      draft: true,
      user: admin,
      overrideAccess: false,
    });
    expect(purgedTags).not.toContain(PUBLIC_TAGS.topics);

    await publish(live.id, { changeNote: "TEST change for the purge test." });
    expect(purgedTags).toContain(PUBLIC_TAGS.topics);
  });

  it("purge the pages showing a collection after any change to it", async () => {
    await payload.update({
      collection: "individuals",
      id: draftOnly.id,
      data: { summary: "TEST edited" },
      user: admin,
      overrideAccess: false,
    });
    expect(purgedTags).toEqual([PUBLIC_TAGS.individuals]);
  });
});

describe("individuals linked in a topic's text", () => {
  it("are recorded on the topic and cannot be deleted while it links them", async () => {
    const stored = await payload.findByID({
      collection: "topics",
      id: live.id,
      depth: 0,
      overrideAccess: true,
    });
    expect(stored.linkedIndividuals).toEqual([linkedOnly.id]);
    await expect(
      payload.delete({
        collection: "individuals",
        id: linkedOnly.id,
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("snippet speakers", () => {
  it("count as people the topic names, so publishing needs a reference", async () => {
    const quoting = await snippetOf({
      caption: "TEST quoting snippet",
      speaker: speakerOnly.id,
    });
    const topic = await createTopic({
      title: "TEST topic quoting a speaker",
      evidence: [{ kind: "snippet", snippet: quoting.id }],
    });
    expect(await refusedPaths(publish(topic.id))).toEqual(["references"]);
  });

  it("cannot be added while a published topic uses the snippet without a reference", async () => {
    const silent = await snippetOf({ caption: "TEST snippet with no speaker" });
    const topic = await createTopic({
      title: "TEST topic naming no one",
      evidence: [{ kind: "snippet", snippet: silent.id }],
    });
    // Naming no one, it needs no reference.
    expect((await publish(topic.id)).state).toBe("published");
    expect(
      await refusedPaths(
        payload.update({
          collection: "snippets",
          id: silent.id,
          data: { speaker: speakerOnly.id },
          user: admin,
          overrideAccess: false,
        }),
      ),
    ).toEqual(["speaker"]);
  });
});

describe("saves that do not publish", () => {
  it("never change the live version, even without the draft flag", async () => {
    const topic = await publish(
      (await createTopic({ title: "TEST live before a plain update" })).id,
    );
    purgedTags.length = 0;
    await payload.update({
      collection: "topics",
      id: topic.id,
      data: { title: "TEST changed without publishing" },
      user: admin,
      overrideAccess: false,
    });
    expect((await loadTopicPage(topic.slug))?.title).toBe(
      "TEST live before a plain update",
    );
    expect(purgedTags).not.toContain(PUBLIC_TAGS.topics);
    const latest = await payload.findByID({
      collection: "topics",
      id: topic.id,
      draft: true,
      overrideAccess: true,
    });
    expect(latest.title).toBe("TEST changed without publishing");
  });
});

describe("profile sources", () => {
  it("show the bio and country roles only while every cited source is confirmed", async () => {
    const source = await payload.create({
      collection: "references",
      data: {
        title: "TEST profile source",
        kind: "web_page",
        url: "https://example.org/profile-source",
        checkStatus: "pending",
      },
      user: admin,
      overrideAccess: false,
    });
    await payload.update({
      collection: "individuals",
      id: subject.id,
      data: {
        countries: [{ country: kenya, role: "TEST role", startDate: "2019" }],
        sources: [
          {
            reference: source.id,
            passage: "TEST quoted passage",
            locator: "p. 1",
          },
        ],
      },
      user: admin,
      overrideAccess: false,
    });
    // Cited but still being checked: nothing more is shown.
    expect((await loadIndividualPage(subject.slug))?.backed).toBeNull();

    await runReferenceCheck(payload, worker.store, source.id);
    expect((await loadIndividualPage(subject.slug))?.backed).toEqual({
      bio: "TEST bio that cites no evidence",
      countries: [
        {
          country: { name: "Kenya", slug: kenyaSlug },
          role: "TEST role",
          startDate: "2019",
          endDate: null,
        },
      ],
      sources: [
        expect.objectContaining({
          passage: "TEST quoted passage",
          locator: "p. 1",
          reference: expect.objectContaining({ title: "TEST profile source" }),
        }),
      ],
    });

    // A cited reference stays; editing it withdraws the profile until it is
    // confirmed again.
    await expect(
      payload.delete({
        collection: "references",
        id: source.id,
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await payload.update({
      collection: "references",
      id: source.id,
      data: { url: "https://example.org/profile-source-moved" },
      user: admin,
      overrideAccess: false,
    });
    expect((await loadIndividualPage(subject.slug))?.backed).toBeNull();
  });
});
