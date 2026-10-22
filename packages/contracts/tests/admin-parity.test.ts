import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ADMIN_BULK,
  bulkActions,
  bulkBody,
  bulkOutcome,
  bulkSearchParams,
  documentLockSearchParams,
  duplicateSearchParams,
  focalCoordinate,
  isRecordId,
  listColumns,
  LOCK_DURATION_S,
  LOCKED_MESSAGE,
  lockHolder,
  lockIsFresh,
  mediaFieldOf,
  payloadRefusal,
  PREVIEW_PATHS,
  readListPreference,
  restoreSearchParams,
  type StoredLock,
  topicSaveSearchParams,
} from "../src/index.ts";

// The admin's parity with Payload's panel (ADR 0014, phase 11). The
// backend's integration test (apps/api/tests/int/admin-parity.test.ts)
// sends these requests; these check the parts it cannot see.

const ID = "0190f5b1-0000-7000-8000-000000000001";
const OTHER = "0190f5b1-0000-7000-8000-000000000002";

function topicAction(id: string) {
  const action = ADMIN_BULK.topics?.find((each) => each.id === id);
  assert.ok(action, id);
  return action;
}

describe("a bulk action", () => {
  it("names its records, narrowed to its scope, at depth 0 and whole", () => {
    const params = bulkSearchParams(topicAction("archive"), {
      kind: "ids",
      ids: [ID, OTHER],
    });
    assert.equal(params.get("depth"), "0");
    assert.equal(params.get("draft"), "true");
    assert.equal(params.get("where[and][0][id][in][0]"), ID);
    assert.equal(params.get("where[and][0][id][in][1]"), OTHER);
    assert.equal(params.get("where[and][1][firstPublishedAt][exists]"), "true");
    // The hooks after each change are given the record as selected.
    assert.equal(
      [...params.keys()].some((key) => key.startsWith("select")),
      false,
    );
    assert.equal(params.get("limit"), null);
  });

  it("over every match is held to a limit", () => {
    const params = bulkSearchParams(topicAction("ready"), {
      kind: "matching",
      where: { and: [{ title: { like: "TEST" } }] },
    });
    assert.equal(params.get("limit"), "1000");
    assert.equal(params.get("where[and][0][and][0][title][like]"), "TEST");
  });

  it("sends what it asks for, and only that", () => {
    assert.deepEqual(
      bulkBody(topicAction("publish"), { changeNote: "  A note.  " }),
      { _status: "published", changeNote: "A note." },
    );
    assert.deepEqual(bulkBody(topicAction("publish"), { changeNote: " " }), {
      _status: "published",
    });
    const hide = ADMIN_BULK.comments?.find((each) => each.id === "hide");
    assert.ok(hide);
    assert.deepEqual(bulkBody(hide, { moderationReason: "spam" }), {
      status: "hidden",
      moderationReason: "spam",
    });
    assert.deepEqual(bulkBody(hide, {}), {
      status: "hidden",
      moderationReason: null,
    });
  });

  it("says what became of each record", () => {
    const outcome = bulkOutcome(
      {
        docs: [{ id: ID }],
        errors: [
          {
            id: OTHER,
            message: `Document with ID ${OTHER} is currently locked by another user and cannot be modified.`,
          },
        ],
      },
      [ID, OTHER, "0190f5b1-0000-7000-8000-000000000003"],
    );
    assert.deepEqual(outcome, {
      done: [ID],
      refused: [{ id: OTHER, message: LOCKED_MESSAGE }],
      skipped: ["0190f5b1-0000-7000-8000-000000000003"],
    });
  });

  it("is offered as the access rules allow", () => {
    assert.deepEqual(bulkActions("references", "member"), []);
    assert.deepEqual(bulkActions("references", "moderator"), []);
    assert.deepEqual(
      bulkActions("references", "admin").map((action) => action.id),
      ["delete"],
    );
    assert.deepEqual(
      bulkActions("comment-reports", "moderator").map((action) => action.id),
      ["dismiss", "reopen"],
    );
    assert.deepEqual(bulkActions("audit-log", "admin"), []);
  });
});

describe("a list's settings", () => {
  it("keep only columns the list can show, in its order", () => {
    assert.deepEqual(listColumns("topics", ["tags", "title", "nope"]), [
      "title",
      "tags",
    ]);
    // The list's own columns, in any order, are no choice at all.
    assert.equal(
      listColumns("topics", ["updatedAt", "title", "countries", "state"]),
      null,
    );
    assert.equal(listColumns("topics", ["nope"]), null);
    assert.equal(listColumns("topics", null), null);
  });

  it("are read whatever was stored", () => {
    assert.deepEqual(readListPreference("topics", null), {
      query: "",
      columns: null,
    });
    assert.deepEqual(readListPreference("topics", "not an object"), {
      query: "",
      columns: null,
    });
    assert.deepEqual(
      readListPreference("topics", { query: 7, columns: "title" }),
      { query: "", columns: null },
    );
    assert.deepEqual(
      readListPreference("topics", {
        query: "x".repeat(3_000),
        columns: ["summary", "title"],
      }),
      { query: "", columns: ["title", "summary"] },
    );
  });
});

describe("a document lock", () => {
  const lock = (updatedAt: string, user: StoredLock["user"]): StoredLock => ({
    id: ID,
    document: { relationTo: "topics", value: OTHER },
    user,
    updatedAt,
  });

  it("holds for its duration by the backend's clock", () => {
    const now = new Date("2026-10-22T12:00:00.000Z");
    const at = (secondsAgo: number) =>
      new Date(now.getTime() - secondsAgo * 1_000).toISOString();
    const user = { relationTo: "users", value: ID };
    assert.equal(lockIsFresh(lock(at(LOCK_DURATION_S), user), now), true);
    assert.equal(lockIsFresh(lock(at(LOCK_DURATION_S + 1), user), now), false);
    assert.equal(lockIsFresh(lock("not a date", user), now), false);
  });

  it("names its holder, by address when the reader may see it", () => {
    const at = "2026-10-22T12:00:00.000Z";
    assert.deepEqual(lockHolder(lock(at, { relationTo: "users", value: ID })), {
      id: ID,
      email: null,
    });
    assert.deepEqual(
      lockHolder(
        lock(at, {
          relationTo: "users",
          value: { id: ID, email: "a@example.test" },
        }),
      ),
      { id: ID, email: "a@example.test" },
    );
    assert.equal(lockHolder(lock(at, null)), null);
  });

  it("is found by its document", () => {
    const params = documentLockSearchParams("topics", ID);
    assert.equal(
      params.get("where[and][0][document.relationTo][equals]"),
      "topics",
    );
    assert.equal(params.get("where[and][1][document.value][equals]"), ID);
    assert.equal(params.get("sort"), "-updatedAt");
  });

  it("makes Payload's refusal plain", () => {
    assert.deepEqual(
      payloadRefusal(423, { errors: [] }, () => null),
      {
        fields: {},
        general: [LOCKED_MESSAGE],
      },
    );
  });
});

describe("the rest of the panel's parity", () => {
  it("previews drafts by id only", () => {
    assert.equal(PREVIEW_PATHS.topic(ID), `/api/v1/previews/topics/${ID}`);
    assert.throws(() => PREVIEW_PATHS.topic("../pages/home"));
    assert.equal(isRecordId(ID.toUpperCase()), true);
    assert.equal(isRecordId(`${ID}x`), false);
  });

  it("autosaves only drafts", () => {
    assert.equal(
      topicSaveSearchParams(false, { autosave: true }).toString(),
      "depth=0&draft=true&autosave=true",
    );
    assert.equal(
      topicSaveSearchParams(true, { autosave: true }).toString(),
      "depth=0",
    );
  });

  it("restores and duplicates whole records", () => {
    assert.equal(
      restoreSearchParams("topics").toString(),
      "depth=0&draft=true",
    );
    assert.equal(restoreSearchParams("references").toString(), "depth=0");
    assert.equal(duplicateSearchParams().toString(), "depth=0");
  });

  it("keeps a focal point inside the image, as one field", () => {
    assert.equal(focalCoordinate(-4), 0);
    assert.equal(focalCoordinate(33.6), 34);
    assert.equal(focalCoordinate(140), 100);
    assert.equal(mediaFieldOf("focalX"), "focalX");
    assert.equal(mediaFieldOf("focalY"), "focalX");
  });
});
