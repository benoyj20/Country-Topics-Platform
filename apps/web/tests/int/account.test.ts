import {
  AccountAnswer,
  CommentPage,
  type CommentViewer,
  PostedComment,
  type PublicComment,
  SignInOptions,
} from "@countrytopics/contracts";
import { createTopicSearchSource } from "@countrytopics/jobs";
import config from "@payload-config";
import {
  getPayload,
  type Payload,
  type RequiredDataFromCollectionSlug,
} from "payload";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AccountExport } from "@/account/export";
import { GET as getViewer } from "@/app/(frontend)/api/v1/account/comments/route";
import { PUT as putDisplayName } from "@/app/(frontend)/api/v1/account/display-name/route";
import { GET as getExport } from "@/app/(frontend)/api/v1/account/export/route";
import {
  DELETE as deleteAccount,
  GET as getAccount,
} from "@/app/(frontend)/api/v1/account/route";
import { POST as postReport } from "@/app/(frontend)/api/v1/comments/[id]/reports/route";
import { PUT as putVote } from "@/app/(frontend)/api/v1/comments/[id]/vote/route";
import { POST as postFeedback } from "@/app/(frontend)/api/v1/feedback/route";
import { GET as getSignInOptions } from "@/app/(frontend)/api/v1/sign-in-options/route";
import {
  GET as getComments,
  POST as postComments,
} from "@/app/(frontend)/api/v1/topics/[slug]/comments/route";
import { serverEnv } from "@/env";
import type { Topic, User } from "@/payload-types";
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

// Account deletion, the data export, and feedback (ADR 0011), through the
// /api/v1 routes as the browser calls them. Every topic, name, comment,
// and message here is made up for the tests; the topic is about Cyprus,
// which no other test uses.
let payload: Payload;
let stopEmailWorker: (() => Promise<void>) | undefined;
let worker: Awaited<ReturnType<typeof workerSide>>;
let adminProfile: User;
let admin: CookieJar;
let dave: CookieJar;
let daveProfile: User;
let topic: Topic;

type Call = {
  jar?: CookieJar;
  body?: unknown;
  headers?: Record<string, string>;
};

function request(
  method: string,
  path: string,
  { jar, body, headers = {} }: Call = {},
): Request {
  const all = new Headers({ origin: SITE_URL, ...headers });
  if (jar) all.set("cookie", jar.header());
  if (body !== undefined) all.set("content-type", "application/json");
  return new Request(`${SITE_URL}${path}`, {
    method,
    headers: all,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const bySlug = (slug: string) => ({ params: Promise.resolve({ slug }) });
const byId = (id: string) => ({ params: Promise.resolve({ id }) });

async function signedInMember(
  name: string,
  displayName: string,
): Promise<{ jar: CookieJar; profile: User }> {
  const profile = await staffProfile(payload, name, "member", false);
  const jar = await signInWithEmailLink(testEmail(name));
  const named = await putDisplayName(
    request("PUT", "/api/v1/account/display-name", {
      jar,
      body: { displayName },
    }),
  );
  expect(named.status).toBe(200);
  // As linked to its sign-in account by the first sign-in.
  return {
    jar,
    profile: await payload.findByID({
      collection: "users",
      id: profile.id,
      depth: 0,
      overrideAccess: true,
    }),
  };
}

async function posted(
  jar: CookieJar,
  body: string,
  parentId: string | null = null,
): Promise<PublicComment> {
  const response = await postComments(
    request("POST", `/api/v1/topics/${topic.slug}/comments`, {
      jar,
      body: { body, parentId },
    }),
    bySlug(topic.slug),
  );
  expect(response.status).toBe(201);
  return (await contractJson(PostedComment, response)).comment;
}

async function page(): Promise<CommentPage> {
  const response = await getComments(
    new Request(`${SITE_URL}/api/v1/topics/${topic.slug}/comments?sort=new`),
    bySlug(topic.slug),
  );
  expect(response.status).toBe(200);
  return contractJson(CommentPage, response);
}

const listed = (current: CommentPage, id: string) =>
  current.threads.find((thread) => thread.id === id);

function deletion(jar: CookieJar | undefined, email: string, origin?: string) {
  return deleteAccount(
    request("DELETE", "/api/v1/account", {
      jar,
      body: { email },
      headers: origin ? { origin } : {},
    }),
  );
}

function exported(jar: CookieJar | undefined, headers = {}) {
  return getExport(request("GET", "/api/v1/account/export", { jar, headers }));
}

function feedback(jar: CookieJar | undefined, body: unknown, origin?: string) {
  return postFeedback(
    request("POST", "/api/v1/feedback", {
      jar,
      body,
      headers: origin ? { origin } : {},
    }),
  );
}

async function storedComment(id: string) {
  const { rows } = await worker.pool.query<{
    status: string;
    body: string;
    author_id: string | null;
    score: number;
  }>(
    "SELECT status::text AS status, body, author_id::text AS author_id, score::int AS score FROM comments WHERE id = $1",
    [id],
  );
  return rows[0];
}

async function auditEntries(action: string, targetId: string) {
  const { docs } = await payload.find({
    collection: "audit-log",
    where: { action: { equals: action }, targetId: { equals: targetId } },
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

beforeAll(async () => {
  payload = await getPayload({ config });
  worker = await workerSide();
  stopEmailWorker = startEmailWorker();
  adminProfile = await staffProfile(payload, "account-admin", "admin");
  admin = await signInAsVerifiedStaff(testEmail("account-admin"));
  ({ jar: dave, profile: daveProfile } = await signedInMember(
    "account-dave",
    "TEST Dave A",
  ));
  const created = await payload.create({
    collection: "topics",
    data: {
      title: "TEST Halloumi account topic",
      slug: "",
      summary: "A fictional topic for the account tests.",
      body: richText("Fictional text."),
      countries: [await countryId(payload, "CY")],
    } as RequiredDataFromCollectionSlug<"topics">,
    draft: true,
    user: adminProfile,
    overrideAccess: false,
  });
  topic = await payload.update({
    collection: "topics",
    id: created.id,
    data: { _status: "published" },
    user: adminProfile,
    overrideAccess: false,
  });
}, 120_000);

beforeEach(clearRateLimits);

afterAll(async () => {
  await stopEmailWorker?.();
  await worker?.close();
});

describe("the account, as the frontend asks for it", () => {
  it("is the signed-in person, or null for visitors, and is never cached", async () => {
    const asked = await getAccount(
      request("GET", "/api/v1/account", { jar: dave }),
    );
    expect(asked.status).toBe(200);
    expect(asked.headers.get("cache-control")).toBe("private, no-store");
    // Reading the session sets no cookie: the frontend renders with it.
    expect(asked.headers.getSetCookie()).toEqual([]);
    expect((await contractJson(AccountAnswer, asked)).account).toEqual({
      email: testEmail("account-dave"),
      name: daveProfile.name ?? null,
      displayName: "TEST Dave A",
      role: "member",
      staff: false,
      twoFactorEnabled: false,
      adminVerified: false,
    });

    const staff = await contractJson(
      AccountAnswer,
      await getAccount(request("GET", "/api/v1/account", { jar: admin })),
    );
    expect(staff.account).toMatchObject({
      role: "admin",
      staff: true,
      twoFactorEnabled: true,
      adminVerified: true,
    });

    const visitor = await contractJson(
      AccountAnswer,
      await getAccount(request("GET", "/api/v1/account")),
    );
    expect(visitor.account).toBeNull();
  });

  it("comes with what the sign-in page offers", async () => {
    const response = getSignInOptions();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await contractJson(SignInOptions, response)).toEqual({
      google: Boolean(serverEnv().google),
      turnstileSiteKey: serverEnv().turnstile?.siteKey ?? null,
    });
  });
});

describe("feedback", () => {
  it("is saved with its author and the path it was sent from", async () => {
    const sent = await feedback(dave, {
      kind: "problem",
      message: "  TEST the menu covers the title.‮  ",
      page: "/topics/test-topic?q=private#comment-1",
    });
    expect(sent.status).toBe(201);
    expect(sent.headers.get("cache-control")).toBe("private, no-store");
    const elsewhere = await feedback(dave, {
      kind: "idea",
      message: "TEST an idea.",
      page: "https://evil.example/",
    });
    expect(elsewhere.status).toBe(201);
    const { docs } = await payload.find({
      collection: "feedback",
      where: { author: { equals: daveProfile.id } },
      sort: "createdAt",
      depth: 0,
      overrideAccess: true,
    });
    expect(docs).toMatchObject([
      {
        kind: "problem",
        message: "TEST the menu covers the title.",
        page: "/topics/test-topic",
        status: "new",
      },
      { kind: "idea", page: null },
    ]);
  });

  it("is refused from visitors, other sites, and without text", async () => {
    const valid = { kind: "other", message: "TEST hello." };
    expect((await feedback(undefined, valid)).status).toBe(401);
    expect((await feedback(dave, valid, "https://evil.example")).status).toBe(
      403,
    );
    expect((await feedback(dave, { ...valid, message: " \n " })).status).toBe(
      400,
    );
    expect((await feedback(dave, { ...valid, kind: "complaint" })).status).toBe(
      400,
    );
  });

  it("is rate-limited", async () => {
    const perHour = RATE_LIMITS.feedback[0].max;
    for (let count = 0; count < perHour; count += 1) {
      expect(
        (await feedback(dave, { kind: "other", message: `TEST ${count}.` }))
          .status,
      ).toBe(201);
    }
    const refused = await feedback(dave, { kind: "other", message: "TEST." });
    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({ code: "rate-limited" });
  });

  it("is read and marked done by staff, who cannot change it", async () => {
    const listedForStaff = await payloadRest("GET", ["feedback"], admin);
    expect(listedForStaff.status).toBe(200);
    const { docs } = (await listedForStaff.json()) as {
      docs: { id: string; message: string }[];
    };
    const [first] = docs;
    if (!first) throw new Error("No feedback listed");
    const marked = await payloadRest("PATCH", ["feedback", first.id], admin, {
      status: "done",
      message: "TEST rewritten by staff.",
    });
    expect(marked.status).toBe(200);
    const stored = await payload.findByID({
      collection: "feedback",
      id: first.id,
      overrideAccess: true,
    });
    expect(stored).toMatchObject({ status: "done", message: first.message });
    expect(await auditEntries("feedback.updated", first.id)).toMatchObject([
      {
        actor: adminProfile.id,
        details: { changes: { status: { from: "new", to: "done" } } },
      },
    ]);
    expect((await payloadRest("GET", ["feedback"], dave)).status).toBe(403);
  });
});

describe("data export", () => {
  it("holds the member's own data and nobody else's", async () => {
    const own = await posted(dave, "TEST Dave's exported comment.");
    const other = await signedInMember("account-erin", "TEST Erin A");
    const theirs = await posted(other.jar, "TEST Erin's comment.");
    expect(
      (
        await putVote(
          request("PUT", `/api/v1/comments/${theirs.id}/vote`, {
            jar: dave,
            body: { value: 1 },
          }),
          byId(theirs.id),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await postReport(
          request("POST", `/api/v1/comments/${theirs.id}/reports`, {
            jar: dave,
            body: { reason: "off-topic" },
          }),
          byId(theirs.id),
        )
      ).status,
    ).toBe(201);
    await posted(other.jar, "TEST Erin replies to Dave.", own.id);
    // Hidden, with a note staff keep to themselves.
    expect(
      (
        await payloadRest("PATCH", ["comments", own.id], admin, {
          status: "hidden",
          moderationReason: "spam",
          moderationNote: "TEST staff-only note.",
        })
      ).status,
    ).toBe(200);

    const response = await exported(dave);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment; filename="country-topics-data-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    const data = (await response.json()) as AccountExport;
    expect(data.account).toMatchObject({
      email: testEmail("account-dave"),
      displayName: "TEST Dave A",
      role: "member",
    });
    expect(data.sessions.length).toBeGreaterThan(0);
    expect(data.comments).toEqual([
      expect.objectContaining({
        id: own.id,
        topic: topic.slug,
        text: "TEST Dave's exported comment.",
        status: "hidden",
        moderationReason: "spam",
      }),
    ]);
    expect(JSON.stringify(data)).not.toContain("staff-only note");
    expect(JSON.stringify(data)).not.toContain("Erin's comment");
    expect(data.votes).toEqual([
      expect.objectContaining({ comment: theirs.id, value: 1 }),
    ]);
    expect(data.reports).toEqual([
      expect.objectContaining({ comment: theirs.id, reason: "off-topic" }),
    ]);
    expect(data.notifications).toEqual([
      expect.objectContaining({ kind: "reply" }),
      expect.objectContaining({ kind: "comment-hidden", comment: own.id }),
    ]);
    expect(data.feedback.length).toBeGreaterThan(0);
  });

  it("is refused to visitors and to requests from other sites", async () => {
    expect((await exported(undefined)).status).toBe(401);
    expect(
      (await exported(dave, { "sec-fetch-site": "cross-site" })).status,
    ).toBe(403);
  });
});

describe("account deletion", () => {
  let carol: CookieJar;
  let carolProfile: User;

  beforeAll(async () => {
    ({ jar: carol, profile: carolProfile } = await signedInMember(
      "account-carol",
      "TEST Carol A",
    ));
  });

  it("needs the member's email, a recent sign-in, and a member account", async () => {
    const email = testEmail("account-carol");
    expect((await deletion(undefined, email)).status).toBe(401);
    expect((await deletion(carol, email, "https://evil.example")).status).toBe(
      403,
    );
    const wrong = await deletion(carol, testEmail("account-dave"));
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toMatchObject({ code: "confirm-email" });

    const staff = await deletion(admin, testEmail("account-admin"));
    expect(staff.status).toBe(403);
    expect(await staff.json()).toMatchObject({ code: "staff-account" });

    // A session that began 11 minutes earlier than it did.
    expect(carolProfile.authUserId).toBeTruthy();
    const shift = (direction: "-" | "+") =>
      worker.pool.query(
        `UPDATE auth_session SET "createdAt" = "createdAt" ${direction} interval '11 minutes' WHERE "userId" = $1`,
        [carolProfile.authUserId],
      );
    await shift("-");
    try {
      const stale = await deletion(carol, email);
      expect(stale.status).toBe(403);
      expect(await stale.json()).toMatchObject({ code: "sign-in-again" });
    } finally {
      await shift("+");
    }
    expect(
      await payload.count({
        collection: "users",
        where: { id: { equals: carolProfile.id } },
        overrideAccess: true,
      }),
    ).toMatchObject({ totalDocs: 1 });
  });

  it("erases the member's comments and personal data, keeping the discussion", async () => {
    const thread = await posted(carol, "TEST Carol's thread.");
    const daveReply = await posted(
      dave,
      "TEST Dave replies to Carol.",
      thread.id,
    );
    const lonely = await posted(carol, "TEST Carol's lonely comment.");
    const daveThread = await posted(dave, "TEST Dave's thread.");
    const carolReply = await posted(
      carol,
      "TEST Carol replies to Dave.",
      daveThread.id,
    );
    const hidden = await posted(carol, "TEST Carol's hidden comment.");
    const removed = await posted(carol, "TEST Carol's removed comment.");
    for (const [id, status] of [
      [hidden.id, "hidden"],
      [removed.id, "removed"],
    ] as const) {
      expect(
        (
          await payloadRest("PATCH", ["comments", id], admin, {
            status,
            moderationReason: "abuse",
          })
        ).status,
      ).toBe(200);
    }
    expect(
      (
        await putVote(
          request("PUT", `/api/v1/comments/${daveThread.id}/vote`, {
            jar: carol,
            body: { value: 1 },
          }),
          byId(daveThread.id),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await postReport(
          request("POST", `/api/v1/comments/${daveReply.id}/reports`, {
            jar: carol,
            body: { reason: "spam" },
          }),
          byId(daveReply.id),
        )
      ).status,
    ).toBe(201);
    expect(
      (await feedback(carol, { kind: "idea", message: "TEST Carol's idea." }))
        .status,
    ).toBe(201);
    // A report waiting for moderators on a comment about to be erased.
    expect(
      (
        await postReport(
          request("POST", `/api/v1/comments/${lonely.id}/reports`, {
            jar: dave,
            body: { reason: "off-topic" },
          }),
          byId(lonely.id),
        )
      ).status,
    ).toBe(201);

    // Typed as people type it.
    const deleted = await deletion(
      carol,
      ` ${testEmail("account-carol").toUpperCase()} `,
    );
    expect(deleted.status).toBe(200);
    expect(deleted.headers.get("cache-control")).toBe("private, no-store");

    // The account and its sign-in are gone, so the session no longer works.
    const viewer = await getViewer(
      request("GET", "/api/v1/account/comments", { jar: carol }),
    );
    expect(((await viewer.json()) as CommentViewer).account).toBeNull();
    expect((await exported(carol)).status).toBe(401);
    const { rows: authUsers } = await worker.pool.query(
      `SELECT 1 FROM auth_user WHERE id = $1`,
      [carolProfile.authUserId],
    );
    expect(authUsers).toHaveLength(0);

    // Comments: text erased; removed stays removed.
    for (const id of [thread.id, lonely.id, carolReply.id, hidden.id]) {
      expect(await storedComment(id)).toMatchObject({
        status: "deleted",
        body: "",
        author_id: null,
      });
    }
    expect(await storedComment(removed.id)).toMatchObject({
      status: "removed",
      author_id: null,
    });
    const current = await page();
    expect(listed(current, thread.id)).toMatchObject({
      hidden: true,
      deleted: true,
      author: null,
      body: "",
      replies: [expect.objectContaining({ id: daveReply.id })],
    });
    expect(listed(current, lonely.id)).toBeUndefined();
    expect(listed(current, daveThread.id)).toMatchObject({
      deleted: false,
      replyCount: 0,
      // The vote stays in the score.
      score: 1,
    });

    // Votes and reports stay without the link; the rest is deleted.
    const { rows: votes } = await worker.pool.query(
      "SELECT voter_id FROM comment_votes WHERE comment_id = $1",
      [daveThread.id],
    );
    expect(votes).toEqual([{ voter_id: null }]);
    const { rows: reports } = await worker.pool.query(
      "SELECT reporter_id FROM comment_reports WHERE comment_id = $1",
      [daveReply.id],
    );
    expect(reports).toEqual([{ reporter_id: null }]);
    // Reports on the erased comments are closed.
    const { rows: closed } = await worker.pool.query(
      "SELECT status::text AS status FROM comment_reports WHERE comment_id = $1",
      [lonely.id],
    );
    expect(closed).toEqual([{ status: "actioned" }]);
    for (const [table, column] of [
      ["notifications", "recipient_id"],
      ["feedback", "author_id"],
      ["users", "id"],
    ] as const) {
      const { rows } = await worker.pool.query(
        `SELECT 1 FROM ${table} WHERE ${column} = $1`,
        [carolProfile.id],
      );
      expect(rows, table).toHaveLength(0);
    }

    // Audited without an actor, who no longer exists.
    expect(await auditEntries("user.deleted", carolProfile.id)).toMatchObject([
      {
        actor: null,
        details: { email: testEmail("account-carol"), own: true },
      },
    ]);

    // The topic is re-counted for search.
    const source = createTopicSearchSource(worker.pool);
    const state = (await source.topicStates([topic.id])).get(topic.id);
    expect(state?.document?.commentCount).toBe(current.total);
    const jobs = await worker.queues.search.getJobs(["waiting", "delayed"]);
    expect(
      jobs.some((job) =>
        [thread.id, lonely.id, carolReply.id].includes(
          (job.data as { after?: { id?: string } }).after?.id ?? "",
        ),
      ),
    ).toBe(true);
  });

  it("waits for a reply being posted in the member's thread, without deadlock", async () => {
    const henry = await signedInMember("account-henry", "TEST Henry A");
    const thread = await posted(henry.jar, "TEST Henry's thread.");
    const replyId = uuidv7();
    const client = await worker.pool.connect();
    try {
      // A reply's transaction, as createComment runs it: it shares a lock
      // on the thread, then tells the thread's author.
      await client.query("BEGIN");
      await client.query("SELECT 1 FROM comments WHERE id = $1 FOR SHARE", [
        thread.id,
      ]);
      const deleting = deletion(henry.jar, testEmail("account-henry"));
      await someoneWaitsForALock();
      await client.query(
        `INSERT INTO comments (id, topic_id, parent_id, author_id, body, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'TEST a reply meanwhile.', now(), now())`,
        [replyId, topic.id, thread.id, daveProfile.id],
      );
      await client.query(
        `INSERT INTO notifications (id, recipient_id, kind, comment_id)
         VALUES ($1, $2, 'reply', $3)`,
        [uuidv7(), henry.profile.id, replyId],
      );
      await client.query("COMMIT");
      expect((await deleting).status).toBe(200);
    } finally {
      client.release();
    }
    expect(await storedComment(thread.id)).toMatchObject({ status: "deleted" });
    expect(await storedComment(replyId)).toMatchObject({ status: "visible" });
  });

  it("erases a comment posted while the deletion runs", async () => {
    const frank = await signedInMember("account-frank", "TEST Frank A");
    const commentId = uuidv7();
    const client = await worker.pool.connect();
    try {
      // A comment's transaction, not yet committed, references the profile.
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO comments (id, topic_id, author_id, body, created_at, updated_at)
         VALUES ($1, $2, $3, 'TEST posted meanwhile.', now(), now())`,
        [commentId, topic.id, frank.profile.id],
      );
      const deleting = deletion(frank.jar, testEmail("account-frank"));
      await someoneWaitsForALock();
      await client.query("COMMIT");
      expect((await deleting).status).toBe(200);
    } finally {
      client.release();
    }
    expect(await storedComment(commentId)).toMatchObject({
      status: "deleted",
      body: "",
      author_id: null,
    });
  });

  it("does the same when an admin deletes an account", async () => {
    const grace = await signedInMember("account-grace", "TEST Grace A");
    const comment = await posted(grace.jar, "TEST Grace's comment.");
    await payload.delete({
      collection: "users",
      id: grace.profile.id,
      user: adminProfile,
      overrideAccess: false,
    });
    expect(await storedComment(comment.id)).toMatchObject({
      status: "deleted",
      body: "",
    });
    expect(await auditEntries("user.deleted", grace.profile.id)).toMatchObject([
      { actor: adminProfile.id, details: { own: false } },
    ]);
  });

  it("refuses staff deleting their own account in the admin panel", async () => {
    await expect(
      payload.delete({
        collection: "users",
        id: adminProfile.id,
        user: adminProfile,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      await payload.count({
        collection: "users",
        where: { id: { equals: adminProfile.id } },
        overrideAccess: true,
      }),
    ).toMatchObject({ totalDocs: 1 });
  });

  it("leaves a deleted comment to staff only to lock, not to show", async () => {
    const thread = (await page()).threads.find((item) => item.deleted);
    if (!thread) throw new Error("No deleted thread listed");
    const shown = await payloadRest("PATCH", ["comments", thread.id], admin, {
      status: "visible",
    });
    expect(shown.status).toBe(400);
    const locked = await payloadRest("PATCH", ["comments", thread.id], admin, {
      locked: true,
    });
    expect(locked.status).toBe(200);
  });
});
