import config from "@payload-config";
import {
  getPayload,
  type Payload,
  type RequiredDataFromCollectionSlug,
} from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { User } from "@/payload-types";

import {
  countryId,
  payloadRest,
  signInAsVerifiedStaff,
  staffProfile,
  startEmailWorker,
  testEmail,
} from "./helpers";

// Every topic and person here is made up for the tests.
let payload: Payload;
let stopEmailWorker: (() => Promise<void>) | undefined;
let admin: User;
let moderator: User;
let member: User;
let unverifiedAdmin: User;
let kenya: string;
let individual: string;

type TopicInput = RequiredDataFromCollectionSlug<"topics">;

/** A Lexical document with one paragraph per string; nodes may be passed too. */
function richText(...paragraphs: (string | Record<string, unknown>)[]) {
  const textNode = (text: string) => ({
    type: "text",
    text,
    format: 0,
    detail: 0,
    mode: "normal",
    style: "",
    version: 1,
  });
  return {
    root: {
      type: "root",
      format: "",
      indent: 0,
      version: 1,
      direction: "ltr",
      children: paragraphs.map((content) => ({
        type: "paragraph",
        format: "",
        indent: 0,
        version: 1,
        direction: "ltr",
        textFormat: 0,
        children: [typeof content === "string" ? textNode(content) : content],
      })),
    },
  } as unknown as TopicInput["body"];
}

function linkNode(url: string) {
  return {
    type: "link",
    fields: { linkType: "custom", url, newTab: false },
    format: "",
    indent: 0,
    version: 3,
    direction: "ltr",
    children: [
      {
        type: "text",
        text: "a link",
        format: 0,
        detail: 0,
        mode: "normal",
        style: "",
        version: 1,
      },
    ],
  };
}

function publishable(title: string): Partial<TopicInput> {
  return {
    title,
    summary: "A fictional topic for the tests.",
    body: richText("Fictional text for the tests."),
    countries: [kenya],
    slug: "",
  };
}

function createDraft(data: Partial<TopicInput> & { title: string }) {
  return payload.create({
    collection: "topics",
    data: { slug: "", ...data } as TopicInput,
    draft: true,
    user: admin,
    overrideAccess: false,
  });
}

function saveDraft(id: string, data: Partial<TopicInput>) {
  return payload.update({
    collection: "topics",
    id,
    data,
    draft: true,
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

async function changes(topic: string) {
  const { docs } = await payload.find({
    collection: "topic-changes",
    where: { topic: { equals: topic } },
    sort: "createdAt",
    overrideAccess: true,
  });
  return docs;
}

function fieldError(path: string) {
  return {
    data: { errors: [expect.objectContaining({ path })] },
  };
}

beforeAll(async () => {
  payload = await getPayload({ config });
  stopEmailWorker = startEmailWorker();
  admin = await staffProfile(payload, "topics-admin", "admin");
  moderator = await staffProfile(payload, "topics-moderator", "moderator");
  member = await staffProfile(payload, "topics-member", "member");
  unverifiedAdmin = await staffProfile(
    payload,
    "topics-unverified",
    "admin",
    false,
  );
  kenya = await countryId(payload, "KE");
  const person = await payload.create({
    collection: "individuals",
    data: { name: "Topic Testperson Alpha", slug: "", notADuplicate: true },
    overrideAccess: true,
  });
  individual = person.id;
});

afterAll(async () => {
  await stopEmailWorker?.();
  await payload?.destroy();
});

describe("topic drafts", () => {
  it("save without the publishing checks, and can be marked ready for review", async () => {
    const draft = await createDraft({ title: "Fictional draft topic" });
    expect(draft.state).toBe("draft");
    expect(draft._status).toBe("draft");
    expect(draft.slug).toBe("fictional-draft-topic");
    expect(draft.lastEditedBy).toMatchObject({ id: admin.id });

    const ready = await saveDraft(draft.id, { readyForReview: true });
    expect(ready.state).toBe("in_review");
    expect(await changes(draft.id)).toEqual([]);
  });
});

describe("publishing a topic", () => {
  it("requires a summary, text in the body, a country, and safe links", async () => {
    const draft = await createDraft({ title: "Fictional incomplete topic" });

    await expect(publish(draft.id)).rejects.toMatchObject({ status: 400 });
    await expect(
      publish(draft.id, { ...publishable(draft.title), body: richText("  ") }),
    ).rejects.toMatchObject(fieldError("body"));
    await expect(
      publish(draft.id, { ...publishable(draft.title), countries: [] }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      publish(draft.id, {
        ...publishable(draft.title),
        body: richText(linkNode("javascript:alert(1)")),
      }),
    ).rejects.toMatchObject({ status: 400 });

    const published = await publish(draft.id, {
      ...publishable(draft.title),
      body: richText(linkNode("https://example.org/source")),
    });
    expect(published.state).toBe("published");
  });

  it("keeps the live version while a draft is edited, keeps every version, and logs each publish", async () => {
    const draft = await createDraft({ title: "Fictional lifecycle topic" });
    const first = await publish(draft.id, publishable(draft.title));
    expect(first).toMatchObject({ state: "published", _status: "published" });
    expect(first.firstPublishedAt).toBeTruthy();

    // A draft of changes does not touch what visitors would see.
    await saveDraft(draft.id, { title: "Fictional lifecycle topic, revised" });
    const live = await payload.findByID({
      collection: "topics",
      id: draft.id,
      overrideAccess: true,
    });
    const latest = await payload.findByID({
      collection: "topics",
      id: draft.id,
      draft: true,
      overrideAccess: true,
    });
    expect(live).toMatchObject({
      title: "Fictional lifecycle topic",
      state: "published",
    });
    expect(latest.title).toBe("Fictional lifecycle topic, revised");

    // Every later publish needs a note for the change log.
    await expect(publish(draft.id)).rejects.toMatchObject(
      fieldError("changeNote"),
    );
    const updated = await publish(draft.id, {
      changeNote: "Clarified the title.",
    });
    expect(updated).toMatchObject({
      title: "Fictional lifecycle topic, revised",
      state: "updated",
      firstPublishedAt: first.firstPublishedAt,
    });

    const archived = await publish(draft.id, {
      archived: true,
      changeNote: "No longer current.",
    });
    expect(archived.state).toBe("archived");
    const restored = await publish(draft.id, {
      archived: false,
      changeNote: "Current again.",
    });
    expect(restored.state).toBe("updated");

    const log = await changes(draft.id);
    expect(log.map(({ kind, note }) => ({ kind, note }))).toEqual([
      { kind: "published", note: "First published." },
      { kind: "updated", note: "Clarified the title." },
      { kind: "archived", note: "No longer current." },
      { kind: "restored", note: "Current again." },
    ]);
    expect(log.every((entry) => entry.actor)).toBe(true);

    const versions = await payload.findVersions({
      collection: "topics",
      where: { parent: { equals: draft.id } },
      limit: 0,
      pagination: false,
      overrideAccess: true,
    });
    const versionIds = versions.docs.map((version) => String(version.id));
    // The create, the draft edit, and four publishes.
    expect(versions.docs.length).toBeGreaterThanOrEqual(6);
    for (const entry of log) expect(versionIds).toContain(entry.version);
    const published = versions.docs.find(
      (version) => String(version.id) === log[1]?.version,
    );
    expect(published?.version).toMatchObject({
      title: "Fictional lifecycle topic, revised",
      _status: "published",
    });

    const audit = await payload.find({
      collection: "audit-log",
      where: { targetId: { equals: draft.id } },
      sort: "createdAt",
      overrideAccess: true,
    });
    expect(audit.docs.map((entry) => entry.action)).toEqual([
      "topic.created",
      "topic.published",
      "topic.updated",
      "topic.archived",
      "topic.restored",
    ]);
  });

  it("restores an old version only as a draft, so the next publish still needs a note", async () => {
    const draft = await createDraft({ title: "Fictional restored topic" });
    await publish(draft.id, publishable(draft.title));
    await publish(draft.id, {
      title: "Fictional restored topic, renamed",
      changeNote: "Renamed.",
    });
    const { docs } = await payload.findVersions({
      collection: "topics",
      where: {
        parent: { equals: draft.id },
        "version.title": { equals: "Fictional restored topic" },
        "version._status": { equals: "published" },
      },
      overrideAccess: true,
    });
    const firstPublished = docs[0];
    if (!firstPublished) throw new Error("No published version");

    // As the admin panel does it: through the REST API, with a verified admin.
    const adminEmail = testEmail("topics-restorer");
    await payload.create({
      collection: "users",
      data: { email: adminEmail, role: "admin" },
      overrideAccess: true,
    });
    const jar = await signInAsVerifiedStaff(adminEmail);
    const restore = (search = "") =>
      payloadRest(
        "POST",
        ["topics", "versions", String(firstPublished.id)],
        jar,
        undefined,
        undefined,
        search,
      );

    const asPublished = await restore();
    expect(asPublished.status).toBe(400);
    expect(JSON.stringify(await asPublished.json())).toContain(
      "Restore the version as a draft",
    );
    expect((await restore("?draft=true")).status).toBe(200);
    const live = await payload.findByID({
      collection: "topics",
      id: draft.id,
      overrideAccess: true,
    });
    const latest = await payload.findByID({
      collection: "topics",
      id: draft.id,
      draft: true,
      overrideAccess: true,
    });
    expect(live.title).toBe("Fictional restored topic, renamed");
    expect(latest.title).toBe("Fictional restored topic");
    expect((await changes(draft.id)).map((entry) => entry.kind)).toEqual([
      "published",
      "updated",
    ]);
  });

  it("refuses to unpublish a published topic, which is archived instead", async () => {
    const draft = await createDraft({ title: "Fictional topic kept online" });
    await publish(draft.id, publishable(draft.title));

    // Without `draft: true` this writes the live document: an unpublish.
    await expect(
      payload.update({
        collection: "topics",
        id: draft.id,
        data: { _status: "draft" },
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject(fieldError("_status"));
    const live = await payload.findByID({
      collection: "topics",
      id: draft.id,
      overrideAccess: true,
    });
    expect(live).toMatchObject({ _status: "published", state: "published" });
    expect((await changes(draft.id)).map((entry) => entry.kind)).toEqual([
      "published",
    ]);

    // Saving a draft of changes is still fine.
    await expect(
      saveDraft(draft.id, { summary: "A revised fictional summary." }),
    ).resolves.toMatchObject({ summary: "A revised fictional summary." });
  });

  it("links each individual once per role", async () => {
    const draft = await createDraft({ title: "Fictional topic with people" });
    await expect(
      publish(draft.id, {
        ...publishable(draft.title),
        people: [
          { individual, role: "subject" },
          { individual, role: "subject" },
        ],
      }),
    ).rejects.toMatchObject(fieldError("people"));

    const published = await publish(draft.id, {
      ...publishable(draft.title),
      people: [
        { individual, role: "subject" },
        { individual, role: "speaker" },
      ],
    });
    expect(published.people?.map((row) => row.role)).toEqual([
      "subject",
      "speaker",
    ]);
  });
});

describe("topic access and history", () => {
  it("lets verified staff read, only verified admins write, and nobody else in", async () => {
    for (const user of [undefined, member, unverifiedAdmin]) {
      await expect(
        payload.find({ collection: "topics", user, overrideAccess: false }),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        payload.find({
          collection: "topic-changes",
          user,
          overrideAccess: false,
        }),
      ).rejects.toMatchObject({ status: 403 });
    }
    await expect(
      payload.findVersions({
        collection: "topics",
        user: moderator,
        overrideAccess: false,
      }),
    ).resolves.toBeDefined();
    await expect(
      payload.create({
        collection: "topics",
        data: { title: "Moderator topic", slug: "" } as TopicInput,
        draft: true,
        user: moderator,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("never deletes a published topic or changes its log", async () => {
    const unpublished = await createDraft({
      title: "Fictional discarded draft",
    });
    await payload.delete({
      collection: "topics",
      id: unpublished.id,
      user: admin,
      overrideAccess: false,
    });
    const deleted = await payload.find({
      collection: "audit-log",
      where: {
        action: { equals: "topic.deleted" },
        targetId: { equals: unpublished.id },
      },
      overrideAccess: true,
    });
    expect(deleted.docs).toHaveLength(1);

    const draft = await createDraft({ title: "Fictional kept topic" });
    await publish(draft.id, publishable(draft.title));
    await expect(
      payload.delete({
        collection: "topics",
        id: draft.id,
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toBeDefined();
    await expect(
      payload.findByID({
        collection: "topics",
        id: draft.id,
        overrideAccess: true,
      }),
    ).resolves.toMatchObject({ title: "Fictional kept topic" });

    const [entry] = await changes(draft.id);
    if (!entry) throw new Error("No change log entry");
    await expect(
      payload.create({
        collection: "topic-changes",
        data: { topic: draft.id, kind: "updated", note: "Forged" },
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      payload.update({
        collection: "topic-changes",
        id: entry.id,
        data: { note: "Rewritten" },
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      payload.delete({
        collection: "topic-changes",
        id: entry.id,
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
