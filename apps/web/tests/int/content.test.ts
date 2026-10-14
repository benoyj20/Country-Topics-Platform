import config from "@payload-config";
import {
  getPayload,
  type Payload,
  type RequiredDataFromCollectionSlug,
} from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as z from "zod";

import type { User } from "@/payload-types";

import {
  payloadRest,
  signInAsVerifiedStaff,
  signInWithEmailLink,
  startEmailWorker,
  testEmail,
  UUID_V7_PATTERN,
} from "./helpers";

// Every person named here is made up for the tests.
let payload: Payload;
let stopEmailWorker: (() => Promise<void>) | undefined;
let admin: User;
let moderator: User;
let member: User;
let unverifiedAdmin: User;
let kenya: string;
let ghana: string;

/** A staff or member profile, as the sign-in strategy would hand it to Payload. */
async function profile(
  name: string,
  role: User["role"],
  verified = true,
): Promise<User> {
  const created = await payload.create({
    collection: "users",
    data: { email: testEmail(name), role },
    overrideAccess: true,
  });
  return {
    ...created,
    collection: "users",
    twoFactorEnabled: verified,
    twoFactorVerifiedAt: verified ? new Date().toISOString() : null,
  };
}

async function countryId(code: string): Promise<string> {
  const { docs } = await payload.find({
    collection: "countries",
    where: { code: { equals: code } },
    overrideAccess: true,
  });
  if (!docs[0]) throw new Error(`Country ${code} is not seeded`);
  return docs[0].id;
}

async function auditEntries(action: string, targetId: string) {
  const { docs } = await payload.find({
    collection: "audit-log",
    where: { action: { equals: action }, targetId: { equals: targetId } },
    overrideAccess: true,
  });
  return docs;
}

// The slug is filled by a hook, so the generated types' required slug is
// left out on purpose.
type IndividualInput = RequiredDataFromCollectionSlug<"individuals">;
function individualData(
  data: Omit<IndividualInput, "slug"> & { slug?: string },
): IndividualInput {
  return data as IndividualInput;
}

function createIndividual(data: Parameters<typeof individualData>[0]) {
  return payload.create({
    collection: "individuals",
    data: individualData(data),
    user: admin,
    overrideAccess: false,
  });
}

function duplicateError(name: string) {
  return {
    data: {
      errors: [
        expect.objectContaining({
          path: "notADuplicate",
          message: expect.stringContaining(name),
        }),
      ],
    },
  };
}

beforeAll(async () => {
  payload = await getPayload({ config });
  stopEmailWorker = startEmailWorker();
  admin = await profile("content-admin", "admin");
  moderator = await profile("content-moderator", "moderator");
  member = await profile("content-member", "member");
  unverifiedAdmin = await profile("content-unverified", "admin", false);
  kenya = await countryId("KE");
  ghana = await countryId("GH");
});

afterAll(async () => {
  await stopEmailWorker?.();
  await payload?.destroy();
});

describe("countries", () => {
  it("are seeded from ISO 3166-1 with UN M49 regions", async () => {
    const { totalDocs } = await payload.count({
      collection: "countries",
      overrideAccess: true,
    });
    expect(totalDocs).toBe(249);

    const { docs } = await payload.find({
      collection: "countries",
      where: { code: { in: ["KE", "BO", "AQ", "TW"] } },
      sort: "code",
      overrideAccess: true,
    });
    expect(
      docs.map(
        ({ code, alpha3, numericCode, name, isoName, region, slug }) => ({
          code,
          alpha3,
          numericCode,
          name,
          isoName,
          region: region ?? null,
          slug,
        }),
      ),
    ).toEqual([
      {
        code: "AQ",
        alpha3: "ATA",
        numericCode: "010",
        name: "Antarctica",
        isoName: "Antarctica",
        region: null,
        slug: "antarctica",
      },
      {
        code: "BO",
        alpha3: "BOL",
        numericCode: "068",
        name: "Bolivia",
        isoName: "Bolivia, Plurinational State of",
        region: "Americas",
        slug: "bolivia",
      },
      {
        code: "KE",
        alpha3: "KEN",
        numericCode: "404",
        name: "Kenya",
        isoName: "Kenya",
        region: "Africa",
        slug: "kenya",
      },
      {
        code: "TW",
        alpha3: "TWN",
        numericCode: "158",
        name: "Taiwan",
        isoName: "Taiwan, Province of China",
        region: null,
        slug: "taiwan",
      },
    ]);
    expect(docs[0]?.id).toMatch(UUID_V7_PATTERN);
  });

  it("cannot be added or removed, and their codes cannot change", async () => {
    await expect(
      payload.create({
        collection: "countries",
        data: {
          name: "Testland",
          code: "XT",
          alpha3: "XTS",
          numericCode: "999",
          isoName: "Testland",
          slug: "testland",
        },
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      payload.delete({
        collection: "countries",
        id: ghana,
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 });

    const updated = await payload.update({
      collection: "countries",
      id: ghana,
      data: { code: "XX", subregion: "Western Africa" },
      user: admin,
      overrideAccess: false,
    });
    expect(updated.code).toBe("GH");
    expect(updated.subregion).toBe("Western Africa");
    const [entry] = await auditEntries("country.updated", ghana);
    expect(entry?.details).toEqual({
      changes: {
        subregion: { from: "Sub-Saharan Africa", to: "Western Africa" },
      },
    });
  });
});

describe("content access", () => {
  it("lets verified staff read, only verified admins write, and nobody else in", async () => {
    for (const collection of [
      "countries",
      "categories",
      "tags",
      "individuals",
    ] as const) {
      for (const user of [undefined, member, unverifiedAdmin]) {
        await expect(
          payload.find({ collection, user, overrideAccess: false }),
          `${collection} read by ${user?.role ?? "visitor"}`,
        ).rejects.toMatchObject({ status: 403 });
      }
      await expect(
        payload.find({ collection, user: moderator, overrideAccess: false }),
      ).resolves.toBeDefined();
    }

    for (const user of [moderator, unverifiedAdmin, member]) {
      await expect(
        payload.create({
          collection: "tags",
          data: { name: `Blocked ${user.role}`, slug: `blocked-${user.id}` },
          user,
          overrideAccess: false,
        }),
      ).rejects.toMatchObject({ status: 403 });
    }
  });
});

describe("categories and tags", () => {
  it("fill an empty slug from the name, avoiding taken slugs", async () => {
    const first = await payload.create({
      collection: "categories",
      data: { name: "Public Health" } as { name: string; slug: string },
      user: admin,
      overrideAccess: false,
    });
    const second = await payload.create({
      collection: "categories",
      data: { name: "Public health!" } as { name: string; slug: string },
      user: admin,
      overrideAccess: false,
    });
    expect([first.slug, second.slug]).toEqual([
      "public-health",
      "public-health-2",
    ]);

    await expect(
      payload.create({
        collection: "tags",
        data: { name: "Bad slug", slug: "Bad Slug" },
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("are audited when created, changed, and deleted", async () => {
    const tag = await payload.create({
      collection: "tags",
      data: { name: "Elections", slug: "elections" },
      user: admin,
      overrideAccess: false,
    });
    await payload.update({
      collection: "tags",
      id: tag.id,
      data: { name: "Elections and voting" },
      user: admin,
      overrideAccess: false,
    });
    await payload.delete({
      collection: "tags",
      id: tag.id,
      user: admin,
      overrideAccess: false,
    });

    const [created] = await auditEntries("tag.created", tag.id);
    expect(created?.details).toEqual({ name: "Elections", slug: "elections" });
    expect(created?.actor).toMatchObject({ id: admin.id });
    const [updated] = await auditEntries("tag.updated", tag.id);
    expect(updated?.details).toEqual({
      changes: { name: { from: "Elections", to: "Elections and voting" } },
    });
    const [deleted] = await auditEntries("tag.deleted", tag.id);
    expect(deleted?.details).toEqual({
      name: "Elections and voting",
      slug: "elections",
    });
  });
});

describe("individuals", () => {
  it("are saved with aliases, countries, and links, and audited", async () => {
    const person = await createIndividual({
      name: "Synthetic Person Alpha",
      aliases: [{ name: "S. P. Alpha" }],
      summary: "Fictional test official",
      countries: [
        { country: kenya, role: "Test minister", startDate: "2019-05" },
      ],
      links: [{ label: "Example profile", url: "https://example.org/alpha" }],
    });

    expect(person.id).toMatch(UUID_V7_PATTERN);
    expect(person.slug).toBe("synthetic-person-alpha");
    expect(person.nameKey).toBe("alpha person synthetic");
    expect(person.aliases?.[0]?.key).toBe("alpha p s");
    const [created] = await auditEntries("individual.created", person.id);
    expect(created?.details).toEqual({
      name: "Synthetic Person Alpha",
      slug: "synthetic-person-alpha",
      summary: "Fictional test official",
      bio: null,
      wikidataId: null,
      aliases: ["S. P. Alpha"],
      countries: [
        {
          country: kenya,
          role: "Test minister",
          startDate: "2019-05",
          endDate: null,
        },
      ],
      links: [{ label: "Example profile", url: "https://example.org/alpha" }],
    });

    await payload.update({
      collection: "individuals",
      id: person.id,
      data: {
        countries: [
          {
            country: kenya,
            role: "Test minister",
            startDate: "2019-05",
            endDate: "2022",
          },
        ],
      },
      user: admin,
      overrideAccess: false,
    });
    const [updated] = await auditEntries("individual.updated", person.id);
    expect(updated?.details).toMatchObject({
      changes: {
        countries: {
          to: [expect.objectContaining({ endDate: "2022" })],
        },
      },
    });
    expect(Object.keys(updated?.details as object)).toEqual(["changes"]);
  });

  it("warns about the same name or alias until the admin confirms a different person", async () => {
    const original = await createIndividual({
      name: "Test Individual Beta",
      aliases: [{ name: "Beta Example" }],
    });

    // Same name in another case, order, and with accents.
    await expect(
      createIndividual({ name: "BETA, Tést Individual" }),
    ).rejects.toMatchObject(duplicateError("Test Individual Beta (same name)"));
    // A new name that is the existing person's alias.
    await expect(
      createIndividual({ name: "Beta Example" }),
    ).rejects.toMatchObject(
      duplicateError("Test Individual Beta (same alias)"),
    );

    const namesake = await createIndividual({
      name: "Test Individual Beta",
      notADuplicate: true,
    });
    expect(namesake.slug).toBe("test-individual-beta-2");

    // Editing other fields does not ask again; adding a clashing alias does.
    await expect(
      payload.update({
        collection: "individuals",
        id: namesake.id,
        data: { summary: "Fictional namesake" },
        user: admin,
        overrideAccess: false,
      }),
    ).resolves.toMatchObject({ summary: "Fictional namesake" });
    const other = await createIndividual({ name: "Test Individual Gamma" });
    await expect(
      payload.update({
        collection: "individuals",
        id: other.id,
        data: { aliases: [{ name: "beta example" }] },
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject(duplicateError("Test Individual Beta"));
    expect(original.id).not.toBe(namesake.id);
  });

  it("refuses a Wikidata item that is already used, bad links, and impossible dates", async () => {
    await createIndividual({ name: "Test Individual Delta", wikidataId: "Q1" });
    await expect(
      createIndividual({ name: "Test Individual Epsilon", wikidataId: "Q1" }),
    ).rejects.toMatchObject({ status: 400 });
    // Blank Wikidata ids do not clash with each other.
    await createIndividual({ name: "Test Individual Zeta", wikidataId: "" });
    await createIndividual({ name: "Test Individual Eta", wikidataId: "" });

    for (const data of [
      {
        name: "Test Individual Theta",
        links: [{ label: "Script", url: "javascript:alert(1)" }],
      },
      { name: "Test Individual Iota", wikidataId: "not-an-id" },
      {
        name: "Test Individual Kappa",
        countries: [{ country: ghana, startDate: "2019-02-30" }],
      },
      {
        name: "Test Individual Lambda",
        countries: [{ country: ghana, startDate: "2020", endDate: "2019-12" }],
      },
    ]) {
      await expect(createIndividual(data), data.name).rejects.toMatchObject({
        status: 400,
      });
    }
  });
});

describe("GET /api/individuals/possible-duplicates", () => {
  const matchesSchema = z.object({
    matches: z.array(
      z.object({ id: z.string(), name: z.string(), matchedOn: z.string() }),
    ),
  });

  it("lists exact and similar matches for verified staff only, uncached", async () => {
    const target = await createIndividual({
      name: "Synthetic Person Omicron",
      aliases: [{ name: "Omicron Testperson" }],
      wikidataId: "Q7",
    });
    const staffEmail = testEmail("duplicates-staff");
    await payload.create({
      collection: "users",
      data: { email: staffEmail, role: "moderator" },
      overrideAccess: true,
    });
    const staff = await signInAsVerifiedStaff(staffEmail);

    const lookup = async (search: string, jar = staff) =>
      payloadRest(
        "GET",
        ["individuals", "possible-duplicates"],
        jar,
        undefined,
        undefined,
        search,
      );

    const exact = await lookup("?name=omicron+person+synthetic");
    expect(exact.status).toBe(200);
    expect(exact.headers.get("cache-control")).toBe("no-store");
    expect(matchesSchema.parse(await exact.json()).matches).toEqual([
      { id: target.id, name: "Synthetic Person Omicron", matchedOn: "name" },
    ]);

    // A typo, an alias, and the Wikidata item.
    const similar = matchesSchema.parse(
      await (await lookup("?name=Synthetic+Persn+Omicron")).json(),
    );
    expect(similar.matches).toContainEqual(
      expect.objectContaining({ id: target.id, matchedOn: "similar name" }),
    );
    const byAlias = matchesSchema.parse(
      await (await lookup("?name=New&alias=Omicron+Testperson")).json(),
    );
    expect(byAlias.matches).toContainEqual(
      expect.objectContaining({ id: target.id, matchedOn: "alias" }),
    );
    const byWikidata = matchesSchema.parse(
      await (await lookup("?name=Someone+Else&wikidataId=Q7")).json(),
    );
    expect(byWikidata.matches).toContainEqual(
      expect.objectContaining({ id: target.id, matchedOn: "wikidata" }),
    );

    // The individual being edited is not its own duplicate.
    const self = matchesSchema.parse(
      await (
        await lookup(`?name=Synthetic+Person+Omicron&exclude=${target.id}`)
      ).json(),
    );
    expect(self.matches.map((match) => match.id)).not.toContain(target.id);

    expect((await lookup("?exclude=not-a-uuid")).status).toBe(400);

    const memberEmail = testEmail("duplicates-member");
    await payload.create({
      collection: "users",
      data: { email: memberEmail, role: "member" },
      overrideAccess: true,
    });
    const memberJar = await signInWithEmailLink(memberEmail);
    expect(
      (await lookup("?name=Synthetic+Person+Omicron", memberJar)).status,
    ).toBe(403);
  });
});
