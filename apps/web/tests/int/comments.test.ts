import {
  createTopicSearchSource,
  processSearchJob,
  searchJobSchema,
} from "@countrytopics/jobs";
import {
  createPostgresTopicSearch,
  type TopicSearchIndex,
} from "@countrytopics/search";
import config from "@payload-config";
import {
  getPayload,
  type Payload,
  type RequiredDataFromCollectionSlug,
} from "payload";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { PUT as putDisplayName } from "@/app/(frontend)/api/v1/account/display-name/route";
import { GET as getViewer } from "@/app/(frontend)/api/v1/account/comments/route";
import { GET as getReplies } from "@/app/(frontend)/api/v1/comments/[id]/replies/route";
import { POST as postReport } from "@/app/(frontend)/api/v1/comments/[id]/reports/route";
import { PUT as putVote } from "@/app/(frontend)/api/v1/comments/[id]/vote/route";
import {
  GET as getComments,
  POST as postComments,
} from "@/app/(frontend)/api/v1/topics/[slug]/comments/route";
import {
  COMMENT_THREADS_PAGE_SIZE,
  createComment,
  findCommentTopic,
  THREAD_REPLIES_SHOWN,
} from "@/comments/store";
import type {
  CommentPage,
  CommentViewer,
  PublicComment,
  ReplyPage,
} from "@/comments/types";
import type { Topic, User } from "@/payload-types";

import { richText, workerSide } from "./fixtures";
import {
  clearRateLimits,
  CookieJar,
  countryId,
  payloadRest,
  signInAsVerifiedStaff,
  signInWithEmailLink,
  SITE_URL,
  staffProfile,
  startEmailWorker,
  testEmail,
} from "./helpers";

// F6 comments (ADR 0009) through the /api/v1 routes, as the browser calls
// them, with two members signed in by email link. Every topic, name, and
// comment here is made up for the tests; the topics are about Portugal,
// which no other test uses.
let payload: Payload;
let worker: Awaited<ReturnType<typeof workerSide>>;
let index: TopicSearchIndex;
let stopEmailWorker: (() => Promise<void>) | undefined;
let admin: User;
let alice: CookieJar;
let bob: CookieJar;
let aliceProfile: User;
/** Published; most tests comment here. */
let harbour: Topic;
/** Published, then archived. */
let lighthouse: Topic;
/** Published; for paging. */
let tides: Topic;
/** Never published. */
let draft: Topic;

type TopicInput = RequiredDataFromCollectionSlug<"topics">;

async function publishedTopic(title: string): Promise<Topic> {
  const created = await payload.create({
    collection: "topics",
    data: {
      title,
      slug: "",
      summary: "A fictional topic for the comment tests.",
      body: richText("Fictional text."),
      countries: [await countryId(payload, "PT")],
    } as TopicInput,
    draft: true,
    user: admin,
    overrideAccess: false,
  });
  return payload.update({
    collection: "topics",
    id: created.id,
    data: { _status: "published" },
    user: admin,
    overrideAccess: false,
  });
}

type Call = {
  jar?: CookieJar;
  body?: unknown;
  origin?: string;
  search?: string;
};

function request(
  method: string,
  path: string,
  { jar, body, origin = SITE_URL, search = "" }: Call = {},
): Request {
  const headers = new Headers({ origin });
  if (jar) headers.set("cookie", jar.header());
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request(`${SITE_URL}${path}${search}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const bySlug = (slug: string) => ({ params: Promise.resolve({ slug }) });
const byId = (id: string) => ({ params: Promise.resolve({ id }) });

function list(topic: Topic, search = "") {
  return getComments(
    request("GET", `/api/v1/topics/${topic.slug}/comments`, { search }),
    bySlug(topic.slug),
  );
}

async function page(topic: Topic, search = ""): Promise<CommentPage> {
  const response = await list(topic, search);
  expect(response.status).toBe(200);
  return (await response.json()) as CommentPage;
}

function post(topic: Topic, call: Call) {
  return postComments(
    request("POST", `/api/v1/topics/${topic.slug}/comments`, call),
    bySlug(topic.slug),
  );
}

async function posted(
  topic: Topic,
  jar: CookieJar,
  body: string,
  parentId: string | null = null,
): Promise<PublicComment> {
  const response = await post(topic, { jar, body: { body, parentId } });
  expect(response.status).toBe(201);
  return ((await response.json()) as { comment: PublicComment }).comment;
}

function vote(id: string, call: Call) {
  return putVote(request("PUT", `/api/v1/comments/${id}/vote`, call), byId(id));
}

function report(id: string, call: Call) {
  return postReport(
    request("POST", `/api/v1/comments/${id}/reports`, call),
    byId(id),
  );
}

async function viewer(ids: string[], jar?: CookieJar): Promise<CommentViewer> {
  const response = await getViewer(
    request("GET", "/api/v1/account/comments", {
      jar,
      search: `?ids=${ids.join(",")}`,
    }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  return (await response.json()) as CommentViewer;
}

function setName(jar: CookieJar, displayName: string) {
  return putDisplayName(
    request("PUT", "/api/v1/account/display-name", {
      jar,
      body: { displayName },
    }),
  );
}

beforeAll(async () => {
  payload = await getPayload({ config });
  worker = await workerSide();
  index = createPostgresTopicSearch(worker.pool);
  stopEmailWorker = startEmailWorker();
  admin = await staffProfile(payload, "comments-admin", "admin");
  aliceProfile = await staffProfile(payload, "comments-alice", "member", false);
  await staffProfile(payload, "comments-bob", "member", false);
  [alice, bob] = await Promise.all([
    signInWithEmailLink(testEmail("comments-alice")),
    signInWithEmailLink(testEmail("comments-bob")),
  ]);
  [harbour, lighthouse, tides] = await Promise.all([
    publishedTopic("TEST Harbour comments topic"),
    publishedTopic("TEST Lighthouse comments topic"),
    publishedTopic("TEST Tides comments topic"),
  ]);
  draft = await payload.create({
    collection: "topics",
    data: {
      title: "TEST Draft comments topic",
      slug: "",
      countries: [await countryId(payload, "PT")],
    } as TopicInput,
    draft: true,
    user: admin,
    overrideAccess: false,
  });
}, 120_000);

// The rate limits have tests of their own (moderation.test.ts).
beforeEach(clearRateLimits);

afterAll(async () => {
  await stopEmailWorker?.();
  await worker?.close();
});

describe("display names", () => {
  it("must be chosen before a member's first comment", async () => {
    const response = await post(harbour, {
      jar: alice,
      body: { body: "TEST before naming." },
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "display-name-required",
    });
    expect((await viewer([], alice)).account).toEqual({
      displayName: null,
      staff: false,
    });
  });

  it("are checked, tidied, and audited with the member as the actor", async () => {
    expect((await setName(alice, "x")).status).toBe(400);
    expect((await setName(alice, "TEST 🙂")).status).toBe(400);
    const saved = await setName(alice, "  TEST   Alice ");
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ displayName: "TEST Alice" });
    expect((await setName(bob, "TEST Bob")).status).toBe(200);
    expect((await viewer([], alice)).account).toEqual({
      displayName: "TEST Alice",
      staff: false,
    });
    const { docs } = await payload.find({
      collection: "audit-log",
      where: {
        action: { equals: "user.updated" },
        targetId: { equals: aliceProfile.id },
      },
      overrideAccess: true,
    });
    expect(docs[0]?.details).toMatchObject({
      changes: { displayName: { from: null, to: "TEST Alice" } },
    });
    expect(docs[0]?.actor).toMatchObject({ id: aliceProfile.id });
  });

  it("need a signed-in request from the site", async () => {
    expect(
      (
        await putDisplayName(
          request("PUT", "/api/v1/account/display-name", {
            body: { displayName: "TEST Nobody" },
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await putDisplayName(
          request("PUT", "/api/v1/account/display-name", {
            jar: alice,
            origin: "https://elsewhere.example",
            body: { displayName: "TEST Forged" },
          }),
        )
      ).status,
    ).toBe(403);
  });
});

describe("posting", () => {
  it("refuses visitors, other sites, and requests that are not JSON", async () => {
    expect(
      (await post(harbour, { body: { body: "TEST visitor." } })).status,
    ).toBe(401);
    expect(
      (
        await post(harbour, {
          jar: alice,
          origin: "https://elsewhere.example",
          body: { body: "TEST forged." },
        })
      ).status,
    ).toBe(403);
    const form = new Request(
      `${SITE_URL}/api/v1/topics/${harbour.slug}/comments`,
      {
        method: "POST",
        headers: {
          origin: SITE_URL,
          cookie: alice.header(),
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "body=TEST+form",
      },
    );
    expect((await postComments(form, bySlug(harbour.slug))).status).toBe(415);
  });

  it("refuses empty, overlong, and unknown fields", async () => {
    for (const body of [
      { body: "   \n  " },
      { body: "x".repeat(5_001) },
      { body: "TEST extra.", author: "someone else" },
    ]) {
      expect((await post(harbour, { jar: alice, body })).status).toBe(400);
    }
  });

  it("stores plain text, tidied, under the display name only", async () => {
    const comment = await posted(
      harbour,
      alice,
      "  TEST <b>first</b> comment.  \r\n\r\n\r\n\r\nSecond paragraph.  ",
    );
    expect(comment).toMatchObject({
      author: "TEST Alice",
      body: "TEST <b>first</b> comment.\n\nSecond paragraph.",
      score: 0,
    });
    const listed = await page(harbour);
    expect(listed.threads[0]).toMatchObject({
      id: comment.id,
      author: "TEST Alice",
      replyCount: 0,
      replies: [],
    });
    const text = JSON.stringify(listed);
    expect(text).not.toContain("@example.test");
    expect(text).not.toContain(aliceProfile.id);
  });

  it("dates comments by this process's clock, as Payload dates topics", async () => {
    // A topic's search version compares comments' updatedAt with the
    // topic's, which Payload sets from Node's clock; the database's clock
    // can differ (ADR 0009). An hour off makes the difference certain.
    const topic = await findCommentTopic(worker.pool, harbour.slug);
    if (!topic) throw new Error("The harbour topic is not public");
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    vi.useFakeTimers({ now: hourAgo, toFake: ["Date"] });
    try {
      const { comment, updatedAt } = await createComment(worker.pool, {
        topic,
        authorId: aliceProfile.id,
        parentId: null,
        body: "TEST dated comment.",
      });
      expect(comment.createdAt).toBe(hourAgo.toISOString());
      expect(updatedAt).toBe(hourAgo.toISOString());
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps replies two levels deep, within one topic", async () => {
    const thread = await posted(harbour, alice, "TEST thread to reply to.");
    const reply = await posted(harbour, bob, "TEST a reply.", thread.id);
    const nested = await post(harbour, {
      jar: alice,
      body: { body: "TEST a reply to a reply.", parentId: reply.id },
    });
    expect(nested.status).toBe(400);
    const elsewhere = await post(tides, {
      jar: alice,
      body: { body: "TEST wrong topic.", parentId: thread.id },
    });
    expect(elsewhere.status).toBe(404);
    const listed = await page(harbour);
    const shown = listed.threads.find((item) => item.id === thread.id);
    expect(shown).toMatchObject({ replyCount: 1, moreReplies: null });
    expect(shown?.replies.map((item) => item.id)).toEqual([reply.id]);
    expect(listed.total).toBe(4);
  });

  it("is only possible on published topics that are not archived", async () => {
    expect(
      (await post(draft, { jar: alice, body: { body: "TEST draft." } })).status,
    ).toBe(404);
    const before = await posted(lighthouse, alice, "TEST before archiving.");
    await payload.update({
      collection: "topics",
      id: lighthouse.id,
      data: {
        archived: true,
        _status: "published",
        changeNote: "TEST archived.",
      },
      user: admin,
      overrideAccess: false,
    });
    const closed = await post(lighthouse, {
      jar: bob,
      body: { body: "TEST after archiving." },
    });
    expect(closed.status).toBe(409);
    expect(
      (await vote(before.id, { jar: bob, body: { value: 1 } })).status,
    ).toBe(409);
    // Still readable, and still reportable.
    const listed = await page(lighthouse);
    expect(listed).toMatchObject({ open: false, total: 1 });
    expect(
      (await report(before.id, { jar: bob, body: { reason: "spam" } })).status,
    ).toBe(201);
  });
});

describe("listing", () => {
  it("answers 404 for topics that are not public", async () => {
    expect((await list(draft)).status).toBe(404);
  });

  it("is public, briefly cacheable, and canonical", async () => {
    const response = await list(harbour);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=0, s-maxage=15, stale-while-revalidate=60",
    );
    const redirected = await list(harbour, "?sort=top");
    expect(redirected.status).toBe(308);
    expect(redirected.headers.get("location")).toBe(
      `${SITE_URL}/api/v1/topics/${harbour.slug}/comments`,
    );
    expect((await list(harbour, "?sort=best")).status).toBe(400);
    expect((await list(harbour, "?page=2")).status).toBe(400);
    expect((await list(harbour, "?sort=new&sort=old")).status).toBe(400);
    expect((await list(harbour, "?cursor=bm90LWEtY3Vyc29y")).status).toBe(400);
  });

  it("pages through threads in each order without repeats", async () => {
    const topic = await findCommentTopic(worker.pool, tides.slug);
    if (!topic) throw new Error("The tides topic is not public");
    const [authorId] = [aliceProfile.id];
    const created: string[] = [];
    for (let count = 0; count < COMMENT_THREADS_PAGE_SIZE + 2; count += 1) {
      const { comment } = await createComment(worker.pool, {
        topic,
        authorId,
        parentId: null,
        body: `TEST thread ${count}`,
      });
      created.push(comment.id);
    }
    for (const sort of ["new", "old", "top"] as const) {
      const first = await page(tides, sort === "top" ? "" : `?sort=${sort}`);
      expect(first.threads).toHaveLength(COMMENT_THREADS_PAGE_SIZE);
      expect(first.nextCursor).not.toBeNull();
      const params = new URLSearchParams();
      if (sort !== "top") params.set("sort", sort);
      params.set("cursor", first.nextCursor ?? "");
      const second = await page(tides, `?${params}`);
      expect(second.nextCursor).toBeNull();
      const ids = [...first.threads, ...second.threads].map((item) => item.id);
      expect(new Set(ids).size).toBe(created.length);
      expect([...ids].sort()).toEqual([...created].sort());
      if (sort === "old") expect(ids).toEqual(created);
      if (sort === "new") expect(ids).toEqual([...created].reverse());
    }
  });

  it("shows a thread's first replies and pages through the rest", async () => {
    const thread = await posted(tides, alice, "TEST busy thread.");
    const replies: string[] = [];
    for (let count = 0; count < THREAD_REPLIES_SHOWN + 2; count += 1) {
      // More replies than one member may post in a minute.
      await clearRateLimits();
      replies.push(
        (await posted(tides, bob, `TEST reply ${count}`, thread.id)).id,
      );
    }
    const listed = await page(tides, "?sort=new");
    const shown = listed.threads.find((item) => item.id === thread.id);
    expect(shown?.replyCount).toBe(replies.length);
    expect(shown?.replies.map((item) => item.id)).toEqual(
      replies.slice(0, THREAD_REPLIES_SHOWN),
    );
    const cursor = shown?.moreReplies ?? "";
    const response = await getReplies(
      request("GET", `/api/v1/comments/${thread.id}/replies`, {
        search: `?cursor=${cursor}`,
      }),
      byId(thread.id),
    );
    expect(response.status).toBe(200);
    const rest = (await response.json()) as ReplyPage;
    expect(rest.replies.map((item) => item.id)).toEqual(
      replies.slice(THREAD_REPLIES_SHOWN),
    );
    expect(rest.nextCursor).toBeNull();
    // A reply is not a thread.
    const notThread = await getReplies(
      request("GET", `/api/v1/comments/${replies[0]}/replies`),
      byId(replies[0] ?? ""),
    );
    expect(notThread.status).toBe(404);
  });
});

describe("votes", () => {
  let target: PublicComment;

  beforeAll(async () => {
    target = await posted(harbour, alice, "TEST comment to vote on.");
  });

  it("count once per member, change, and can be taken back", async () => {
    const score = async (value: number) => {
      const response = await vote(target.id, { jar: bob, body: { value } });
      expect(response.status).toBe(200);
      return ((await response.json()) as { score: number }).score;
    };
    expect(await score(1)).toBe(1);
    expect(await score(1)).toBe(1);
    expect(await score(-1)).toBe(-1);
    expect(await score(0)).toBe(0);
    expect(await score(0)).toBe(0);
  });

  it("count once when a member sends several at the same time", async () => {
    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        vote(target.id, { jar: bob, body: { value: 1 } }),
      ),
    );
    expect(responses.map((response) => response.status)).toEqual(
      Array(6).fill(200),
    );
    const listed = await page(harbour, "?sort=new");
    expect(listed.threads.find((item) => item.id === target.id)?.score).toBe(1);
    const { totalDocs } = await payload.count({
      collection: "comment-votes",
      where: { comment: { equals: target.id } },
      overrideAccess: true,
    });
    expect(totalDocs).toBe(1);
  });

  it("orders top threads by score", async () => {
    const listed = await page(harbour);
    expect(listed.threads[0]?.id).toBe(target.id);
  });

  it("refuses own comments, bad values, and visitors", async () => {
    expect(
      (await vote(target.id, { jar: alice, body: { value: 1 } })).status,
    ).toBe(403);
    expect(
      (await vote(target.id, { jar: bob, body: { value: 2 } })).status,
    ).toBe(400);
    expect((await vote(target.id, { body: { value: 1 } })).status).toBe(401);
    expect(
      (
        await vote("01890000-0000-7000-8000-000000000000", {
          jar: bob,
          body: { value: 1 },
        })
      ).status,
    ).toBe(404);
  });

  it("are the voter's own to see, with what they wrote and reported", async () => {
    expect(await viewer([target.id], bob)).toMatchObject({
      account: { displayName: "TEST Bob" },
      votes: { [target.id]: 1 },
      mine: [],
    });
    expect(await viewer([target.id], alice)).toMatchObject({
      votes: {},
      mine: [target.id],
    });
    expect(await viewer([target.id])).toEqual({
      account: null,
      votes: {},
      reported: [],
      mine: [],
    });
  });
});

describe("reports", () => {
  let target: PublicComment;

  beforeAll(async () => {
    target = await posted(harbour, alice, "TEST comment to report.");
  });

  it("are kept once per member, with their reason and note", async () => {
    const first = await report(target.id, {
      jar: bob,
      body: { reason: "misleading", note: "  TEST note.  " },
    });
    expect(first.status).toBe(201);
    const again = await report(target.id, {
      jar: bob,
      body: { reason: "spam" },
    });
    expect(again.status).toBe(200);
    const { docs } = await payload.find({
      collection: "comment-reports",
      where: { comment: { equals: target.id } },
      depth: 0,
      overrideAccess: true,
    });
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ reason: "misleading", note: "TEST note." });
    expect((await viewer([target.id], bob)).reported).toEqual([target.id]);
  });

  it("refuses own comments, a missing note for other reasons, and visitors", async () => {
    expect(
      (await report(target.id, { jar: alice, body: { reason: "spam" } }))
        .status,
    ).toBe(403);
    expect(
      (await report(target.id, { jar: bob, body: { reason: "other" } })).status,
    ).toBe(400);
    expect((await report(target.id, { body: { reason: "spam" } })).status).toBe(
      401,
    );
  });
});

describe("Payload's own API", () => {
  it("lets verified staff read comments and reports", async () => {
    await staffProfile(payload, "comments-moderator", "moderator", false);
    const moderator = await signInAsVerifiedStaff(
      testEmail("comments-moderator"),
    );
    for (const collection of ["comments", "comment-reports"]) {
      const response = await payloadRest("GET", [collection], moderator);
      expect(response.status).toBe(200);
      expect(
        ((await response.json()) as { totalDocs: number }).totalDocs,
      ).toBeGreaterThan(0);
    }
    // Votes are only counted; nobody browses them.
    expect(
      (await payloadRest("GET", ["comment-votes"], moderator)).status,
    ).toBe(403);
  });

  it("lets members neither read nor write comments, votes, or reports", async () => {
    for (const collection of ["comments", "comment-votes", "comment-reports"]) {
      expect((await payloadRest("GET", [collection], alice)).status).toBe(403);
    }
    const created = await payloadRest("POST", ["comments"], alice, {
      topic: harbour.id,
      body: "TEST through Payload.",
    });
    expect(created.status).toBe(403);
  });
});

describe("most discussed", () => {
  it("re-indexes a topic when it is commented on, and sorts by it", async () => {
    // Earlier tests queued jobs for every comment; the worker's code runs
    // them here. Comments made straight through the store queue nothing,
    // which the rebuild covers, so index the topics as they are.
    const source = createTopicSearchSource(worker.pool);
    const jobs = await worker.queues.search.getJobs(
      ["waiting", "delayed", "prioritized"],
      0,
      -1,
      true,
    );
    expect(
      jobs.some((job) => JSON.stringify(job.data).includes("comments")),
    ).toBe(true);
    for (const job of jobs) {
      await processSearchJob(
        searchJobSchema.parse(job.data),
        { source, index },
        { isFinal: false },
      );
      await job.remove();
    }
    await processSearchJob(
      { topicIds: [harbour.id, tides.id] },
      { source, index },
      { isFinal: false },
    );
    const portugal = await countryId(payload, "PT");
    const result = await index.search({
      text: null,
      filters: {
        countryIds: [portugal],
        categoryIds: [],
        tagIds: [],
        individualIds: [],
        evidenceKinds: [],
        languages: [],
        withReferences: false,
        publishedFrom: null,
        publishedTo: null,
      },
      sort: "discussed",
      cursor: null,
      limit: 10,
      withFacets: false,
    });
    const counts = Object.fromEntries(
      result.hits.map((hit) => [hit.slug, hit.commentCount]),
    );
    const tidesCount = (await page(tides)).total;
    const harbourCount = (await page(harbour)).total;
    expect(counts).toEqual({
      [tides.slug]: tidesCount,
      [harbour.slug]: harbourCount,
    });
    expect(result.hits.map((hit) => hit.slug)).toEqual(
      tidesCount > harbourCount
        ? [tides.slug, harbour.slug]
        : [harbour.slug, tides.slug],
    );
  });
});
