import {
  ADMIN_COLLECTIONS,
  ADMIN_LISTS,
  type AdminCollection,
  type AdminCondition,
  adminListSearchParams,
  adminPageSchema,
  adminRelatedSearchParams,
  adminRowSchema,
} from "@countrytopics/contracts";
import config from "@payload-config";
import {
  type FlattenedField,
  getPayload,
  type Payload,
  type RequiredDataFromCollectionSlug,
} from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as z from "zod";

import { verifiedAdminsOnly } from "@/access";

import { file, PNG_BYTES, richText } from "./fixtures";
import {
  CookieJar,
  countryId,
  payloadRest,
  signInAsVerifiedStaff,
  staffProfile,
  startEmailWorker,
  testEmail,
} from "./helpers";

// The admin's lists (packages/contracts, admin-lists.ts) against the
// backend: every field they read is a field of the collection, of the kind
// they expect, and every list the admin asks for, with its search and each
// filter, is answered by Payload's REST API in the shape they parse.

let payload: Payload;
let admin: CookieJar;
let moderator: CookieJar;
let stopEmailWorker: () => Promise<void>;

/** A collection's fields as Payload's panel shows them, rows and tabs flattened. */
function fieldsOf(collection: AdminCollection): Map<string, FlattenedField> {
  const fields = payload.collections[collection].config.flattenedFields;
  return new Map(fields.map((field) => [field.name, field]));
}

async function list(
  jar: CookieJar,
  collection: AdminCollection,
  search: URLSearchParams,
): Promise<Response> {
  return payloadRest(
    "GET",
    [collection],
    jar,
    undefined,
    undefined,
    `?${search}`,
  );
}

const PAYLOAD_ADDS = new Set(["_status", "collection"]);

const Ids = z.object({ docs: z.array(z.object({ id: z.string() })) });

beforeAll(async () => {
  payload = await getPayload({ config });
  stopEmailWorker = startEmailWorker();
  const adminProfile = await staffProfile(
    payload,
    "admin-lists-admin",
    "admin",
  );
  await staffProfile(payload, "admin-lists-moderator", "moderator");
  [admin, moderator] = await Promise.all([
    signInAsVerifiedStaff(testEmail("admin-lists-admin")),
    signInAsVerifiedStaff(testEmail("admin-lists-moderator")),
  ]);

  // At least one record of each kind the lists relate to.
  const asAdmin = { user: adminProfile, overrideAccess: false } as const;
  const category = await payload.create({
    collection: "categories",
    data: { name: "TEST admin lists category", slug: "" },
    ...asAdmin,
  });
  const tag = await payload.create({
    collection: "tags",
    data: { name: "TEST admin lists tag", slug: "" },
    ...asAdmin,
  });
  const topic = await payload.create({
    collection: "topics",
    data: {
      title: "TEST admin lists topic",
      summary: "TEST summary for the admin's lists.",
      body: richText("TEST body for the admin's lists."),
      countries: [await countryId(payload, "GH")],
      category: category.id,
      tags: [tag.id],
      changeNote: "TEST first publication for the admin's lists.",
      slug: "",
      _status: "published",
    } as RequiredDataFromCollectionSlug<"topics">,
    ...asAdmin,
  });
  const comment = await payload.create({
    collection: "comments",
    data: {
      topic: topic.id,
      author: adminProfile.id,
      body: "TEST comment for the admin's lists.",
      score: 0,
      status: "visible",
    },
    overrideAccess: true,
  });
  await payload.create({
    collection: "comment-reports",
    data: {
      comment: comment.id,
      reporter: adminProfile.id,
      reason: "spam",
      status: "open",
    },
    overrideAccess: true,
  });
  await payload.create({
    collection: "feedback",
    data: {
      author: adminProfile.id,
      kind: "idea",
      message: "TEST feedback for the admin's lists.",
      page: "/topics",
      status: "new",
    },
    overrideAccess: true,
  });
  await payload.create({
    collection: "invitations",
    data: { email: testEmail("admin-lists-invited"), role: "member" },
    ...asAdmin,
  });
  const person = await payload.create({
    collection: "individuals",
    data: { name: "TEST Admin Lists Person", summary: "TEST person", slug: "" },
    ...asAdmin,
  });
  await payload.create({
    collection: "references",
    data: {
      title: "TEST admin lists reference",
      kind: "report",
      url: "https://example.test/admin-lists-report",
      checkStatus: "pending",
    },
    ...asAdmin,
  });
  await payload.create({
    collection: "media",
    data: { alt: "TEST admin lists image", licence: "own_work" },
    file: file("admin-lists.png", "image/png", PNG_BYTES),
    ...asAdmin,
  });
  await payload.create({
    collection: "snippets",
    data: {
      caption: "TEST admin lists snippet",
      youtubeId: "TESTlists01",
      startS: 1,
      endS: 5,
      language: "en",
      transcriptTimebase: "video",
      speaker: person.id,
    },
    ...asAdmin,
  });
  await payload.create({
    collection: "link-archives",
    data: {
      url: "https://example.test/admin-lists",
      status: "not_archived",
      checkedAt: new Date().toISOString(),
    },
    overrideAccess: true,
  });
});

afterAll(() => stopEmailWorker());

describe("the admin's list definitions", () => {
  it("cover the collections Payload's panel lists, in its order", () => {
    const shown = payload.config.collections
      .filter((collection) => !collection.admin.hidden)
      .map((collection) => collection.slug);
    expect([...ADMIN_COLLECTIONS]).toEqual(shown);
  });

  it.each([...ADMIN_COLLECTIONS])(
    "name %s's fields as the backend stores them",
    (collection) => {
      const definition = ADMIN_LISTS[collection];
      const {
        admin: panel,
        access,
        upload,
      } = payload.collections[collection].config;
      const fields = fieldsOf(collection);
      expect(definition.title).toBe(panel.useAsTitle);
      for (const name of [...definition.columns, ...definition.search]) {
        expect(definition.fields[name], name).toBeDefined();
      }
      for (const name of panel.listSearchableFields ?? []) {
        expect(definition.search, name).toContain(name);
      }
      expect(definition.readers).toBe(
        access.read === verifiedAdminsOnly ? "admins" : "staff",
      );
      for (const [name, expected] of Object.entries(definition.fields)) {
        const field = fields.get(name);
        expect(field, `${collection}.${name}`).toBeDefined();
        if (!field) continue;
        const label = `${collection}.${name} (${field.type})`;
        switch (expected.kind) {
          case "text":
            expect(["text", "textarea", "email"], label).toContain(field.type);
            break;
          case "number":
          case "date":
            expect(field.type, label).toBe(expected.kind);
            break;
          case "boolean":
            expect(field.type, label).toBe("checkbox");
            break;
          case "select":
            if (name === "mimeType" && upload) {
              const types = typeof upload === "object" ? upload.mimeTypes : [];
              expect([...expected.values], label).toEqual(types);
            } else {
              expect(["select", "radio"], label).toContain(field.type);
              const values =
                "options" in field
                  ? field.options.map((option) =>
                      typeof option === "string" ? option : option.value,
                    )
                  : [];
              expect([...expected.values], label).toEqual(values);
            }
            break;
          case "relationship":
            expect(["relationship", "upload"], label).toContain(field.type);
            expect("relationTo" in field ? field.relationTo : null, label).toBe(
              expected.to,
            );
            expect(
              "hasMany" in field ? Boolean(field.hasMany) : false,
              label,
            ).toBe(Boolean(expected.hasMany));
            break;
        }
      }
    },
  );
});

/** A value each filter can be tried with, on a list of `collection`. */
function sampleConditions(collection: AdminCollection): AdminCondition[] {
  const { fields, filters } = ADMIN_LISTS[collection];
  return Object.entries(filters).map(([name, kind]): AdminCondition => {
    const field = fields[name];
    switch (kind) {
      case "equals":
        return field?.kind === "select"
          ? { field: name, equals: field.values[0] ?? "" }
          : { field: name, equals: false };
      case "contains":
        return { field: name, like: "TEST" };
      case "related":
        return { field: name, in: ["01a10000-0000-7000-8000-000000000000"] };
      case "dates":
        return {
          field: name,
          from: "2000-01-01T00:00:00.000Z",
          to: "2100-01-01T23:59:59.999Z",
        };
      case "exists":
        return { field: name, exists: true };
    }
  });
}

describe("the admin's lists, through Payload's REST API", () => {
  it.each([...ADMIN_COLLECTIONS])(
    "answer %s in the shape the admin reads, each filter included",
    async (collection) => {
      const definition = ADMIN_LISTS[collection];
      const row = adminRowSchema(collection);
      const page = adminPageSchema(row);
      const plain = await list(
        admin,
        collection,
        adminListSearchParams(collection, {
          conditions: [],
          sort: definition.defaultSort,
          page: 1,
          limit: 100,
        }),
      );
      expect(plain.status).toBe(200);
      const answer = page.parse(await plain.json());
      expect(answer.docs.length).toBeGreaterThan(0);
      const allowed = new Set([
        "id",
        definition.title,
        ...definition.columns,
        ...(definition.extra ?? []),
      ]);
      for (const doc of answer.docs) {
        // Only what was asked for, and what Payload always adds: `_status`
        // where drafts are on, `collection` on accounts.
        const extra = Object.keys(doc).filter(
          (key) => !allowed.has(key) && !PAYLOAD_ADDS.has(key),
        );
        expect(extra, collection).toEqual([]);
      }

      const filtered = await list(
        admin,
        collection,
        adminListSearchParams(collection, {
          search: "TEST",
          conditions: sampleConditions(collection),
          sort: definition.columns
            .map((name) => `-${name}`)
            .slice(0, 1)
            .join(),
          page: 1,
          limit: 5,
        }),
      );
      expect(filtered.status, await filtered.clone().text()).toBe(200);
      page.parse(await filtered.json());
    },
  );

  it("find related records by their title, for a related filter", async () => {
    const answer = await list(
      admin,
      "topics",
      adminRelatedSearchParams("topics", "admin lists"),
    );
    expect(answer.status).toBe(200);
    const { docs } = Ids.parse(await answer.json());
    expect(docs.length).toBeGreaterThan(0);
  });

  it("give related records' titles, so a list can name them", async () => {
    const answer = await list(
      admin,
      "comments",
      adminListSearchParams("comments", {
        search: "admin's lists",
        conditions: [],
        sort: "-createdAt",
        page: 1,
        limit: 5,
      }),
    );
    const { docs } = adminPageSchema(adminRowSchema("comments")).parse(
      await answer.json(),
    );
    expect(docs[0]?.topic).toMatchObject({ title: "TEST admin lists topic" });
    expect(docs[0]?.author).toMatchObject({
      email: testEmail("admin-lists-admin"),
    });
  });

  it("refuse admins' lists to moderators, and show them only their own account", async () => {
    for (const collection of ADMIN_COLLECTIONS) {
      if (ADMIN_LISTS[collection].readers !== "admins") continue;
      const answer = await list(
        moderator,
        collection,
        adminListSearchParams(collection, {
          conditions: [],
          sort: ADMIN_LISTS[collection].defaultSort,
          page: 1,
          limit: 5,
        }),
      );
      expect(answer.status, collection).toBe(403);
    }
    const users = await list(
      moderator,
      "users",
      adminListSearchParams("users", {
        conditions: [],
        sort: "-createdAt",
        page: 1,
        limit: 100,
      }),
    );
    const { docs } = adminPageSchema(adminRowSchema("users")).parse(
      await users.json(),
    );
    expect(docs.map((doc) => doc.email)).toEqual([
      testEmail("admin-lists-moderator"),
    ]);
  });
});
