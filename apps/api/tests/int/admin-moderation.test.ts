import {
  commentFieldOf,
  commentReportsSchema,
  commentReportsSearchParams,
  commentSaveBody,
  commentSearchParams,
  type CommentValues,
  commentTopicSlug,
  editorComment,
  editorFeedback,
  editorInvitation,
  editorReport,
  editorUser,
  EMPTY_INVITATION,
  feedbackFieldOf,
  feedbackSaveBody,
  feedbackSearchParams,
  invitationFieldOf,
  invitationSaveBody,
  invitationSearchParams,
  type InvitationValues,
  payloadRefusal,
  type Refusal,
  reportFieldOf,
  reportSaveBody,
  reportSearchParams,
  savedRecordSchema,
  storedAuditEntrySchema,
  storedCommentSchema,
  storedFeedbackSchema,
  storedInvitationSchema,
  storedReportSchema,
  storedUserSchema,
  auditEntrySearchParams,
  userFieldOf,
  userSaveBody,
  userSearchParams,
} from "@countrytopics/contracts";
import config from "@payload-config";
import {
  getPayload,
  type Payload,
  type RequiredDataFromCollectionSlug,
} from "payload";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type * as z from "zod";

import type { Topic, User } from "@/payload-types";

import { richText } from "./fixtures";
import {
  clearRateLimits,
  CookieJar,
  countryId,
  payloadRest,
  signInAsVerifiedStaff,
  staffProfile,
  startEmailWorker,
  testEmail,
} from "./helpers";

// The admin's moderation and people editors (packages/contracts:
// admin-moderation.ts, admin-people.ts) against the backend: each record
// read as its editor reads it, and changed as it saves, with what follows
// (a hidden comment's reports acted on, its author told, a removed one's
// text erased, each change audited), and every refusal landing on a field
// the editor shows (ADR 0014, phase 10). Every person, topic, comment, and
// address here is made up; addresses use the reserved example.test domain.

let payload: Payload;
let stopEmailWorker: () => Promise<void>;
let admin: User;
let moderator: User;
let author: User;
let reporter: User;
let adminJar: CookieJar;
let moderatorJar: CookieJar;
let topic: Topic;

type FieldOf = (path: string) => string | null;

function save(
  jar: CookieJar,
  collection: string,
  id: string | null,
  body: unknown,
  query: URLSearchParams,
): Promise<Response> {
  return payloadRest(
    id ? "PATCH" : "POST",
    id ? [collection, id] : [collection],
    jar,
    body,
    undefined,
    `?${query}`,
  );
}

async function saved<T>(response: Response, schema: z.ZodType<T>) {
  expect(response.status, await response.clone().text()).toBeLessThan(300);
  return savedRecordSchema(schema).parse(await response.json()).doc;
}

async function refusal(response: Response, fieldOf: FieldOf): Promise<Refusal> {
  expect(response.status, await response.clone().text()).toBeGreaterThanOrEqual(
    400,
  );
  return payloadRefusal(response.status, await response.json(), fieldOf);
}

/** The refusal's messages, each on a field the editor shows. */
async function placed(response: Response, fieldOf: FieldOf) {
  const refused = await refusal(response, fieldOf);
  expect(refused.general).toEqual([]);
  return refused.fields;
}

async function read<T>(
  jar: CookieJar,
  collection: string,
  id: string,
  query: URLSearchParams,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await payloadRest(
    "GET",
    [collection, id],
    jar,
    undefined,
    undefined,
    `?${query}`,
  );
  expect(response.status, await response.clone().text()).toBe(200);
  return schema.parse(await response.json());
}

/** A member's comment on the test topic, as /api/v1 stores one. */
async function comment(body: string, parent: string | null = null) {
  return payload.create({
    collection: "comments",
    data: {
      topic: topic.id,
      author: author.id,
      body,
      parent,
      score: 0,
      status: "visible",
      locked: false,
    },
    overrideAccess: true,
  });
}

function report(commentId: string, member: User = reporter) {
  return payload.create({
    collection: "comment-reports",
    data: {
      comment: commentId,
      reporter: member.id,
      reason: "spam",
      status: "open",
    },
    overrideAccess: true,
  });
}

function moderate(jar: CookieJar, id: string, values: CommentValues) {
  return save(
    jar,
    "comments",
    id,
    commentSaveBody(values),
    commentSearchParams(),
  );
}

async function readComment(jar: CookieJar, id: string) {
  return read(jar, "comments", id, commentSearchParams(), storedCommentSchema);
}

/** The audit log's entries for one record, newest first. */
async function audited(targetId: string) {
  const { docs } = await payload.find({
    collection: "audit-log",
    where: { targetId: { equals: targetId } },
    sort: "-createdAt",
    overrideAccess: true,
  });
  return docs.map((entry) => entry.action);
}

const visible: CommentValues = {
  status: "visible",
  moderationReason: "",
  moderationNote: "",
  locked: false,
};

beforeAll(async () => {
  payload = await getPayload({ config });
  stopEmailWorker = startEmailWorker();
  admin = await staffProfile(payload, "admin-moderation-admin", "admin");
  moderator = await staffProfile(
    payload,
    "admin-moderation-moderator",
    "moderator",
  );
  author = await staffProfile(payload, "admin-moderation-author", "member");
  reporter = await staffProfile(payload, "admin-moderation-reporter", "member");
  [adminJar, moderatorJar] = await Promise.all([
    signInAsVerifiedStaff(testEmail("admin-moderation-admin")),
    signInAsVerifiedStaff(testEmail("admin-moderation-moderator")),
  ]);
  const draft = await payload.create({
    collection: "topics",
    data: {
      title: "TEST topic for the admin's moderation editors",
      slug: "",
      summary: "A made-up topic.",
      body: richText("Made-up text."),
      countries: [await countryId(payload, "LU")],
    } as RequiredDataFromCollectionSlug<"topics">,
    draft: true,
    user: admin,
    overrideAccess: false,
  });
  topic = await payload.update({
    collection: "topics",
    id: draft.id,
    data: { _status: "published" },
    user: admin,
    overrideAccess: false,
  });
});

// Each test saves more often than the staff write limit allows a person.
beforeEach(clearRateLimits);

afterAll(async () => {
  await stopEmailWorker?.();
  await payload?.destroy();
});

describe("a comment", () => {
  it("is read as its editor reads it: what was written, and where", async () => {
    const thread = await comment("TEST thread for the editor.");
    const reply = await comment("TEST reply for the editor.", thread.id);
    const stored = await readComment(moderatorJar, reply.id);
    const editor = editorComment(stored);
    expect(editor.values).toEqual(visible);
    expect(editor.status).toMatchObject({
      body: "TEST reply for the editor.",
      topic: { id: topic.id, title: topic.title },
      parent: { id: thread.id, title: "TEST thread for the editor." },
      score: 0,
      savedStatus: "visible",
    });
    expect(commentTopicSlug(stored)).toBe(topic.slug);
    // Moderators may not read members' accounts; admins may.
    expect(editor.status.author).toEqual({ id: author.id, title: null });
    expect(
      editorComment(await readComment(adminJar, reply.id)).status.author,
    ).toEqual({ id: author.id, title: author.email });
  });

  it("is hidden with a reason, which acts on its reports and tells its author", async () => {
    const hidden = await comment("TEST advert to hide.");
    const open = await report(hidden.id);
    const refused = await placed(
      await moderate(moderatorJar, hidden.id, { ...visible, status: "hidden" }),
      commentFieldOf,
    );
    expect(refused).toEqual({
      moderationReason: ["Choose why the comment is hidden."],
    });
    const doc = editorComment(
      await saved(
        await moderate(moderatorJar, hidden.id, {
          ...visible,
          status: "hidden",
          moderationReason: "spam",
          moderationNote: "TEST note for staff.",
        }),
        storedCommentSchema,
      ),
    );
    expect(doc.values).toEqual({
      status: "hidden",
      moderationReason: "spam",
      moderationNote: "TEST note for staff.",
      locked: false,
    });
    expect(doc.status.moderatedBy?.id).toBe(moderator.id);
    expect(doc.status.moderatedAt).toBeTruthy();
    // Its page lists its reports, now acted on.
    const reports = commentReportsSchema.parse(
      await (
        await payloadRest(
          "GET",
          ["comment-reports"],
          moderatorJar,
          undefined,
          undefined,
          `?${commentReportsSearchParams(hidden.id)}`,
        )
      ).json(),
    );
    expect(reports.docs).toEqual([
      expect.objectContaining({ id: open.id, status: "actioned" }),
    ]);
    const { totalDocs } = await payload.count({
      collection: "notifications",
      where: {
        and: [
          { recipient: { equals: author.id } },
          { comment: { equals: hidden.id } },
          { kind: { equals: "comment-hidden" } },
        ],
      },
      overrideAccess: true,
    });
    expect(totalDocs).toBe(1);
    // Shown again, it loses its reason.
    const shown = editorComment(
      await saved(
        await moderate(moderatorJar, hidden.id, {
          ...doc.values,
          status: "visible",
        }),
        storedCommentSchema,
      ),
    );
    expect(shown.values.moderationReason).toBe("");
    expect(await audited(hidden.id)).toEqual(
      expect.arrayContaining(["comment.hidden", "comment.shown"]),
    );
  });

  it("is removed by admins only, which erases its text for good", async () => {
    const unlawful = await comment("TEST text the law says must go.");
    const removal = {
      ...visible,
      status: "removed",
      moderationReason: "abuse",
    } as const;
    expect(
      await placed(
        await moderate(moderatorJar, unlawful.id, removal),
        commentFieldOf,
      ),
    ).toEqual({
      status: ["Only admins can remove a comment. Hide it instead."],
    });
    const removed = editorComment(
      await saved(
        await moderate(adminJar, unlawful.id, removal),
        storedCommentSchema,
      ),
    );
    expect(removed.status).toMatchObject({ body: "", savedStatus: "removed" });
    expect(
      await placed(
        await moderate(adminJar, unlawful.id, {
          ...removal,
          status: "visible",
        }),
        commentFieldOf,
      ),
    ).toEqual({
      status: [
        "A removed comment's text is gone, so it cannot be shown again.",
      ],
    });
  });

  it("is locked only when it starts a thread", async () => {
    const thread = await comment("TEST thread to lock.");
    const reply = await comment("TEST reply in it.", thread.id);
    expect(
      await placed(
        await moderate(moderatorJar, reply.id, { ...visible, locked: true }),
        commentFieldOf,
      ),
    ).toEqual({
      locked: ["Only a comment that starts a thread can be locked."],
    });
    const locked = editorComment(
      await saved(
        await moderate(moderatorJar, thread.id, { ...visible, locked: true }),
        storedCommentSchema,
      ),
    );
    expect(locked.values.locked).toBe(true);
    expect(await audited(thread.id)).toContain("comment.locked");
  });

  it("is never changed in what was written, nor made through the API", async () => {
    const written = await comment("TEST words that stay.");
    await saved(
      await save(
        adminJar,
        "comments",
        written.id,
        { ...commentSaveBody(visible), body: "TEST changed", score: 99 },
        commentSearchParams(),
      ),
      storedCommentSchema,
    );
    expect(
      editorComment(await readComment(adminJar, written.id)).status,
    ).toMatchObject({
      body: "TEST words that stay.",
      score: 0,
    });
    expect(
      (
        await save(
          adminJar,
          "comments",
          null,
          { topic: topic.id, body: "TEST" },
          commentSearchParams(),
        )
      ).status,
    ).toBe(403);
  });
});

describe("a report", () => {
  it("is read with its comment, and dismissed with who and when", async () => {
    const reported = await comment("TEST comment someone reported.");
    const sent = await report(reported.id);
    const editor = editorReport(
      await read(
        moderatorJar,
        "comment-reports",
        sent.id,
        reportSearchParams(),
        storedReportSchema,
      ),
    );
    expect(editor.values).toEqual({ status: "open" });
    expect(editor.status).toMatchObject({
      comment: { id: reported.id, title: "TEST comment someone reported." },
      reporter: { id: reporter.id, title: null },
      reason: "spam",
      resolvedBy: null,
    });
    const dismissed = editorReport(
      await saved(
        await save(
          moderatorJar,
          "comment-reports",
          sent.id,
          reportSaveBody({ status: "dismissed" }),
          reportSearchParams(),
        ),
        storedReportSchema,
      ),
    );
    expect(dismissed.values.status).toBe("dismissed");
    expect(dismissed.status.resolvedBy?.id).toBe(moderator.id);
    expect(dismissed.status.resolvedAt).toBeTruthy();
    expect(await audited(sent.id)).toContain("comment-report.updated");
  });

  it("is refused a status it cannot have, on its status", async () => {
    const sent = await report((await comment("TEST another reported.")).id);
    expect(
      await placed(
        await save(
          moderatorJar,
          "comment-reports",
          sent.id,
          { status: "closed" },
          reportSearchParams(),
        ),
        reportFieldOf,
      ),
    ).toEqual({ status: [expect.any(String)] });
  });
});

describe("feedback", () => {
  it("is read as sent, and marked done", async () => {
    const sent = await payload.create({
      collection: "feedback",
      data: {
        author: author.id,
        kind: "idea",
        message: "TEST idea for the site.",
        page: "/topics",
        status: "new",
      },
      overrideAccess: true,
    });
    const editor = editorFeedback(
      await read(
        moderatorJar,
        "feedback",
        sent.id,
        feedbackSearchParams(),
        storedFeedbackSchema,
      ),
    );
    expect(editor.values).toEqual({ status: "new" });
    expect(editor.status).toMatchObject({
      kind: "idea",
      message: "TEST idea for the site.",
      page: "/topics",
    });
    const done = editorFeedback(
      await saved(
        await save(
          moderatorJar,
          "feedback",
          sent.id,
          feedbackSaveBody({ status: "done" }),
          feedbackSearchParams(),
        ),
        storedFeedbackSchema,
      ),
    );
    expect(done.values.status).toBe("done");
    expect(
      await placed(
        await save(
          moderatorJar,
          "feedback",
          sent.id,
          { status: "archived" },
          feedbackSearchParams(),
        ),
        feedbackFieldOf,
      ),
    ).toEqual({ status: [expect.any(String)] });
  });
});

describe("an invitation", () => {
  const saveInvitation = (
    jar: CookieJar,
    id: string | null,
    values: InvitationValues,
  ) =>
    save(
      jar,
      "invitations",
      id,
      invitationSaveBody(values),
      invitationSearchParams(),
    );

  it("is made, read back as its editor reads it, changed, and deleted", async () => {
    const values: InvitationValues = {
      email: ` ${testEmail("Admin-Moderation-Invited").toUpperCase()} `,
      role: "moderator",
      note: "TEST note about who they are.",
    };
    const made = editorInvitation(
      await saved(
        await saveInvitation(adminJar, null, values),
        storedInvitationSchema,
      ),
    );
    expect(made.values).toEqual({
      ...values,
      email: testEmail("admin-moderation-invited").toLowerCase(),
    });
    expect(made.status).toMatchObject({
      invitedBy: { id: admin.id, title: admin.email },
      acceptedAt: null,
    });
    const changed = editorInvitation(
      await saved(
        await saveInvitation(adminJar, made.id, {
          ...made.values,
          role: "member",
        }),
        storedInvitationSchema,
      ),
    );
    expect(changed.values.role).toBe("member");
    expect(
      editorInvitation(
        await read(
          adminJar,
          "invitations",
          made.id,
          invitationSearchParams(),
          storedInvitationSchema,
        ),
      ),
    ).toEqual(changed);
    expect(await audited(made.id)).toEqual(
      expect.arrayContaining(["invitation.created", "invitation.updated"]),
    );
    expect(
      (await payloadRest("DELETE", ["invitations", made.id], adminJar)).status,
    ).toBe(200);
  });

  it("is refused on each field its editor shows", async () => {
    expect(
      Object.keys(
        await placed(
          await saveInvitation(adminJar, null, EMPTY_INVITATION),
          invitationFieldOf,
        ),
      ),
    ).toEqual(["email"]);
    expect(
      Object.keys(
        await placed(
          await saveInvitation(adminJar, null, {
            ...EMPTY_INVITATION,
            email: "not an address",
          }),
          invitationFieldOf,
        ),
      ),
    ).toEqual(["email"]);
    const email = testEmail("admin-moderation-twice");
    await saved(
      await saveInvitation(adminJar, null, { ...EMPTY_INVITATION, email }),
      storedInvitationSchema,
    );
    expect(
      Object.keys(
        await placed(
          await saveInvitation(adminJar, null, { ...EMPTY_INVITATION, email }),
          invitationFieldOf,
        ),
      ),
    ).toEqual(["email"]);
  });

  it("is admins' only", async () => {
    expect(
      (
        await saveInvitation(moderatorJar, null, {
          ...EMPTY_INVITATION,
          email: testEmail("admin-moderation-refused"),
        })
      ).status,
    ).toBe(403);
  });
});

describe("an account", () => {
  it("is read as its editor reads it, and its names and role changed and audited", async () => {
    const member = await staffProfile(
      payload,
      "admin-moderation-member",
      "member",
    );
    const editor = editorUser(
      await read(
        adminJar,
        "users",
        member.id,
        userSearchParams(),
        storedUserSchema,
      ),
    );
    expect(editor.values).toEqual({
      name: "",
      displayName: "",
      role: "member",
    });
    expect(editor.status.email).toBe(member.email);
    const changed = editorUser(
      await saved(
        await save(
          adminJar,
          "users",
          member.id,
          userSaveBody({
            name: "TEST Member",
            displayName: "TEST Writer",
            role: "moderator",
          }),
          userSearchParams(),
        ),
        storedUserSchema,
      ),
    );
    expect(changed.values).toEqual({
      name: "TEST Member",
      displayName: "TEST Writer",
      role: "moderator",
    });
    expect(await audited(member.id)).toContain("user.role_changed");
  });

  it("is refused a public name that is not one, on that field", async () => {
    const member = await staffProfile(
      payload,
      "admin-moderation-named",
      "member",
    );
    expect(
      Object.keys(
        await placed(
          await save(
            adminJar,
            "users",
            member.id,
            userSaveBody({ name: "", displayName: "Admin", role: "member" }),
            userSearchParams(),
          ),
          userFieldOf,
        ),
      ),
    ).toEqual(["displayName"]);
  });

  it("is deleted by another admin, never by its own staff member", async () => {
    const own = await payloadRest("DELETE", ["users", admin.id], adminJar);
    expect(own.status).toBe(403);
    const refused = payloadRefusal(403, await own.json(), userFieldOf);
    expect(refused).toEqual({
      fields: {},
      general: [
        "Staff accounts are deleted by an admin. Ask another admin to delete yours.",
      ],
    });
    const member = await staffProfile(
      payload,
      "admin-moderation-gone",
      "member",
    );
    expect(
      (await payloadRest("DELETE", ["users", member.id], adminJar)).status,
    ).toBe(200);
  });

  it("is read by staff only when it is their own, and changed only by admins", async () => {
    await read(
      moderatorJar,
      "users",
      moderator.id,
      userSearchParams(),
      storedUserSchema,
    );
    expect(
      (
        await payloadRest(
          "GET",
          ["users", author.id],
          moderatorJar,
          undefined,
          undefined,
          `?${userSearchParams()}`,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await save(
          moderatorJar,
          "users",
          moderator.id,
          userSaveBody({ name: "", displayName: "", role: "admin" }),
          userSearchParams(),
        )
      ).status,
    ).toBe(403);
  });
});

describe("the audit log", () => {
  it("is read by admins as its page reads it, and by nobody else", async () => {
    const [entry] = (
      await payload.find({
        collection: "audit-log",
        where: { actor: { equals: admin.id } },
        limit: 1,
        overrideAccess: true,
      })
    ).docs;
    if (!entry) throw new Error("No audit entry by the test admin");
    const read_ = await read(
      adminJar,
      "audit-log",
      entry.id,
      auditEntrySearchParams(),
      storedAuditEntrySchema,
    );
    expect(read_).toMatchObject({
      action: entry.action,
      actor: { id: admin.id, email: admin.email },
      targetId: entry.targetId,
    });
    expect(
      (
        await payloadRest(
          "GET",
          ["audit-log", entry.id],
          moderatorJar,
          undefined,
          undefined,
          `?${auditEntrySearchParams()}`,
        )
      ).status,
    ).toBe(403);
    expect(
      (await payloadRest("DELETE", ["audit-log", entry.id], adminJar)).status,
    ).toBe(403);
  });
});
