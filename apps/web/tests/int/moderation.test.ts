import {
  CommentPage,
  LinkedThread,
  type MemberNotification,
  NotificationPage,
  PostedComment,
  type PublicComment,
  UnreadNotifications,
} from "@countrytopics/contracts";
import { createTopicSearchSource } from "@countrytopics/jobs";
import config from "@payload-config";
import {
  getPayload,
  type Payload,
  type RequiredDataFromCollectionSlug,
} from "payload";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PUT as putDisplayName } from "@/app/(frontend)/api/v1/account/display-name/route";
import { GET as getNotifications } from "@/app/(frontend)/api/v1/account/notifications/route";
import { POST as postRead } from "@/app/(frontend)/api/v1/account/notifications/read/route";
import { GET as getUnread } from "@/app/(frontend)/api/v1/account/notifications/unread/route";
import { POST as postReport } from "@/app/(frontend)/api/v1/comments/[id]/reports/route";
import { PUT as putVote } from "@/app/(frontend)/api/v1/comments/[id]/vote/route";
import { GET as getThread } from "@/app/(frontend)/api/v1/topics/[slug]/comments/[id]/route";
import {
  GET as getComments,
  POST as postComments,
} from "@/app/(frontend)/api/v1/topics/[slug]/comments/route";
import { createComment, findCommentTopic } from "@/comments/store";
import { NOTIFICATIONS_PAGE_SIZE } from "@/notifications/limits";
import type { Comment, Topic, User } from "@/payload-types";
import { RATE_LIMITS } from "@/rate-limit";

import { richText, workerSide } from "./fixtures";
import {
  clearRateLimits,
  contractJson,
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

// Moderation, rate limits, link limits, and notifications (ADR 0010),
// through the /api/v1 routes as the browser calls them and Payload's REST
// API as the admin panel does. Every topic, name, and comment here is made
// up for the tests; the topics are about Malta, which no other test uses.
let payload: Payload;
let stopEmailWorker: (() => Promise<void>) | undefined;
let worker: Awaited<ReturnType<typeof workerSide>>;
let adminProfile: User;
let admin: CookieJar;
let moderator: CookieJar;
let moderatorProfile: User;
let alice: CookieJar;
let aliceProfile: User;
let bob: CookieJar;
let bobProfile: User;
let topic: Topic;
let otherTopic: Topic;

type Call = { jar?: CookieJar; body?: unknown; search?: string };

function request(
  method: string,
  path: string,
  { jar, body, search = "" }: Call = {},
): Request {
  const headers = new Headers({ origin: SITE_URL });
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

async function publishedTopic(title: string): Promise<Topic> {
  const created = await payload.create({
    collection: "topics",
    data: {
      title,
      slug: "",
      summary: "A fictional topic for the moderation tests.",
      body: richText("Fictional text."),
      countries: [await countryId(payload, "MT")],
    } as RequiredDataFromCollectionSlug<"topics">,
    draft: true,
    user: adminProfile,
    overrideAccess: false,
  });
  return payload.update({
    collection: "topics",
    id: created.id,
    data: { _status: "published" },
    user: adminProfile,
    overrideAccess: false,
  });
}

function post(jar: CookieJar, body: string, parentId: string | null = null) {
  return postComments(
    request("POST", `/api/v1/topics/${topic.slug}/comments`, {
      jar,
      body: { body, parentId },
    }),
    bySlug(topic.slug),
  );
}

async function posted(
  jar: CookieJar,
  body: string,
  parentId: string | null = null,
): Promise<PublicComment> {
  const response = await post(jar, body, parentId);
  expect(response.status).toBe(201);
  return (await contractJson(PostedComment, response)).comment;
}

async function page(): Promise<CommentPage> {
  const response = await getComments(
    request("GET", `/api/v1/topics/${topic.slug}/comments`, {
      search: "?sort=new",
    }),
    bySlug(topic.slug),
  );
  expect(response.status).toBe(200);
  return contractJson(CommentPage, response);
}

const listed = (current: CommentPage, id: string) =>
  current.threads.find((thread) => thread.id === id);

function vote(jar: CookieJar, id: string, value: number) {
  return putVote(
    request("PUT", `/api/v1/comments/${id}/vote`, { jar, body: { value } }),
    byId(id),
  );
}

function report(jar: CookieJar, id: string, reason = "spam") {
  return postReport(
    request("POST", `/api/v1/comments/${id}/reports`, {
      jar,
      body: { reason },
    }),
    byId(id),
  );
}

function moderate(jar: CookieJar, id: string, data: Record<string, unknown>) {
  return payloadRest("PATCH", ["comments", id], jar, data);
}

async function storedComment(id: string): Promise<Comment> {
  return payload.findByID({
    collection: "comments",
    id,
    depth: 0,
    overrideAccess: true,
  });
}

async function notifications(jar: CookieJar): Promise<NotificationPage> {
  const response = await getNotifications(
    request("GET", "/api/v1/account/notifications", { jar }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  return contractJson(NotificationPage, response);
}

async function unread(jar: CookieJar): Promise<number> {
  const response = await getUnread(
    request("GET", "/api/v1/account/notifications/unread", { jar }),
  );
  expect(response.status).toBe(200);
  return (await contractJson(UnreadNotifications, response)).unread;
}

function markRead(jar: CookieJar, ids: string[]) {
  return postRead(
    request("POST", "/api/v1/account/notifications/read", {
      jar,
      body: { ids },
    }),
  );
}

async function auditEntries(action: string, targetId: string) {
  const { docs } = await payload.find({
    collection: "audit-log",
    where: {
      action: { equals: action },
      targetId: { equals: targetId },
    },
    depth: 0,
    overrideAccess: true,
  });
  return docs;
}

/** Waits until a statement is queued behind a row lock another holds. */
async function someoneWaitsForALock(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const { rows } = await worker.pool.query(
      "SELECT 1 FROM pg_locks WHERE NOT granted LIMIT 1",
    );
    if (rows.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Nothing waited for the lock");
}

/** A member whose account is old enough to post links. */
async function ageAccount(user: User) {
  await worker.pool.query("UPDATE users SET created_at = $2 WHERE id = $1", [
    user.id,
    new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
  ]);
}

beforeAll(async () => {
  payload = await getPayload({ config });
  worker = await workerSide();
  stopEmailWorker = startEmailWorker();
  adminProfile = await staffProfile(payload, "moderation-admin", "admin");
  moderatorProfile = await staffProfile(
    payload,
    "moderation-moderator",
    "moderator",
    false,
  );
  aliceProfile = await staffProfile(
    payload,
    "moderation-alice",
    "member",
    false,
  );
  bobProfile = await staffProfile(payload, "moderation-bob", "member", false);
  [admin, moderator, alice, bob] = await Promise.all([
    signInAsVerifiedStaff(testEmail("moderation-admin")),
    signInAsVerifiedStaff(testEmail("moderation-moderator")),
    signInWithEmailLink(testEmail("moderation-alice")),
    signInWithEmailLink(testEmail("moderation-bob")),
  ]);
  for (const [jar, displayName] of [
    [alice, "TEST Alice M"],
    [bob, "TEST Bob M"],
    [moderator, "TEST Mira"],
  ] as const) {
    const response = await putDisplayName(
      request("PUT", "/api/v1/account/display-name", {
        jar,
        body: { displayName },
      }),
    );
    expect(response.status).toBe(200);
  }
  [topic, otherTopic] = await Promise.all([
    publishedTopic("TEST Geyser moderation topic"),
    publishedTopic("TEST Glacier moderation topic"),
  ]);
}, 120_000);

beforeEach(clearRateLimits);

afterAll(async () => {
  await stopEmailWorker?.();
  await worker?.close();
});

describe("rate limits", () => {
  it("refuse a member's comments past the limit, with how long to wait", async () => {
    const perMinute = RATE_LIMITS.comment[0].max;
    for (let count = 0; count < perMinute; count += 1) {
      await posted(alice, `TEST quick comment ${count}.`);
    }
    const refused = await post(alice, "TEST one too many.");
    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({ code: "rate-limited" });
    const wait = Number(refused.headers.get("retry-after"));
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(60);
    // Counted per member, and refused attempts do not count.
    await posted(bob, "TEST another member is not limited.");
    expect((await post(alice, "TEST still refused.")).status).toBe(429);
  });

  it("limit votes and reports too", async () => {
    const target = await posted(alice, "TEST something to vote on.");
    for (let count = 0; count < RATE_LIMITS.vote[0].max; count += 1) {
      expect((await vote(bob, target.id, count % 2 === 0 ? 1 : 0)).status).toBe(
        200,
      );
    }
    expect((await vote(bob, target.id, 1)).status).toBe(429);

    const reported: string[] = [];
    for (let count = 0; count <= RATE_LIMITS.report[0].max; count += 1) {
      reported.push((await posted(alice, `TEST report me ${count}.`)).id);
      await clearRateLimits(); // Only the reports are counted here.
    }
    for (const [index, id] of reported.entries()) {
      expect((await report(bob, id)).status).toBe(
        index < RATE_LIMITS.report[0].max ? 201 : 429,
      );
    }
  });
});

describe("rate limits and refusals", () => {
  it("do not count writes the server refuses", async () => {
    const thread = await posted(alice, "TEST a thread to lock at once.");
    await clearRateLimits();
    expect(
      (await moderate(moderator, thread.id, { locked: true })).status,
    ).toBe(200);
    for (let count = 0; count <= RATE_LIMITS.comment[0].max; count += 1) {
      expect((await post(bob, "TEST refused reply.", thread.id)).status).toBe(
        409,
      );
    }
    await posted(bob, "TEST still allowed to post.");
  });
});

describe("link limits", () => {
  it("make new members wait before posting links, but not staff", async () => {
    const refused = await post(bob, "TEST see https://example.org/page.");
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: "link-limit" });
    // Bare domains are not links, and staff are appointed.
    await posted(bob, "TEST see example.org for more.");
    await posted(moderator, "TEST see https://example.org/rules.");
  });

  it("allow a few links once an account is old enough", async () => {
    await ageAccount(bobProfile);
    const comment = await posted(
      bob,
      "TEST https://example.org/a www.example.org/b http://example.net/c",
    );
    expect(comment.body).toContain("www.example.org/b");
    const tooMany = await post(
      bob,
      "TEST https://example.org/1 https://example.org/2 https://example.org/3 https://example.org/4",
    );
    expect(tooMany.status).toBe(403);
  });
});

describe("hiding comments", () => {
  let reported: PublicComment;

  beforeAll(async () => {
    await clearRateLimits();
    reported = await posted(alice, "TEST a comment that breaks the rules.");
    expect((await report(bob, reported.id, "abuse")).status).toBe(201);
  });

  it("needs a reason, and members cannot moderate", async () => {
    expect(
      (await moderate(moderator, reported.id, { status: "hidden" })).status,
    ).toBe(400);
    expect(
      (
        await moderate(alice, reported.id, {
          status: "hidden",
          moderationReason: "spam",
        })
      ).status,
    ).toBe(403);
    expect((await storedComment(reported.id)).status).toBe("visible");
  });

  it("takes the comment out of view, acts on its reports, and tells its author", async () => {
    const totalBefore = (await page()).total;
    const response = await moderate(moderator, reported.id, {
      status: "hidden",
      moderationReason: "abuse",
      moderationNote: "TEST note for staff.",
      // Staff cannot change what a member wrote.
      body: "TEST rewritten by staff.",
    });
    expect(response.status).toBe(200);

    const stored = await storedComment(reported.id);
    expect(stored).toMatchObject({
      status: "hidden",
      body: "TEST a comment that breaks the rules.",
      moderatedBy: moderatorProfile.id,
    });
    const after = await page();
    expect(listed(after, reported.id)).toBeUndefined();
    expect(after.total).toBe(totalBefore - 1);

    const { docs: reports } = await payload.find({
      collection: "comment-reports",
      where: { comment: { equals: reported.id } },
      depth: 0,
      overrideAccess: true,
    });
    expect(reports).toEqual([
      expect.objectContaining({
        status: "actioned",
        resolvedBy: moderatorProfile.id,
      }),
    ]);
    const [audit] = await auditEntries("comment.hidden", reported.id);
    expect(audit).toMatchObject({
      actor: moderatorProfile.id,
      details: { reason: "abuse", note: "TEST note for staff." },
    });

    const told = (await notifications(alice)).notifications.find(
      (item) => item.commentId === reported.id,
    );
    expect(told).toMatchObject({
      kind: "comment-hidden",
      status: "hidden",
      reason: "abuse",
      excerpt: "TEST a comment that breaks the rules.",
      read: false,
      topic: { slug: topic.slug },
    });
  });

  it("refuses votes, reports, replies, and links to a hidden comment", async () => {
    expect((await vote(bob, reported.id, 1)).status).toBe(404);
    expect((await report(moderator, reported.id)).status).toBe(404);
    expect((await post(bob, "TEST reply.", reported.id)).status).toBe(404);
    const linked = await getThread(
      request("GET", `/api/v1/topics/${topic.slug}/comments/${reported.id}`),
      { params: Promise.resolve({ slug: topic.slug, id: reported.id }) },
    );
    expect(linked.status).toBe(404);
    // Briefly, like a list: the comment may be shown again.
    expect(linked.headers.get("cache-control")).toBe(
      "public, max-age=0, s-maxage=15, stale-while-revalidate=60",
    );
  });

  it("re-counts the topic for search", async () => {
    const source = createTopicSearchSource(worker.pool);
    const state = (await source.topicStates([topic.id])).get(topic.id);
    expect(state?.document?.commentCount).toBe((await page()).total);
    const jobs = await worker.queues.search.getJobs(["waiting", "delayed"]);
    expect(
      jobs.some(
        (job) =>
          (job.data as { after?: { id?: string } }).after?.id === reported.id,
      ),
    ).toBe(true);
  });

  it("can be undone, which clears the reason", async () => {
    expect(
      (await moderate(moderator, reported.id, { status: "visible" })).status,
    ).toBe(200);
    expect(await storedComment(reported.id)).toMatchObject({
      status: "visible",
      moderationReason: null,
    });
    expect(listed(await page(), reported.id)).toBeDefined();
    expect(await auditEntries("comment.shown", reported.id)).toHaveLength(1);
    const told = (await notifications(alice)).notifications.find(
      (item) => item.commentId === reported.id,
    );
    expect(told).toMatchObject({ status: "visible", reason: null });
  });

  it("keeps a hidden thread's visible replies, under a placeholder", async () => {
    const thread = await posted(alice, "TEST a thread to hide.");
    const reply = await posted(bob, "TEST an innocent reply.", thread.id);
    const lonely = await posted(alice, "TEST a thread with no replies.");
    for (const id of [thread.id, lonely.id]) {
      expect(
        (
          await moderate(moderator, id, {
            status: "hidden",
            moderationReason: "off-topic",
          })
        ).status,
      ).toBe(200);
    }
    const current = await page();
    expect(listed(current, lonely.id)).toBeUndefined();
    const placeholder = listed(current, thread.id);
    expect(placeholder).toMatchObject({
      hidden: true,
      author: null,
      body: "",
      score: 0,
      replyCount: 1,
    });
    expect(placeholder?.replies.map((item) => item.id)).toEqual([reply.id]);
    // A link to the reply still finds the thread.
    const linked = await getThread(
      request("GET", `/api/v1/topics/${topic.slug}/comments/${reply.id}`),
      { params: Promise.resolve({ slug: topic.slug, id: reply.id }) },
    );
    expect(linked.status).toBe(200);
    expect((await contractJson(LinkedThread, linked)).thread).toMatchObject({
      id: thread.id,
      hidden: true,
    });
    // Only within its own topic, and with no parameters.
    const elsewhere = await getThread(
      request("GET", `/api/v1/topics/${otherTopic.slug}/comments/${reply.id}`),
      { params: Promise.resolve({ slug: otherTopic.slug, id: reply.id }) },
    );
    expect(elsewhere.status).toBe(404);
    const withParams = await getThread(
      request("GET", `/api/v1/topics/${topic.slug}/comments/${reply.id}`, {
        search: "?sort=new",
      }),
      { params: Promise.resolve({ slug: topic.slug, id: reply.id }) },
    );
    expect(withParams.status).toBe(400);
  });
});

describe("removing comments", () => {
  it("is for admins only, erases the text, and cannot be undone", async () => {
    const comment = await posted(alice, "TEST text the law requires removed.");
    const removal = { status: "removed", moderationReason: "other" };
    expect((await moderate(moderator, comment.id, removal)).status).toBe(400);
    expect((await moderate(admin, comment.id, removal)).status).toBe(200);
    expect(await storedComment(comment.id)).toMatchObject({
      status: "removed",
      body: "",
    });
    const [audit] = await auditEntries("comment.removed", comment.id);
    expect(JSON.stringify(audit?.details)).not.toContain("law requires");
    expect(
      (await moderate(admin, comment.id, { status: "visible" })).status,
    ).toBe(400);
    const told = (await notifications(alice)).notifications.find(
      (item) => item.commentId === comment.id,
    );
    expect(told).toMatchObject({ status: "removed", excerpt: null });
  });
});

describe("locking threads", () => {
  it("stops replies and votes but not reports", async () => {
    const thread = await posted(alice, "TEST a heated thread.");
    const reply = await posted(bob, "TEST a heated reply.", thread.id);
    expect((await moderate(moderator, reply.id, { locked: true })).status).toBe(
      400,
    );
    expect(
      (await moderate(moderator, thread.id, { locked: true })).status,
    ).toBe(200);
    expect(listed(await page(), thread.id)?.locked).toBe(true);

    const replied = await post(bob, "TEST one more.", thread.id);
    expect(replied.status).toBe(409);
    expect(await replied.json()).toMatchObject({ code: "locked" });
    expect((await vote(bob, thread.id, 1)).status).toBe(409);
    expect((await vote(alice, reply.id, 1)).status).toBe(409);
    expect((await report(alice, reply.id)).status).toBe(201);
    expect(await auditEntries("comment.locked", thread.id)).toHaveLength(1);
  });
});

describe("moderation and votes at the same time", () => {
  it("keeps a vote made while staff save the comment", async () => {
    const comment = await posted(alice, "TEST voted on while moderated.");
    const client = await worker.pool.connect();
    try {
      // A vote's transaction holds the row while the staff save starts.
      await client.query("BEGIN");
      await client.query(
        "UPDATE comments SET score = score + 1 WHERE id = $1",
        [comment.id],
      );
      const saving = moderate(moderator, comment.id, {
        moderationNote: "TEST looked at it.",
      });
      await someoneWaitsForALock();
      await client.query("COMMIT");
      expect((await saving).status).toBe(200);
    } finally {
      client.release();
    }
    expect((await storedComment(comment.id)).score).toBe(1);
  });

  it("refuses a vote that waited for a thread being locked", async () => {
    const thread = await posted(alice, "TEST locked while voting.");
    const reply = await posted(bob, "TEST a reply voted on.", thread.id);
    const client = await worker.pool.connect();
    try {
      // A moderator's save locking the thread, not yet committed.
      await client.query("BEGIN");
      await client.query("UPDATE comments SET locked = true WHERE id = $1", [
        thread.id,
      ]);
      const voting = vote(alice, reply.id, 1);
      await someoneWaitsForALock();
      await client.query("COMMIT");
      expect((await voting).status).toBe(409);
    } finally {
      client.release();
    }
  });
});

describe("reports", () => {
  it("can be dismissed by staff only, recording who and when", async () => {
    const comment = await posted(alice, "TEST a fine comment.");
    expect((await report(bob, comment.id, "misleading")).status).toBe(201);
    const { docs } = await payload.find({
      collection: "comment-reports",
      where: { comment: { equals: comment.id } },
      depth: 0,
      overrideAccess: true,
    });
    const id = docs[0]?.id ?? "";
    expect(
      (
        await payloadRest("PATCH", ["comment-reports", id], bob, {
          status: "dismissed",
        })
      ).status,
    ).toBe(403);
    const dismissed = await payloadRest(
      "PATCH",
      ["comment-reports", id],
      moderator,
      { status: "dismissed", reason: "spam" },
    );
    expect(dismissed.status).toBe(200);
    const stored = await payload.findByID({
      collection: "comment-reports",
      id,
      depth: 0,
      overrideAccess: true,
    });
    expect(stored).toMatchObject({
      status: "dismissed",
      // Staff cannot change what the member reported.
      reason: "misleading",
      resolvedBy: moderatorProfile.id,
    });
    expect(stored.resolvedAt).toBeTruthy();
    expect(await auditEntries("comment-report.updated", id)).toHaveLength(1);
  });
});

describe("notifications", () => {
  let thread: PublicComment;
  let reply: PublicComment;

  beforeAll(async () => {
    await clearRateLimits();
    thread = await posted(alice, "TEST does anyone know more?");
    reply = await posted(bob, "TEST yes, here is what I found.", thread.id);
    // Replying in one's own thread tells nobody.
    await posted(alice, "TEST thanks!", thread.id);
  });

  it("tell a thread's author about replies, as they are now", async () => {
    const replyNotes = (await notifications(alice)).notifications.filter(
      (item) => item.kind === "reply" && item.commentId === reply.id,
    );
    expect(replyNotes).toEqual([
      expect.objectContaining({
        kind: "reply",
        author: "TEST Bob M",
        excerpt: "TEST yes, here is what I found.",
        read: false,
        topic: { slug: topic.slug, title: topic.title },
      }),
    ]);
    expect(
      (await notifications(bob)).notifications.some(
        (item) => item.kind === "reply",
      ),
    ).toBe(false);
  });

  it("are marked read by their recipient only", async () => {
    const before = await unread(alice);
    expect(before).toBeGreaterThan(0);
    const ids = (await notifications(alice)).notifications.map(
      (item) => item.id,
    );
    const forged = await markRead(bob, ids);
    expect(await forged.json()).toEqual({ marked: 0 });
    expect(await unread(alice)).toBe(before);
    const marked = await markRead(alice, ids);
    expect(marked.status).toBe(200);
    expect(await unread(alice)).toBe(0);
    expect(
      (await notifications(alice)).notifications.every((item) => item.read),
    ).toBe(true);
  });

  it("drop a reply while its topic is not public", async () => {
    const note = await posted(
      bob,
      "TEST a reply on a topic to unpublish.",
      thread.id,
    );
    const isListed = async () =>
      (await notifications(alice)).notifications.some(
        (item) => item.commentId === note.id,
      );
    expect(await isListed()).toBe(true);
    await worker.pool.query(
      "UPDATE topics SET _status = 'draft' WHERE id = $1",
      [topic.id],
    );
    try {
      expect(await isListed()).toBe(false);
    } finally {
      await worker.pool.query(
        "UPDATE topics SET _status = 'published' WHERE id = $1",
        [topic.id],
      );
    }
    expect(await isListed()).toBe(true);
    await markRead(
      alice,
      (await notifications(alice)).notifications.map((item) => item.id),
    );
  });

  it("drop a reply once a moderator hides it", async () => {
    const spam = await posted(bob, "TEST buy things.", thread.id);
    expect(await unread(alice)).toBe(1);
    await moderate(moderator, spam.id, {
      status: "hidden",
      moderationReason: "spam",
    });
    expect(await unread(alice)).toBe(0);
    expect(
      (await notifications(alice)).notifications.some(
        (item) => item.commentId === spam.id,
      ),
    ).toBe(false);
  });

  it("page newest first without repeats", async () => {
    const commentTopic = await findCommentTopic(worker.pool, otherTopic.slug);
    if (!commentTopic) throw new Error("The topic is public");
    const { comment: start } = await createComment(worker.pool, {
      topic: commentTopic,
      authorId: aliceProfile.id,
      parentId: null,
      body: "TEST a long thread.",
    });
    for (let count = 0; count < NOTIFICATIONS_PAGE_SIZE + 2; count += 1) {
      await createComment(worker.pool, {
        topic: commentTopic,
        authorId: bobProfile.id,
        parentId: start.id,
        body: `TEST paged reply ${count}.`,
      });
    }
    const seen: MemberNotification[] = [];
    let cursor: string | null = null;
    do {
      const response = await getNotifications(
        request("GET", "/api/v1/account/notifications", {
          jar: alice,
          search: cursor ? `?cursor=${cursor}` : "",
        }),
      );
      const current = (await response.json()) as NotificationPage;
      seen.push(...current.notifications);
      cursor = current.nextCursor;
    } while (cursor);
    const ids = seen.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    const times = seen.map((item) => item.createdAt);
    expect(times).toEqual([...times].sort().reverse());
    expect(seen[0]).toMatchObject({ excerpt: "TEST paged reply 21." });
  });

  it("are private, and go with a deleted account", async () => {
    expect(
      (await getNotifications(request("GET", "/api/v1/account/notifications")))
        .status,
    ).toBe(401);
    const carol = await staffProfile(
      payload,
      "moderation-carol",
      "member",
      false,
    );
    await worker.pool.query(
      "UPDATE users SET display_name = 'TEST Carol M' WHERE id = $1",
      [carol.id],
    );
    const commentTopic = await findCommentTopic(worker.pool, topic.slug);
    if (!commentTopic) throw new Error("The topic is public");
    const { comment } = await createComment(worker.pool, {
      topic: commentTopic,
      authorId: carol.id,
      parentId: null,
      body: "TEST soon gone.",
    });
    await createComment(worker.pool, {
      topic: commentTopic,
      authorId: bobProfile.id,
      parentId: comment.id,
      body: "TEST a reply to Carol.",
    });
    await payload.delete({
      collection: "users",
      id: carol.id,
      overrideAccess: true,
    });
    const { rows } = await worker.pool.query(
      "SELECT 1 FROM notifications WHERE recipient_id = $1",
      [carol.id],
    );
    expect(rows).toHaveLength(0);
  });
});
