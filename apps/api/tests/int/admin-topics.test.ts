import {
  EMPTY_TOPIC,
  editorTopic,
  emptyCitationRow,
  emptyEvidenceRow,
  payloadRefusal,
  type Refusal,
  restoreSearchParams,
  savedTopicSchema,
  storedBodySchema,
  storedTopicSchema,
  topicBodySearchParams,
  topicChangesPageSchema,
  topicChangesSearchParams,
  topicFieldOf,
  topicFieldsSearchParams,
  topicPublishChecks,
  topicSaveBody,
  topicSaveSearchParams,
  type TopicValues,
  topicVersionSchema,
  topicVersionSearchParams,
  topicVersionsPageSchema,
  topicVersionsSearchParams,
} from "@countrytopics/contracts";
import config from "@payload-config";
import { getPayload, type Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { User } from "@/payload-types";

import {
  file,
  linkNode,
  PDF_BYTES,
  PNG_BYTES,
  richText,
  runReferenceCheck,
  workerSide,
} from "./fixtures";
import {
  CookieJar,
  countryId,
  payloadRest,
  signInAsVerifiedStaff,
  staffProfile,
  startEmailWorker,
  testEmail,
} from "./helpers";

// The admin's topic editor (packages/contracts, admin-topics.ts) against
// the backend: the requests it sends, read back as it reads them, and every
// refusal the topic's fields and hooks give, each landing on a field the
// form shows (ADR 0014, phase 8: "every refusal Payload's panel showed is
// shown"). Every topic, person, file, and reference here is made up; links
// use the reserved example.org domain.

let payload: Payload;
let stopEmailWorker: () => Promise<void>;
let worker: Awaited<ReturnType<typeof workerSide>>;
let admin: User;
let adminJar: CookieJar;
let moderatorJar: CookieJar;
let ghana: { id: string; title: string };
let person: { id: string; title: string };
let confirmed: { id: string; title: string; checkStatus: "resolved" };
let pending: { id: string; title: string; checkStatus: "pending" };
let image: { id: string; title: string; mimeType: string; url: null };
let pdf: { id: string; title: string; mimeType: string; url: null };
let unconfirmedSnippet: { id: string; title: string };

/** A topic that may be published as it is: it names nobody. */
function base(title: string): TopicValues {
  return {
    ...EMPTY_TOPIC,
    title,
    summary: "TEST summary for the topic editor.",
    body: richText("TEST body for the topic editor."),
    countries: [ghana],
  };
}

/** Everything a topic that names someone needs to be published. */
function naming(title: string): TopicValues {
  return {
    ...base(title),
    people: [{ individual: person, role: "subject" }],
    evidence: [
      {
        ...emptyEvidenceRow(),
        kind: "link",
        title: "TEST page",
        url: "https://example.org/topic-editor",
      },
    ],
    references: [
      {
        ...emptyCitationRow(),
        reference: confirmed,
        passage: "TEST passage, quoted exactly.",
      },
    ],
  };
}

/** Saves as the editor does: a new topic when `id` is null. */
function save(
  jar: CookieJar,
  id: string | null,
  values: TopicValues,
  publish: boolean,
): Promise<Response> {
  return payloadRest(
    id ? "PATCH" : "POST",
    id ? ["topics", id] : ["topics"],
    jar,
    topicSaveBody(values, publish, { creating: id === null }),
    undefined,
    `?${topicSaveSearchParams(publish)}`,
  );
}

async function saved(response: Response) {
  expect(response.status, await response.clone().text()).toBeLessThan(300);
  return savedTopicSchema.parse(await response.json()).doc;
}

async function refusal(response: Response): Promise<Refusal> {
  expect(response.status).toBeGreaterThanOrEqual(400);
  return payloadRefusal(response.status, await response.json(), topicFieldOf);
}

/** The topic as the editor reads it: its fields, then its body. */
async function read(jar: CookieJar, id: string) {
  const [fields, body] = await Promise.all([
    payloadRest(
      "GET",
      ["topics", id],
      jar,
      undefined,
      undefined,
      `?${topicFieldsSearchParams()}`,
    ),
    payloadRest(
      "GET",
      ["topics", id],
      jar,
      undefined,
      undefined,
      `?${topicBodySearchParams()}`,
    ),
  ]);
  expect(fields.status).toBe(200);
  expect(body.status).toBe(200);
  return editorTopic(
    storedTopicSchema.parse(await fields.json()),
    storedBodySchema.parse(await body.json()).body,
  );
}

async function changeLog(id: string) {
  const response = await payloadRest(
    "GET",
    ["topic-changes"],
    adminJar,
    undefined,
    undefined,
    `?${topicChangesSearchParams(id)}`,
  );
  return topicChangesPageSchema.parse(await response.json()).docs;
}

async function versions(id: string, jar = adminJar) {
  const response = await payloadRest(
    "GET",
    ["topics", "versions"],
    jar,
    undefined,
    undefined,
    `?${topicVersionsSearchParams(id, 1)}`,
  );
  return topicVersionsPageSchema.parse(await response.json());
}

beforeAll(async () => {
  payload = await getPayload({ config });
  stopEmailWorker = startEmailWorker();
  worker = await workerSide();
  admin = await staffProfile(payload, "admin-topics-admin", "admin");
  await staffProfile(payload, "admin-topics-moderator", "moderator");
  [adminJar, moderatorJar] = await Promise.all([
    signInAsVerifiedStaff(testEmail("admin-topics-admin")),
    signInAsVerifiedStaff(testEmail("admin-topics-moderator")),
  ]);
  const asAdmin = { user: admin, overrideAccess: false } as const;
  ghana = { id: await countryId(payload, "GH"), title: "Ghana" };
  const individual = await payload.create({
    collection: "individuals",
    data: { name: "Editor Testperson Gamma", slug: "", notADuplicate: true },
    overrideAccess: true,
  });
  person = { id: individual.id, title: individual.name };
  const reference = await payload.create({
    collection: "references",
    data: {
      title: "TEST confirmed reference for the topic editor",
      kind: "web_page",
      url: "https://example.org/editor-reference",
      checkStatus: "pending",
    },
    ...asAdmin,
  });
  await runReferenceCheck(payload, worker.store, reference.id);
  confirmed = {
    id: reference.id,
    title: reference.title,
    checkStatus: "resolved",
  };
  const waiting = await payload.create({
    collection: "references",
    data: {
      title: "TEST pending reference for the topic editor",
      kind: "web_page",
      url: "https://example.org/editor-pending",
      checkStatus: "pending",
    },
    ...asAdmin,
  });
  pending = { id: waiting.id, title: waiting.title, checkStatus: "pending" };
  const png = await payload.create({
    collection: "media",
    data: { alt: "TEST editor image", licence: "own_work" },
    file: file("editor-image.png", "image/png", PNG_BYTES),
    ...asAdmin,
  });
  image = {
    id: png.id,
    title: "TEST editor image",
    mimeType: "image/png",
    url: null,
  };
  const document = await payload.create({
    collection: "media",
    data: { alt: "TEST editor document", licence: "own_work" },
    file: file("editor-document.pdf", "application/pdf", PDF_BYTES),
    ...asAdmin,
  });
  pdf = {
    id: document.id,
    title: "TEST editor document",
    mimeType: "application/pdf",
    url: null,
  };
  const snippet = await payload.create({
    collection: "snippets",
    data: {
      caption: "TEST snippet whose video is not confirmed",
      youtubeId: "TESTedit001",
      startS: 1,
      endS: 5,
      language: "en",
      transcriptTimebase: "video",
    },
    ...asAdmin,
  });
  unconfirmedSnippet = { id: snippet.id, title: snippet.caption };
});

afterAll(async () => {
  await worker?.close();
  await stopEmailWorker?.();
  await payload?.destroy();
});

describe("a new topic", () => {
  it("saves as a draft with nothing filled in, and reads back as it was", async () => {
    const doc = await saved(await save(adminJar, null, EMPTY_TOPIC, false));
    const topic = await read(adminJar, doc.id);
    expect(topic.values).toEqual({ ...EMPTY_TOPIC, body: null });
    expect(topic.status).toMatchObject({
      latest: "draft",
      state: "draft",
      firstPublishedAt: null,
    });
    expect(topic.status.lastEditedBy?.id).toBe(admin.id);
  });

  it("is refused publishing on each field the editor checks first", async () => {
    // The publish hook refuses a topic without a body before Payload checks
    // the other fields, so the editor checks them all before sending, as
    // Payload's panel does; the backend agrees with each check.
    const empty = await refusal(await save(adminJar, null, EMPTY_TOPIC, true));
    expect(empty.fields).toEqual({
      body: topicPublishChecks(EMPTY_TOPIC).body,
    });
    const withBody = { ...EMPTY_TOPIC, body: richText("TEST body.") };
    const refused = await refusal(await save(adminJar, null, withBody, true));
    expect(refused.fields).toEqual(topicPublishChecks(withBody));
    expect(Object.keys(refused.fields).sort()).toEqual([
      "countries",
      "slug",
      "summary",
      "title",
    ]);
    expect(refused.general).toEqual([]);
  });

  it("is refused publishing empty rows as the editor checks them first", async () => {
    const values: TopicValues = {
      ...base("TEST empty rows"),
      evidence: (["document", "image", "link", "snippet"] as const).map(
        (kind) => ({ ...emptyEvidenceRow(), kind }),
      ),
      references: [emptyCitationRow()],
    };
    const refused = await refusal(await save(adminJar, null, values, true));
    expect(refused.fields).toEqual(topicPublishChecks(values));
    expect(refused.general).toEqual([]);
  });
});

describe("every refusal of a publish", () => {
  let draft: string;
  let other: string;

  beforeAll(async () => {
    draft = (
      await saved(await save(adminJar, null, base("TEST refusals"), false))
    ).id;
    const published = await saved(
      await save(adminJar, null, base("TEST slug taken"), true),
    );
    other = published.slug ?? "";
  });

  const long = (length: number) => "x".repeat(length);
  const cases: [string, () => TopicValues, string, RegExp][] = [
    ["a title too long", () => ({ ...base(long(201)) }), "title", /200/],
    [
      "a summary too long",
      () => ({ ...base("TEST"), summary: long(501) }),
      "summary",
      /500/,
    ],
    [
      "a body without words",
      () => ({ ...base("TEST"), body: richText(" ") }),
      "body",
      /Write the topic before publishing/,
    ],
    [
      "a body link that is not a web or email address",
      () => ({
        ...base("TEST"),
        body: richText(linkNode("javascript:alert(1)")),
      }),
      // Payload's link check, which the editor's link form runs first.
      "body",
      /url/,
    ],
    [
      "an individual listed twice in one role",
      () => {
        const values = naming("TEST");
        return { ...values, people: [...values.people, ...values.people] };
      },
      "people",
      /once per role/,
    ],
    [
      "an individual row without an individual",
      () => ({
        ...naming("TEST"),
        people: [{ individual: null, role: "subject" }],
      }),
      "people.0.individual",
      /required/,
    ],
    [
      "naming an individual without evidence",
      () => ({ ...naming("TEST"), evidence: [] }),
      "evidence",
      /at least one piece of evidence/,
    ],
    [
      "naming an individual without a reference",
      () => ({ ...naming("TEST"), references: [] }),
      "references",
      /at least one reference/,
    ],
    [
      "naming an individual in the body only",
      () => ({
        ...base("TEST"),
        body: richText(
          linkNode({ relationTo: "individuals", value: person.id }),
        ),
      }),
      "evidence",
      /at least one piece of evidence/,
    ],
    [
      "evidence without a title",
      () => ({
        ...base("TEST"),
        evidence: [{ ...emptyEvidenceRow(), kind: "image", file: image }],
      }),
      "evidence.0.title",
      /Give the evidence a title/,
    ],
    [
      "an image without its file",
      () => ({
        ...base("TEST"),
        evidence: [{ ...emptyEvidenceRow(), kind: "image", title: "TEST" }],
      }),
      "evidence.0.file",
      /required/,
    ],
    [
      "a document whose file is an image",
      () => ({
        ...base("TEST"),
        evidence: [
          {
            ...emptyEvidenceRow(),
            kind: "document",
            title: "TEST",
            file: image,
          },
        ],
      }),
      "evidence.0.file",
      /invalid/i,
    ],
    [
      "a web page without its link",
      () => ({
        ...base("TEST"),
        evidence: [{ ...emptyEvidenceRow(), kind: "link", title: "TEST" }],
      }),
      "evidence.0.url",
      /Enter the page's link/,
    ],
    [
      "a web page whose link is not http",
      () => ({
        ...base("TEST"),
        evidence: [
          {
            ...emptyEvidenceRow(),
            kind: "link",
            title: "TEST",
            url: "ftp://example.org/file",
          },
        ],
      }),
      "evidence.0.url",
      /http/,
    ],
    [
      "another archive's copy that is not a link",
      () => ({
        ...base("TEST"),
        evidence: [
          {
            ...emptyEvidenceRow(),
            kind: "link",
            title: "TEST",
            url: "https://example.org/page",
            archiveUrl: "not a link",
          },
        ],
      }),
      "evidence.0.archiveUrl",
      /http/,
    ],
    [
      "a snippet row without its snippet",
      () => ({
        ...base("TEST"),
        evidence: [{ ...emptyEvidenceRow(), kind: "snippet" }],
      }),
      "evidence.0.snippet",
      /required/,
    ],
    [
      "a snippet whose video is not confirmed",
      () => ({
        ...base("TEST"),
        evidence: [
          {
            ...emptyEvidenceRow(),
            kind: "snippet",
            snippet: unconfirmedSnippet,
          },
        ],
      }),
      "evidence",
      /Snippets need a video confirmed to play/,
    ],
    [
      "a note too long",
      () => ({
        ...base("TEST"),
        evidence: [
          {
            ...emptyEvidenceRow(),
            kind: "document",
            title: "TEST",
            file: pdf,
            note: long(1001),
          },
        ],
      }),
      "evidence.0.note",
      /1000/,
    ],
    [
      "a cited reference row without its reference",
      () => ({
        ...base("TEST"),
        references: [{ ...emptyCitationRow(), passage: "TEST passage." }],
      }),
      "references.0.reference",
      /required/,
    ],
    [
      "a cited reference without its passage",
      () => ({
        ...base("TEST"),
        references: [{ ...emptyCitationRow(), reference: confirmed }],
      }),
      "references.0.passage",
      /required/,
    ],
    [
      "a page or section too long",
      () => ({
        ...base("TEST"),
        references: [
          {
            ...emptyCitationRow(),
            reference: confirmed,
            passage: "TEST passage.",
            locator: long(101),
          },
        ],
      }),
      "references.0.locator",
      /100/,
    ],
    [
      "a reference not yet confirmed",
      () => ({
        ...base("TEST"),
        references: [
          {
            ...emptyCitationRow(),
            reference: pending,
            passage: "TEST passage.",
          },
        ],
      }),
      "references",
      /must be confirmed before publishing/,
    ],
    [
      "a slug that is not one",
      () => ({ ...base("TEST"), slug: "Not A Slug" }),
      "slug",
      /lowercase letters/,
    ],
    [
      "a change note too long",
      () => ({ ...base("TEST"), changeNote: long(501) }),
      "changeNote",
      /500/,
    ],
  ];

  it.each(cases)(
    "lands on its field: %s",
    async (_name, values, key, message) => {
      const refused = await refusal(
        await save(adminJar, draft, values(), true),
      );
      expect(refused.general, JSON.stringify(refused)).toEqual([]);
      expect(refused.fields[key]?.join(" "), JSON.stringify(refused)).toMatch(
        message,
      );
    },
  );

  it("lands on its field: a slug another topic has", async () => {
    const refused = await refusal(
      await save(adminJar, draft, { ...base("TEST"), slug: other }, true),
    );
    expect(refused.general, JSON.stringify(refused)).toEqual([]);
    expect(
      refused.fields.slug?.length,
      JSON.stringify(refused),
    ).toBeGreaterThan(0);
  });

  it("left the draft as it was", async () => {
    const topic = await read(adminJar, draft);
    expect(topic.values.title).toBe("TEST refusals");
    expect(topic.status.firstPublishedAt).toBeNull();
  });
});

describe("publishing", () => {
  let id: string;

  it("publishes a topic that names someone, with its rows' titles read back", async () => {
    const doc = await saved(
      await save(adminJar, null, naming("TEST editor publish"), true),
    );
    id = doc.id;
    const topic = await read(adminJar, id);
    expect(topic.status).toMatchObject({
      latest: "published",
      state: "published",
    });
    expect(topic.values.people).toEqual([
      { id: expect.any(String), individual: person, role: "subject" },
    ]);
    expect(topic.values.references[0]?.reference).toEqual(confirmed);
    expect(topic.values.evidence[0]).toMatchObject({
      kind: "link",
      url: "https://example.org/topic-editor",
      file: null,
    });
    const [entry] = await changeLog(id);
    expect(entry).toMatchObject({
      kind: "published",
      note: "First published.",
    });
  });

  it("asks for a change note to publish again, then logs it", async () => {
    const { values } = await read(adminJar, id);
    const edited = { ...values, summary: "TEST summary, edited." };
    const refused = await refusal(await save(adminJar, id, edited, true));
    expect(refused.fields.changeNote?.join(" ")).toMatch(
      /Say what changed and why/,
    );
    expect(refused.general).toEqual([]);

    await saved(
      await save(
        adminJar,
        id,
        { ...edited, changeNote: "TEST: shorter summary." },
        true,
      ),
    );
    const [entry] = await changeLog(id);
    expect(entry).toMatchObject({
      kind: "updated",
      note: "TEST: shorter summary.",
    });
    expect((await read(adminJar, id)).status.state).toBe("updated");
  });

  it("keeps each row's id across saves", async () => {
    const before = await read(adminJar, id);
    const doc = await saved(await save(adminJar, id, before.values, false));
    expect(doc.people?.map((row) => row.id)).toEqual(
      before.values.people.map((row) => row.id),
    );
    expect(doc.evidence?.map((row) => row.id)).toEqual(
      before.values.evidence.map((row) => row.id),
    );
  });

  it("saves a draft without changing what visitors see", async () => {
    const { values } = await read(adminJar, id);
    await saved(
      await save(adminJar, id, { ...values, title: "TEST draft title" }, false),
    );
    const topic = await read(adminJar, id);
    expect(topic.values.title).toBe("TEST draft title");
    expect(topic.status).toMatchObject({ latest: "draft", state: "updated" });
    const live = await payload.findByID({
      collection: "topics",
      id,
      draft: false,
      depth: 0,
      overrideAccess: true,
    });
    expect(live.title).toBe("TEST editor publish");
  });

  it("archives with a change note", async () => {
    const { values } = await read(adminJar, id);
    await saved(
      await save(
        adminJar,
        id,
        { ...values, archived: true, changeNote: "TEST: archived." },
        true,
      ),
    );
    const [entry] = await changeLog(id);
    expect(entry).toMatchObject({ kind: "archived", note: "TEST: archived." });
    expect((await read(adminJar, id)).status.state).toBe("archived");
  });

  it("lists every version, and restores one as the newest draft", async () => {
    const page = await versions(id);
    expect(page.totalDocs).toBeGreaterThanOrEqual(4);
    const first = page.docs.at(-1);
    expect(first?.version.title).toBe("TEST editor publish");
    const whole = await payloadRest(
      "GET",
      ["topics", "versions", first?.id ?? ""],
      adminJar,
      undefined,
      undefined,
      `?${topicVersionSearchParams()}`,
    );
    const version = topicVersionSchema.parse(await whole.json());
    expect(version.version.people?.[0]?.individual).toMatchObject({
      id: person.id,
      name: person.title,
    });

    const restored = await payloadRest(
      "POST",
      ["topics", "versions", first?.id ?? ""],
      adminJar,
      undefined,
      undefined,
      `?${restoreSearchParams("topics")}`,
    );
    expect(restored.status).toBe(200);
    const topic = await read(adminJar, id);
    expect(topic.values).toMatchObject({
      title: "TEST editor publish",
      archived: false,
    });
    expect(topic.status).toMatchObject({ latest: "draft", state: "archived" });
  });

  it("refuses restoring over the published topic, which the editor never asks", async () => {
    const page = await versions(id);
    const refused = await refusal(
      await payloadRest(
        "POST",
        ["topics", "versions", page.docs.at(-1)?.id ?? ""],
        adminJar,
        undefined,
        undefined,
        "?depth=0",
      ),
    );
    expect(refused.fields.changeNote?.join(" ")).toMatch(
      /only be restored as a draft/,
    );
  });

  it("refuses unpublishing, which the editor never asks, above the form", async () => {
    const refused = await refusal(
      await payloadRest(
        "PATCH",
        ["topics", id],
        adminJar,
        { _status: "draft" },
        undefined,
        "?depth=0",
      ),
    );
    expect(refused.fields).toEqual({});
    expect(refused.general.join(" ")).toMatch(/Topics are not unpublished/);
  });

  it("refuses deleting a published topic, and deletes a draft", async () => {
    const refused = await refusal(
      await payloadRest("DELETE", ["topics", id], adminJar),
    );
    expect(refused.general.length).toBeGreaterThan(0);
    const draft = await saved(
      await save(adminJar, null, base("TEST deleted draft"), false),
    );
    const deleted = await payloadRest("DELETE", ["topics", draft.id], adminJar);
    expect(deleted.status).toBe(200);
    const gone = await payloadRest(
      "GET",
      ["topics", draft.id],
      adminJar,
      undefined,
      undefined,
      `?${topicFieldsSearchParams()}`,
    );
    expect(gone.status).toBe(404);
  });

  it("lets moderators read the editor but refuses each of their writes", async () => {
    const topic = await read(moderatorJar, id);
    expect(topic.values.people[0]?.individual).toEqual(person);
    const refused = await refusal(
      await save(moderatorJar, id, topic.values, false),
    );
    expect(refused.general.join(" ")).toMatch(/not allowed/);
    expect(refused.fields).toEqual({});
    const created = await refusal(
      await save(moderatorJar, null, EMPTY_TOPIC, false),
    );
    expect(created.general.join(" ")).toMatch(/not allowed/);
    expect((await versions(id, moderatorJar)).totalDocs).toBeGreaterThan(0);
  });
});
