import {
  ADMIN_COLLECTIONS,
  adminListSearchParams,
  adminListWhere,
  adminPageSchema,
  adminRowSchema,
  bulkActions,
  type BulkAction,
  bulkAnswerSchema,
  bulkBody,
  bulkOutcome,
  bulkSearchParams,
  type BulkTarget,
  documentLockSearchParams,
  duplicateAnswerSchema,
  duplicateSearchParams,
  EMPTY_SNIPPET,
  editorMedia,
  isDuplicated,
  isRecordId,
  listLocksSearchParams,
  listPreferenceKey,
  LOCK_DURATION_S,
  lockBody,
  lockedDocument,
  LOCKED_MESSAGE,
  lockHolder,
  locksPageSchema,
  mediaFieldOf,
  mediaSaveBody,
  mediaSearchParams,
  payloadRefusal,
  preferenceAnswerSchema,
  previousVersionSearchParams,
  readListPreference,
  referenceVersionSchema,
  restoreSearchParams,
  savedRecordSchema,
  snippetSaveBody,
  snippetSearchParams,
  snippetVersionSchema,
  storedLockSchema,
  storedMediaSchema,
  storedSnippetSchema,
  topicSaveSearchParams,
  TopicPage,
  versionSearchParams,
  versionsPageSchema,
  versionsSearchParams,
} from "@countrytopics/contracts";
import config from "@payload-config";
import {
  getPayload,
  type Payload,
  type RequiredDataFromCollectionSlug,
} from "payload";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as z from "zod";

import { GET as getPreview } from "@/app/api/v1/previews/topics/[id]/route";
import type { Media, Topic, User } from "@/payload-types";
import { loadTopicPage } from "@/public/topic-page";

import { file, PNG_BYTES, richText } from "./fixtures";
import {
  clearRateLimits,
  contractJson,
  CookieJar,
  countryId,
  payloadRest,
  payloadUpload,
  signInAsVerifiedStaff,
  signInWithEmailLink,
  SITE_URL,
  staffProfile,
  startEmailWorker,
  testEmail,
} from "./helpers";

// The admin's parity with Payload's panel (ADR 0014, phase 11) against the
// backend: autosaves that keep one version, a draft's live preview for
// staff only, document locks that stop anyone else's saves, bulk actions
// as the admin sends them, duplicates, versions compared and restored,
// each staff member's own list settings, and an image's focal point. Every
// person, record, and address here is made up; addresses use the reserved
// example.test domain.

let payload: Payload;
let stopEmailWorker: () => Promise<void>;
let admin: User;
let otherAdmin: User;
let member: User;
let adminJar: CookieJar;
let otherAdminJar: CookieJar;
let moderatorJar: CookieJar;
let memberJar: CookieJar;
let unverifiedJar: CookieJar;
let luxembourg: string;

const asAdmin = () => ({ user: admin, overrideAccess: false });

async function draftTopic(title: string): Promise<Topic> {
  return payload.create({
    collection: "topics",
    data: {
      title,
      slug: "",
      summary: "A made-up topic.",
      body: richText("Made-up text."),
      countries: [luxembourg],
    } as RequiredDataFromCollectionSlug<"topics">,
    draft: true,
    ...asAdmin(),
  });
}

async function publishedTopic(title: string): Promise<Topic> {
  const draft = await draftTopic(title);
  return payload.update({
    collection: "topics",
    id: draft.id,
    data: { _status: "published" },
    ...asAdmin(),
  });
}

const sorted = (ids: readonly string[]) => [...ids].sort();

async function json(response: Response): Promise<unknown> {
  return response.json();
}

async function expectStatus(response: Response, status: number) {
  expect(response.status, await response.clone().text()).toBe(status);
}

/** How many versions Payload keeps of a topic. */
async function versionCount(topic: string): Promise<number> {
  const { totalDocs } = await payload.findVersions({
    collection: "topics",
    where: { parent: { equals: topic } },
    limit: 1,
    overrideAccess: true,
  });
  return totalDocs;
}

/** The audit log's entries for one record, newest first. */
async function audited(targetId: string) {
  const { docs } = await payload.find({
    collection: "audit-log",
    where: { targetId: { equals: targetId } },
    sort: "-createdAt",
    pagination: false,
    overrideAccess: true,
  });
  return docs;
}

function bulk(
  jar: CookieJar,
  collection: string,
  action: BulkAction,
  target: BulkTarget,
  inputs: { changeNote?: string; moderationReason?: string } = {},
) {
  return payloadRest(
    action.method,
    [collection],
    jar,
    action.method === "PATCH" ? bulkBody(action, inputs) : undefined,
    undefined,
    `?${bulkSearchParams(action, target)}`,
  );
}

function actionOf(collection: (typeof ADMIN_COLLECTIONS)[number], id: string) {
  const action = bulkActions(collection, "admin").find((a) => a.id === id);
  if (!action) throw new Error(`No bulk action ${id} on ${collection}`);
  return action;
}

async function outcome(response: Response, selected: string[] = []) {
  expect([200, 400], await response.clone().text()).toContain(response.status);
  return bulkOutcome(bulkAnswerSchema.parse(await json(response)), selected);
}

function preview(jar: CookieJar | null, id: string) {
  const request = new Request(`${SITE_URL}/api/v1/previews/topics/${id}`, {
    headers: jar ? { cookie: jar.header() } : {},
  });
  return getPreview(request, { params: Promise.resolve({ id }) });
}

function lock(jar: CookieJar, collection: "topics", id: string, user: string) {
  return payloadRest(
    "POST",
    ["payload-locked-documents"],
    jar,
    lockBody(collection, id, user),
  );
}

async function locksOn(jar: CookieJar, id: string) {
  const response = await payloadRest(
    "GET",
    ["payload-locked-documents"],
    jar,
    undefined,
    undefined,
    `?${documentLockSearchParams("topics", id)}`,
  );
  await expectStatus(response, 200);
  return locksPageSchema.parse(await json(response)).docs;
}

beforeAll(async () => {
  payload = await getPayload({ config });
  stopEmailWorker = startEmailWorker();
  admin = await staffProfile(payload, "admin-parity-admin", "admin");
  otherAdmin = await staffProfile(payload, "admin-parity-other", "admin");
  await staffProfile(payload, "admin-parity-moderator", "moderator");
  member = await staffProfile(payload, "admin-parity-member", "member");
  await staffProfile(payload, "admin-parity-unverified", "admin", false);
  [adminJar, otherAdminJar, moderatorJar, memberJar, unverifiedJar] =
    await Promise.all([
      signInAsVerifiedStaff(testEmail("admin-parity-admin")),
      signInAsVerifiedStaff(testEmail("admin-parity-other")),
      signInAsVerifiedStaff(testEmail("admin-parity-moderator")),
      signInWithEmailLink(testEmail("admin-parity-member")),
      signInWithEmailLink(testEmail("admin-parity-unverified")),
    ]);
  luxembourg = await countryId(payload, "LU");
});

// Each test saves more often than the staff write limit allows a person.
beforeEach(clearRateLimits);

afterAll(async () => {
  await stopEmailWorker?.();
  await payload?.destroy();
});

describe("autosave", () => {
  it("keeps one version while an editor types, and audits each autosave", async () => {
    const topic = await draftTopic("TEST autosaved topic");
    const before = await versionCount(topic.id);
    const autosave = topicSaveSearchParams(false, { autosave: true });
    for (const title of [
      "TEST autosaved topic, one",
      "TEST autosaved topic, two",
    ]) {
      await expectStatus(
        await payloadRest(
          "PATCH",
          ["topics", topic.id],
          adminJar,
          { title, _status: "draft" },
          undefined,
          `?${autosave}`,
        ),
        200,
      );
    }
    expect(await versionCount(topic.id)).toBe(before + 1);
    const { docs } = await payload.findVersions({
      collection: "topics",
      where: { parent: { equals: topic.id } },
      sort: "-updatedAt",
      limit: 1,
      overrideAccess: true,
    });
    expect(docs[0]?.version.title).toBe("TEST autosaved topic, two");
    const saves = (await audited(topic.id)).filter(
      (entry) => entry.action === "topic.draft_saved",
    );
    // Newest first, each with what it changed.
    expect(saves.map((entry) => entry.details)).toMatchObject([
      { autosave: true, fields: ["title"] },
      { autosave: true, fields: ["title"] },
    ]);

    // Saving the draft keeps a version of its own; the next autosave
    // starts another.
    await expectStatus(
      await payloadRest(
        "PATCH",
        ["topics", topic.id],
        adminJar,
        { title: "TEST autosaved topic, saved", _status: "draft" },
        undefined,
        `?${topicSaveSearchParams(false)}`,
      ),
      200,
    );
    expect(await versionCount(topic.id)).toBe(before + 2);
    await expectStatus(
      await payloadRest(
        "PATCH",
        ["topics", topic.id],
        adminJar,
        { title: "TEST autosaved topic, typed again", _status: "draft" },
        undefined,
        `?${autosave}`,
      ),
      200,
    );
    expect(await versionCount(topic.id)).toBe(before + 3);
  });
});

describe("the live preview", () => {
  it("shows staff a topic's newest draft as its page will look, never cached", async () => {
    const topic = await publishedTopic("TEST previewed topic");
    const image = (await payload.create({
      collection: "media",
      data: { alt: "TEST previewed image", licence: "own_work" },
      file: file("previewed.png", "image/png", PNG_BYTES),
      ...asAdmin(),
    })) as Media;
    // A draft visitors do not see yet: retitled, archived, with new evidence.
    await payload.update({
      collection: "topics",
      id: topic.id,
      data: {
        title: "TEST previewed topic, redrafted",
        archived: true,
        evidence: [{ kind: "image", title: "TEST evidence", file: image.id }],
      },
      draft: true,
      ...asAdmin(),
    });
    const response = await preview(moderatorJar, topic.id);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const page = await contractJson(TopicPage, response);
    expect(page.title).toBe("TEST previewed topic, redrafted");
    expect(page.state).toBe("archived");
    const evidence = page.evidence[0];
    expect(evidence?.kind).toBe("image");
    // Linked where Payload serves it to staff: it is not public yet.
    expect(evidence?.kind === "image" && evidence.file.url).toBe(
      `/api/media/file/${encodeURIComponent(image.filename ?? "")}`,
    );
    // Visitors still see the published version.
    expect((await loadTopicPage(topic.slug))?.title).toBe(
      "TEST previewed topic",
    );
  });

  it("is refused to anyone but verified staff, and finds no unknown topic", async () => {
    const topic = await draftTopic("TEST topic previewed by nobody");
    expect((await preview(null, topic.id)).status).toBe(401);
    expect((await preview(memberJar, topic.id)).status).toBe(403);
    expect((await preview(unverifiedJar, topic.id)).status).toBe(403);
    expect(
      (await preview(adminJar, "0190f5b1-0000-7000-8000-000000000000")).status,
    ).toBe(404);
    expect((await preview(adminJar, "../pages/home")).status).toBe(404);
  });
});

describe("document locks", () => {
  it("are for verified staff only, and name whoever took them", async () => {
    const topic = await draftTopic("TEST locked topic");
    expect((await lock(memberJar, "topics", topic.id, member.id)).status).toBe(
      403,
    );
    const memberRead = await payloadRest(
      "GET",
      ["payload-locked-documents"],
      memberJar,
      undefined,
      undefined,
      `?${documentLockSearchParams("topics", topic.id)}`,
    );
    expect(memberRead.status).toBe(403);

    // A lock taken in someone else's name still names who took it.
    const taken = await lock(adminJar, "topics", topic.id, otherAdmin.id);
    await expectStatus(taken, 201);
    const created = savedRecordSchema(storedLockSchema).parse(
      await json(taken),
    );
    expect(lockHolder(created.doc)?.id).toBe(admin.id);

    const [seen] = await locksOn(otherAdminJar, topic.id);
    expect(seen && lockHolder(seen)).toEqual({
      id: admin.id,
      email: testEmail("admin-parity-admin"),
    });
    // Moderators read no account but their own: the holder by id only.
    const [moderatorSees] = await locksOn(moderatorJar, topic.id);
    expect(moderatorSees && lockHolder(moderatorSees)).toEqual({
      id: admin.id,
      email: null,
    });
  });

  it("stop anyone else's saves until taken over, and clear on each save", async () => {
    const topic = await draftTopic("TEST topic two editors open");
    await expectStatus(await lock(adminJar, "topics", topic.id, admin.id), 201);
    const draft = {
      title: "TEST topic two editors open, changed",
      _status: "draft",
    };
    const refused = await payloadRest(
      "PATCH",
      ["topics", topic.id],
      otherAdminJar,
      draft,
      undefined,
      `?${topicSaveSearchParams(false)}`,
    );
    expect(refused.status).toBe(423);
    expect(payloadRefusal(423, await json(refused), () => null)).toEqual({
      fields: {},
      general: [LOCKED_MESSAGE],
    });
    // A bulk action leaves the locked topic as it is, and says why.
    const inBulk = await outcome(
      await bulk(otherAdminJar, "topics", actionOf("topics", "ready"), {
        kind: "ids",
        ids: [topic.id],
      }),
    );
    expect(inBulk.refused).toEqual([{ id: topic.id, message: LOCKED_MESSAGE }]);

    // Taking over: the other admin's lock, then their save.
    const [held] = await locksOn(otherAdminJar, topic.id);
    expect(held).toBeDefined();
    await expectStatus(
      await payloadRest(
        "PATCH",
        ["payload-locked-documents", held?.id ?? ""],
        otherAdminJar,
        lockBody("topics", topic.id, otherAdmin.id),
      ),
      200,
    );
    await expectStatus(
      await payloadRest(
        "PATCH",
        ["topics", topic.id],
        adminJar,
        draft,
        undefined,
        `?${topicSaveSearchParams(false)}`,
      ),
      423,
    );
    await expectStatus(
      await payloadRest(
        "PATCH",
        ["topics", topic.id],
        otherAdminJar,
        draft,
        undefined,
        `?${topicSaveSearchParams(false)}`,
      ),
      200,
    );
    // The save cleared the topic's locks; the editor takes its lock again.
    expect(await locksOn(adminJar, topic.id)).toEqual([]);
  });

  it("stop holding once stale, as Payload judges them", async () => {
    const topic = await draftTopic("TEST topic left open");
    const taken = await lock(adminJar, "topics", topic.id, admin.id);
    const created = savedRecordSchema(storedLockSchema).parse(
      await json(taken),
    );
    // Refreshed longer ago than a lock lasts, by Payload's own clock.
    const stale = new Date(Date.now() - (LOCK_DURATION_S + 60) * 1_000);
    await payload.db.updateOne({
      collection: "payload-locked-documents",
      id: created.doc.id,
      data: { updatedAt: stale.toISOString() },
    });
    const [stored] = await locksOn(adminJar, topic.id);
    expect(stored?.updatedAt).toBe(stale.toISOString());
    await expectStatus(
      await payloadRest(
        "PATCH",
        ["topics", topic.id],
        otherAdminJar,
        { title: "TEST topic left open, taken on", _status: "draft" },
        undefined,
        `?${topicSaveSearchParams(false)}`,
      ),
      200,
    );
  });

  it("last as long as the admin expects, in every collection", () => {
    for (const slug of ADMIN_COLLECTIONS) {
      const setting = payload.collections[slug].config.lockDocuments;
      // Unset, Payload's default holds (checkDocumentLockStatus).
      const duration =
        setting === undefined ? LOCK_DURATION_S : setting && setting.duration;
      expect(duration, slug).toBe(LOCK_DURATION_S);
    }
  });

  it("are found for a list's records", async () => {
    const [first, second] = await Promise.all([
      draftTopic("TEST listed topic, open"),
      draftTopic("TEST listed topic, closed"),
    ]);
    await expectStatus(await lock(adminJar, "topics", first.id, admin.id), 201);
    const response = await payloadRest(
      "GET",
      ["payload-locked-documents"],
      moderatorJar,
      undefined,
      undefined,
      `?${listLocksSearchParams("topics", [first.id, second.id])}`,
    );
    await expectStatus(response, 200);
    const { docs } = locksPageSchema.parse(await json(response));
    expect(docs.map(lockedDocument)).toEqual([first.id]);
  });
});

describe("bulk actions", () => {
  it("publish topics' newest drafts, each with what it needs", async () => {
    const draft = await draftTopic("TEST topic published in bulk");
    const published = await publishedTopic("TEST topic republished in bulk");
    await payload.update({
      collection: "topics",
      id: published.id,
      data: { summary: "A made-up topic, changed." },
      draft: true,
      ...asAdmin(),
    });
    const publish = actionOf("topics", "publish");
    const target: BulkTarget = { kind: "ids", ids: [draft.id, published.id] };
    // Without a note, only the topic never published goes.
    const first = await outcome(
      await bulk(adminJar, "topics", publish, target),
    );
    expect(first.done).toEqual([draft.id]);
    expect(first.refused.map((refused) => refused.id)).toEqual([published.id]);
    const second = await outcome(
      await bulk(adminJar, "topics", publish, target, {
        changeNote: "TEST change note for a bulk publish.",
      }),
    );
    expect(sorted(second.done)).toEqual(sorted([draft.id, published.id]));
    const live = await payload.findByID({
      collection: "topics",
      id: published.id,
      draft: false,
      overrideAccess: true,
    });
    expect(live.summary).toBe("A made-up topic, changed.");
    const { docs: changes } = await payload.find({
      collection: "topic-changes",
      where: { topic: { equals: published.id } },
      sort: "-createdAt",
      limit: 1,
      overrideAccess: true,
    });
    expect(changes[0]?.note).toBe("TEST change note for a bulk publish.");
    // The hooks after each change read the whole topic: its audit entry
    // names it, as a publish from its editor does.
    const [entry] = (await audited(published.id)).filter(
      (each) => each.action === "topic.updated",
    );
    expect(entry?.details).toMatchObject({
      title: "TEST topic republished in bulk",
      note: "TEST change note for a bulk publish.",
    });
  });

  it("archive only published topics, and delete only those never published", async () => {
    const draft = await draftTopic("TEST draft topic in a bulk archive");
    const published = await publishedTopic(
      "TEST published topic in a bulk archive",
    );
    const target: BulkTarget = { kind: "ids", ids: [draft.id, published.id] };
    const archived = await outcome(
      await bulk(adminJar, "topics", actionOf("topics", "archive"), target, {
        changeNote: "TEST archived in bulk.",
      }),
      [...target.ids],
    );
    expect(archived).toEqual({
      done: [published.id],
      refused: [],
      skipped: [draft.id],
    });
    const deleted = await outcome(
      await bulk(adminJar, "topics", actionOf("topics", "delete"), target),
      [...target.ids],
    );
    expect(deleted).toEqual({
      done: [draft.id],
      refused: [],
      skipped: [published.id],
    });
    expect(
      await payload.findByID({
        collection: "topics",
        id: published.id,
        overrideAccess: true,
      }),
    ).toMatchObject({ state: "archived" });
  });

  it("mark topics ready for review, every one the list matches", async () => {
    const topics = await Promise.all([
      draftTopic("TEST bulk review topic A"),
      draftTopic("TEST bulk review topic B"),
    ]);
    const where = adminListWhere("topics", {
      search: "TEST bulk review topic",
      conditions: [],
    });
    const ready = await outcome(
      await bulk(adminJar, "topics", actionOf("topics", "ready"), {
        kind: "matching",
        where,
      }),
    );
    expect(sorted(ready.done)).toEqual(sorted(topics.map((t) => t.id)));
    const listed = await payloadRest(
      "GET",
      ["topics"],
      moderatorJar,
      undefined,
      undefined,
      `?${adminListSearchParams("topics", {
        search: "TEST bulk review topic",
        conditions: [{ field: "readyForReview", equals: true }],
        sort: "-updatedAt",
        page: 1,
        limit: 10,
      })}`,
    );
    expect(
      adminPageSchema(adminRowSchema("topics")).parse(await json(listed))
        .totalDocs,
    ).toBe(2);
  });

  it("moderate comments and reports, as staff may", async () => {
    const topic = await publishedTopic(
      "TEST topic with comments moderated in bulk",
    );
    const comment = (body: string, parent: string | null = null) =>
      payload.create({
        collection: "comments",
        data: {
          topic: topic.id,
          author: member.id,
          body,
          parent,
          score: 0,
          status: "visible",
          locked: false,
        },
        overrideAccess: true,
      });
    const thread = await comment("TEST thread moderated in bulk.");
    const reply = await comment("TEST reply moderated in bulk.", thread.id);
    // Removed by an admin: its text is erased for good.
    const removed = await payload.update({
      collection: "comments",
      id: (await comment("TEST comment removed before the bulk action.")).id,
      data: { status: "removed", moderationReason: "spam" },
      ...asAdmin(),
    });
    const ids = [thread.id, reply.id, removed.id];

    const hide = bulkActions("comments", "moderator").find(
      (a) => a.id === "hide",
    );
    expect(hide).toBeDefined();
    const noReason = await outcome(
      await bulk(moderatorJar, "comments", hide as BulkAction, {
        kind: "ids",
        ids,
      }),
      ids,
    );
    expect(noReason.done).toEqual([]);
    expect(sorted(noReason.refused.map((refused) => refused.id))).toEqual(
      sorted([thread.id, reply.id]),
    );
    const hidden = await outcome(
      await bulk(
        moderatorJar,
        "comments",
        hide as BulkAction,
        { kind: "ids", ids },
        { moderationReason: "spam" },
      ),
      ids,
    );
    expect(sorted(hidden.done)).toEqual(sorted([thread.id, reply.id]));
    expect(hidden.skipped).toEqual([removed.id]);

    const locked = await outcome(
      await bulk(moderatorJar, "comments", actionOf("comments", "lock"), {
        kind: "ids",
        ids: [thread.id, reply.id],
      }),
      [thread.id, reply.id],
    );
    expect(locked).toEqual({
      done: [thread.id],
      refused: [],
      skipped: [reply.id],
    });

    const report = await payload.create({
      collection: "comment-reports",
      data: {
        comment: thread.id,
        reporter: member.id,
        reason: "spam",
        status: "open",
      },
      overrideAccess: true,
    });
    const feedback = await payload.create({
      collection: "feedback",
      data: {
        author: member.id,
        kind: "idea",
        message: "TEST feedback marked done in bulk.",
        status: "new",
      },
      overrideAccess: true,
    });
    expect(
      (
        await outcome(
          await bulk(
            moderatorJar,
            "comment-reports",
            actionOf("comment-reports", "dismiss"),
            {
              kind: "ids",
              ids: [report.id],
            },
          ),
        )
      ).done,
    ).toEqual([report.id]);
    expect(
      (
        await outcome(
          await bulk(moderatorJar, "feedback", actionOf("feedback", "done"), {
            kind: "ids",
            ids: [feedback.id],
          }),
        )
      ).done,
    ).toEqual([feedback.id]);
  });

  it("are offered only as the access rules allow, which still decide", async () => {
    expect(bulkActions("references", "moderator")).toEqual([]);
    expect(bulkActions("comments", "moderator").map((a) => a.id)).toEqual([
      "hide",
      "show",
      "lock",
      "unlock",
    ]);
    const tag = await payload.create({
      collection: "tags",
      data: { name: "TEST tag a moderator cannot delete", slug: "" },
      ...asAdmin(),
    });
    const refused = await bulk(
      moderatorJar,
      "tags",
      actionOf("tags", "delete"),
      {
        kind: "ids",
        ids: [tag.id],
      },
    );
    expect(refused.status).toBe(403);
    expect(
      await payload.findByID({
        collection: "tags",
        id: tag.id,
        overrideAccess: true,
      }),
    ).toMatchObject({ id: tag.id });
  });
});

describe("duplicating", () => {
  async function duplicate(collection: string, id: string) {
    const response = await payloadRest(
      "POST",
      [collection, id, "duplicate"],
      adminJar,
      undefined,
      undefined,
      `?${duplicateSearchParams()}`,
    );
    await expectStatus(response, 200);
    return duplicateAnswerSchema.parse(await json(response)).doc.id;
  }

  it("copies a published topic as a fresh draft, with its own slug", async () => {
    const topic = await publishedTopic("TEST duplicated topic");
    await payload.update({
      collection: "topics",
      id: topic.id,
      data: { readyForReview: true },
      draft: true,
      ...asAdmin(),
    });
    const copy = await payload.findByID({
      collection: "topics",
      id: await duplicate("topics", topic.id),
      draft: true,
      overrideAccess: true,
    });
    expect(copy).toMatchObject({
      title: "TEST duplicated topic",
      state: "draft",
      firstPublishedAt: null,
      readyForReview: false,
      archived: false,
      _status: "draft",
    });
    expect(copy.slug).not.toBe(topic.slug);
    const [created] = (await audited(copy.id)).filter(
      (entry) => entry.action === "topic.created",
    );
    expect(created?.details).toMatchObject({ title: "TEST duplicated topic" });
  });

  it("copies the other records made in the admin, but not people", async () => {
    // A copy of an individual is the same person, which the backend's
    // check for possible duplicates refuses: the admin offers no copy.
    expect(isDuplicated("individuals")).toBe(false);
    const tag = await payload.create({
      collection: "tags",
      data: { name: "TEST duplicated tag", slug: "" },
      ...asAdmin(),
    });
    const category = await payload.create({
      collection: "categories",
      data: { name: "TEST duplicated category", slug: "" },
      ...asAdmin(),
    });
    const reference = await payload.create({
      collection: "references",
      data: {
        title: "TEST duplicated reference",
        kind: "web_page",
        url: "https://example.org/duplicated-reference",
        checkStatus: "pending",
      },
      ...asAdmin(),
    });
    for (const [collection, record] of [
      ["tags", tag],
      ["categories", category],
    ] as const) {
      const copy = await payload.findByID({
        collection,
        id: await duplicate(collection, record.id),
        overrideAccess: true,
      });
      expect(copy.id).not.toBe(record.id);
      expect(copy.slug).not.toBe(record.slug);
    }
    const copied = await payload.findByID({
      collection: "references",
      id: await duplicate("references", reference.id),
      overrideAccess: true,
    });
    expect(copied).toMatchObject({
      title: "TEST duplicated reference",
      url: "https://example.org/duplicated-reference",
    });
  });
});

describe("versions", () => {
  it("of a reference are listed, read, compared, and restored", async () => {
    const reference = await payload.create({
      collection: "references",
      data: {
        title: "TEST versioned reference",
        kind: "web_page",
        url: "https://example.org/versioned-reference",
        checkStatus: "pending",
      },
      ...asAdmin(),
    });
    for (const title of [
      "TEST versioned reference, two",
      "TEST versioned reference, three",
    ]) {
      await payload.update({
        collection: "references",
        id: reference.id,
        data: { title },
        ...asAdmin(),
      });
    }
    const listed = await payloadRest(
      "GET",
      ["references", "versions"],
      moderatorJar,
      undefined,
      undefined,
      `?${versionsSearchParams("references", reference.id, 1)}`,
    );
    await expectStatus(listed, 200);
    const page = versionsPageSchema("references").parse(await json(listed));
    expect(page.docs.map((row) => row.version.title)).toEqual([
      "TEST versioned reference, three",
      "TEST versioned reference, two",
      "TEST versioned reference",
    ]);
    const [newest, , oldest] = page.docs;
    const before = await payloadRest(
      "GET",
      ["references", "versions"],
      moderatorJar,
      undefined,
      undefined,
      `?${previousVersionSearchParams(reference.id, newest?.updatedAt ?? "")}`,
    );
    expect(
      z
        .object({ docs: z.array(z.object({ id: z.string() })) })
        .parse(await json(before)).docs[0]?.id,
    ).toBe(page.docs[1]?.id);
    const read = await payloadRest(
      "GET",
      ["references", "versions", oldest?.id ?? ""],
      moderatorJar,
      undefined,
      undefined,
      `?${versionSearchParams()}`,
    );
    await expectStatus(read, 200);
    expect(
      referenceVersionSchema.parse(await json(read)).version,
    ).toMatchObject({
      title: "TEST versioned reference",
      checkStatus: "pending",
    });
    // Moderators read versions; only admins restore one.
    const restore = (jar: CookieJar) =>
      payloadRest(
        "POST",
        ["references", "versions", oldest?.id ?? ""],
        jar,
        undefined,
        undefined,
        `?${restoreSearchParams("references")}`,
      );
    expect((await restore(moderatorJar)).status).toBe(403);
    await expectStatus(await restore(adminJar), 200);
    expect(
      await payload.findByID({
        collection: "references",
        id: reference.id,
        overrideAccess: true,
      }),
    ).toMatchObject({ title: "TEST versioned reference" });
  });

  it("of a snippet are read whole", async () => {
    const made = await payloadRest(
      "POST",
      ["snippets"],
      adminJar,
      snippetSaveBody({
        ...EMPTY_SNIPPET,
        caption: "TEST versioned snippet",
        youtubeId: "TESTpar0001",
        startS: 2,
        endS: 9,
      }),
      undefined,
      `?${snippetSearchParams()}`,
    );
    await expectStatus(made, 201);
    const snippet = savedRecordSchema(storedSnippetSchema).parse(
      await json(made),
    ).doc;
    const listed = await payloadRest(
      "GET",
      ["snippets", "versions"],
      adminJar,
      undefined,
      undefined,
      `?${versionsSearchParams("snippets", snippet.id, 1)}`,
    );
    const [only] = versionsPageSchema("snippets").parse(
      await json(listed),
    ).docs;
    const read = await payloadRest(
      "GET",
      ["snippets", "versions", only?.id ?? ""],
      adminJar,
      undefined,
      undefined,
      `?${versionSearchParams()}`,
    );
    await expectStatus(read, 200);
    expect(snippetVersionSchema.parse(await json(read)).version).toMatchObject({
      caption: "TEST versioned snippet",
      youtubeId: "TESTpar0001",
      startS: 2,
      endS: 9,
    });
  });
});

describe("list settings", () => {
  it("are each staff member's own", async () => {
    const key = listPreferenceKey("topics");
    const value = {
      query: "search=TEST&sort=title",
      columns: ["title", "category"],
    };
    await expectStatus(
      await payloadRest("POST", ["payload-preferences", key], adminJar, {
        value,
      }),
      200,
    );
    const mine = preferenceAnswerSchema.parse(
      await json(
        await payloadRest("GET", ["payload-preferences", key], adminJar),
      ),
    );
    expect(readListPreference("topics", mine.value)).toEqual(value);
    const theirs = preferenceAnswerSchema.parse(
      await json(
        await payloadRest("GET", ["payload-preferences", key], otherAdminJar),
      ),
    );
    expect(theirs.value ?? null).toBeNull();
  });
});

describe("an image's focal point", () => {
  it("is saved with the file, and changed later", async () => {
    const form = new FormData();
    form.append(
      "file",
      new Blob([PNG_BYTES], { type: "image/png" }),
      "focal.png",
    );
    form.append(
      "_payload",
      JSON.stringify(
        mediaSaveBody({
          alt: "TEST image with a focal point",
          licence: "own_work",
          credit: "",
          sourceUrl: "",
          focalX: 30,
          focalY: 70,
        }),
      ),
    );
    const made = await payloadUpload(
      "POST",
      ["media"],
      adminJar,
      form,
      `?${mediaSearchParams()}`,
    );
    await expectStatus(made, 201);
    const media = editorMedia(
      savedRecordSchema(storedMediaSchema).parse(await json(made)).doc,
    );
    expect(media.values).toMatchObject({ focalX: 30, focalY: 70 });
    const moved = await payloadRest(
      "PATCH",
      ["media", media.id],
      adminJar,
      mediaSaveBody({ ...media.values, focalX: 55, focalY: null }),
      undefined,
      `?${mediaSearchParams()}`,
    );
    await expectStatus(moved, 200);
    expect(
      editorMedia(
        savedRecordSchema(storedMediaSchema).parse(await json(moved)).doc,
      ).values,
    ).toMatchObject({ focalX: 55, focalY: null });
    // Either coordinate's refusal lands on the one focal point field.
    expect(mediaFieldOf("focalY")).toBe("focalX");
  });
});

describe("the dashboard", () => {
  it("finds the topics a staff member edited last", async () => {
    const topic = await draftTopic("TEST topic on the admin's dashboard");
    const response = await payloadRest(
      "GET",
      ["topics"],
      adminJar,
      undefined,
      undefined,
      `?${adminListSearchParams("topics", {
        conditions: [{ field: "lastEditedBy", equals: admin.id }],
        sort: "-updatedAt",
        page: 1,
        limit: 5,
      })}`,
    );
    await expectStatus(response, 200);
    const page = adminPageSchema(adminRowSchema("topics")).parse(
      await json(response),
    );
    expect(page.docs[0]?.id).toBe(topic.id);
    expect(isRecordId(topic.id)).toBe(true);
  });
});
