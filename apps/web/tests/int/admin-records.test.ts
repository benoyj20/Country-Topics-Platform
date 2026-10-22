import {
  countryFieldOf,
  countrySaveBody,
  countrySearchParams,
  editorCountry,
  editorIndividual,
  editorMedia,
  editorReference,
  editorSnippet,
  editorTerm,
  EMPTY_INDIVIDUAL,
  EMPTY_MEDIA,
  EMPTY_REFERENCE,
  EMPTY_SNIPPET,
  EMPTY_TERM,
  emptyEvidenceRow,
  emptySourceRow,
  individualFieldOf,
  individualSaveBody,
  individualSearchParams,
  type IndividualValues,
  linkArchiveSearchParams,
  mediaFieldOf,
  mediaSaveBody,
  mediaSearchParams,
  type MediaValues,
  payloadRefusal,
  possibleDuplicatesSchema,
  possibleDuplicatesSearchParams,
  referenceFieldOf,
  referenceLookupSchema,
  referenceSaveBody,
  referenceSearchParams,
  type ReferenceValues,
  type Refusal,
  savedRecordSchema,
  snippetFieldOf,
  snippetSaveBody,
  snippetSearchParams,
  type SnippetValues,
  snippetVideoSearchParams,
  snippetVideosSchema,
  storedCountrySchema,
  storedIndividualSchema,
  storedLinkArchiveSchema,
  storedMediaSchema,
  storedReferenceSchema,
  storedSnippetSchema,
  storedTermSchema,
  storedVideoSchema,
  type TermCollection,
  termFieldOf,
  termSaveBody,
  termSearchParams,
  videoSearchParams,
  videoSnippetsSchema,
  videoSnippetsSearchParams,
} from "@countrytopics/contracts";
import {
  DIFFERENT_PERSON_LABEL,
  SLUG_MESSAGE,
  UPLOAD_MAX_BYTES,
  UPLOAD_TOO_LARGE_MESSAGE,
} from "@countrytopics/domain";
import config from "@payload-config";
import { getPayload, type Payload } from "payload";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type * as z from "zod";

import type { User } from "@/payload-types";

import {
  fakeYouTube,
  PDF_BYTES,
  PNG_BYTES,
  richText,
  runReferenceCheck,
  runVideoCheck,
  workerSide,
} from "./fixtures";
import {
  clearRateLimits,
  CookieJar,
  countryId,
  payloadRest,
  payloadUpload,
  signInAsVerifiedStaff,
  staffProfile,
  startEmailWorker,
  testEmail,
} from "./helpers";

// The admin's editors for the records topics are built from
// (packages/contracts: admin-taxonomy.ts, admin-individuals.ts,
// admin-references.ts, admin-media.ts, admin-snippets.ts, admin-checks.ts)
// against the backend: each record type made, read back as its editor
// reads it, and changed, and every refusal its fields and hooks give
// landing on a field the editor shows (ADR 0014, phase 9: "each record
// type can be created, edited, and checked as today"). Every person,
// file, reference, and video here is made up; links use the reserved
// example.org domain.

let payload: Payload;
let stopEmailWorker: () => Promise<void>;
let worker: Awaited<ReturnType<typeof workerSide>>;
let admin: User;
let adminJar: CookieJar;
let moderatorJar: CookieJar;
let ghana: { id: string; title: string };
let image: { id: string; title: string; mimeType: string; url: string | null };
let pdf: { id: string; title: string; mimeType: string; url: string | null };
let confirmed: { id: string; title: string; checkStatus: "resolved" };

type FieldOf = (path: string) => string | null;

/** Saves as an editor does: a new record when `id` is null. */
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

/**
 * The refusal's messages, each on a field the editor shows: nothing is
 * left for the list above the form.
 */
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

/** A draft topic, as staff make it, with `data`. */
function topic(data: Record<string, unknown>) {
  return payload.create({
    collection: "topics",
    // Payload's generated type asks for a published topic's fields,
    // which a draft may lack.
    data: { slug: "", ...data } as never,
    draft: true,
    user: admin,
    overrideAccess: false,
  });
}

async function deleted(jar: CookieJar, collection: string, id: string) {
  return payloadRest("DELETE", [collection, id], jar);
}

/** A refused delete: one message, above the form, saying why. */
async function keptWhileUsed(collection: string, id: string, label: string) {
  const response = await deleted(adminJar, collection, id);
  expect(response.status).toBe(409);
  const refused = payloadRefusal(409, await response.json(), () => null);
  expect(refused.fields).toEqual({});
  expect(refused.general).toHaveLength(1);
  expect(refused.general[0]).toMatch(
    new RegExp(
      `^This ${label} is used by .+, so it cannot be deleted\\. Edit it instead\\.$`,
    ),
  );
}

function upload(
  jar: CookieJar,
  id: string | null,
  values: MediaValues,
  file?: { name: string; type: string; bytes: Buffer },
) {
  const form = new FormData();
  if (file) {
    form.append(
      "file",
      new Blob([new Uint8Array(file.bytes)], { type: file.type }),
      file.name,
    );
  }
  form.append("_payload", JSON.stringify(mediaSaveBody(values)));
  return payloadUpload(
    id ? "PATCH" : "POST",
    id ? ["media", id] : ["media"],
    jar,
    form,
    `?${mediaSearchParams()}`,
  );
}

const png = { name: "records-image.png", type: "image/png", bytes: PNG_BYTES };

beforeAll(async () => {
  payload = await getPayload({ config });
  stopEmailWorker = startEmailWorker();
  worker = await workerSide();
  admin = await staffProfile(payload, "admin-records-admin", "admin");
  await staffProfile(payload, "admin-records-moderator", "moderator");
  [adminJar, moderatorJar] = await Promise.all([
    signInAsVerifiedStaff(testEmail("admin-records-admin")),
    signInAsVerifiedStaff(testEmail("admin-records-moderator")),
  ]);
  const asAdmin = { user: admin, overrideAccess: false } as const;
  ghana = { id: await countryId(payload, "GH"), title: "Ghana" };
  const photo = await payload.create({
    collection: "media",
    data: { alt: "TEST records image", licence: "own_work" },
    file: {
      name: "records-photo.png",
      mimetype: "image/png",
      data: PNG_BYTES,
      size: PNG_BYTES.length,
    },
    ...asAdmin,
  });
  image = {
    id: photo.id,
    title: "TEST records image",
    mimeType: "image/png",
    url: photo.url ?? null,
  };
  const document = await payload.create({
    collection: "media",
    data: { alt: "TEST records document", licence: "own_work" },
    file: {
      name: "records-document.pdf",
      mimetype: "application/pdf",
      data: PDF_BYTES,
      size: PDF_BYTES.length,
    },
    ...asAdmin,
  });
  pdf = {
    id: document.id,
    title: "TEST records document",
    mimeType: "application/pdf",
    url: document.url ?? null,
  };
  const reference = await payload.create({
    collection: "references",
    data: {
      title: "TEST confirmed reference for the record editors",
      kind: "web_page",
      url: "https://example.org/records-reference",
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
});

// Each test saves more often than the staff write limit allows a person.
beforeEach(clearRateLimits);

afterAll(async () => {
  await worker?.close();
  await stopEmailWorker?.();
  await payload?.destroy();
});

describe("a country", () => {
  it("is read as its editor reads it, and saved", async () => {
    const country = editorCountry(
      await read(
        adminJar,
        "countries",
        ghana.id,
        countrySearchParams(),
        storedCountrySchema,
      ),
    );
    expect(country.codes).toEqual({
      code: "GH",
      alpha3: "GHA",
      numericCode: "288",
      isoName: "Ghana",
    });
    const values = { ...country.values, subregion: "TEST subregion" };
    const doc = await saved(
      await save(
        adminJar,
        "countries",
        ghana.id,
        countrySaveBody(values),
        countrySearchParams(),
      ),
      storedCountrySchema,
    );
    expect(editorCountry(doc).values).toEqual(values);
    // Put back as it was.
    await saved(
      await save(
        adminJar,
        "countries",
        ghana.id,
        countrySaveBody(country.values),
        countrySearchParams(),
      ),
      storedCountrySchema,
    );
  });

  it("is refused on each field it shows", async () => {
    const { values } = editorCountry(
      await read(
        adminJar,
        "countries",
        ghana.id,
        countrySearchParams(),
        storedCountrySchema,
      ),
    );
    const refuse = (changed: Partial<typeof values>) =>
      save(
        adminJar,
        "countries",
        ghana.id,
        countrySaveBody({ ...values, ...changed }),
        countrySearchParams(),
      );
    expect(
      await placed(await refuse({ name: "", slug: "" }), countryFieldOf),
    ).toEqual({
      name: ["This field is required."],
      slug: [SLUG_MESSAGE],
    });
    const taken = await placed(await refuse({ slug: "togo" }), countryFieldOf);
    expect(Object.keys(taken)).toEqual(["slug"]);
  });

  it("is never made or deleted, and only admins change it", async () => {
    for (const response of [
      await save(
        adminJar,
        "countries",
        null,
        countrySaveBody({
          name: "TEST",
          region: "",
          subregion: "",
          slug: "test",
        }),
        countrySearchParams(),
      ),
      await deleted(adminJar, "countries", ghana.id),
      await save(
        moderatorJar,
        "countries",
        ghana.id,
        { name: "TEST" },
        countrySearchParams(),
      ),
    ]) {
      expect(response.status).toBe(403);
    }
  });
});

describe.each<TermCollection>(["categories", "tags"])(
  "a %s record",
  (collection) => {
    const saveTerm = (id: string | null, values: typeof EMPTY_TERM) =>
      save(
        adminJar,
        collection,
        id,
        termSaveBody(collection, values),
        termSearchParams(collection),
      );

    it("is made, read back as its editor reads it, and changed", async () => {
      const values = {
        name: `TEST ${collection} record`,
        description: collection === "categories" ? "TEST description" : "",
        slug: "",
      };
      const doc = await saved(await saveTerm(null, values), storedTermSchema);
      const made = editorTerm(doc);
      expect(made.values).toEqual({
        ...values,
        slug: `test-${collection}-record`,
      });
      const read_ = editorTerm(
        await read(
          adminJar,
          collection,
          doc.id,
          termSearchParams(collection),
          storedTermSchema,
        ),
      );
      expect(read_.values).toEqual(made.values);
      // A cleared slug is filled from the name again.
      const renamed = editorTerm(
        await saved(
          await saveTerm(doc.id, {
            ...made.values,
            name: "TEST renamed",
            slug: "",
          }),
          storedTermSchema,
        ),
      );
      expect(renamed.values.slug).toBe("test-renamed");
    });

    it("is refused on each field its editor shows", async () => {
      expect(
        await placed(await saveTerm(null, EMPTY_TERM), termFieldOf),
      ).toEqual({ name: ["This field is required."], slug: [SLUG_MESSAGE] });
      const long = await placed(
        await saveTerm(null, {
          name: "x".repeat(81),
          description: "x".repeat(501),
          slug: "Not a slug",
        }),
        termFieldOf,
      );
      expect(Object.keys(long).sort()).toEqual(
        collection === "categories"
          ? ["description", "name", "slug"]
          : ["name", "slug"],
      );
      const first = await saved(
        await saveTerm(null, {
          ...EMPTY_TERM,
          name: `TEST taken ${collection}`,
        }),
        storedTermSchema,
      );
      // The backend finds one taken value at a time.
      const name = await placed(
        await saveTerm(null, {
          ...EMPTY_TERM,
          name: `TEST taken ${collection}`,
        }),
        termFieldOf,
      );
      expect(Object.keys(name)).toEqual(["name"]);
      const slug = await placed(
        await saveTerm(null, {
          ...EMPTY_TERM,
          name: `TEST other ${collection}`,
          slug: first.slug ?? "",
        }),
        termFieldOf,
      );
      expect(Object.keys(slug)).toEqual(["slug"]);
    });

    it("is deleted only while no topic uses it", async () => {
      const used = await saved(
        await saveTerm(null, {
          ...EMPTY_TERM,
          name: `TEST used ${collection}`,
        }),
        storedTermSchema,
      );
      await topic({
        title: `TEST topic filed under a ${collection} record`,
        ...(collection === "categories"
          ? { category: used.id }
          : { tags: [used.id] }),
      });
      await keptWhileUsed(
        collection,
        used.id,
        collection === "categories" ? "category" : "tag",
      );
      const unused = await saved(
        await saveTerm(null, {
          ...EMPTY_TERM,
          name: `TEST unused ${collection}`,
        }),
        storedTermSchema,
      );
      expect((await deleted(adminJar, collection, unused.id)).status).toBe(200);
    });

    it("is read by moderators, who change nothing", async () => {
      const doc = await saved(
        await saveTerm(null, {
          ...EMPTY_TERM,
          name: `TEST read ${collection}`,
        }),
        storedTermSchema,
      );
      await read(
        moderatorJar,
        collection,
        doc.id,
        termSearchParams(collection),
        storedTermSchema,
      );
      for (const response of [
        await save(
          moderatorJar,
          collection,
          null,
          termSaveBody(collection, { ...EMPTY_TERM, name: "TEST" }),
          termSearchParams(collection),
        ),
        await save(
          moderatorJar,
          collection,
          doc.id,
          termSaveBody(collection, { ...EMPTY_TERM, name: "TEST" }),
          termSearchParams(collection),
        ),
        await deleted(moderatorJar, collection, doc.id),
      ]) {
        expect(response.status).toBe(403);
      }
    });
  },
);

describe("an individual", () => {
  const saveIndividual = (id: string | null, values: IndividualValues) =>
    save(
      adminJar,
      "individuals",
      id,
      individualSaveBody(values),
      individualSearchParams(),
    );

  /** Everything an individual's editor shows, filled in. */
  const full = (): IndividualValues => ({
    ...EMPTY_INDIVIDUAL,
    name: "Records Testperson Alpha",
    aliases: [{ name: "R. T. Alpha" }],
    summary: "TEST economist",
    countries: [
      {
        country: ghana,
        role: "TEST adviser",
        startDate: "2019-05",
        endDate: "",
      },
    ],
    bio: "TEST staff notes.",
    statements: [
      {
        text: "TEST statement about the person.",
        evidence: [
          {
            ...emptyEvidenceRow(),
            kind: "link",
            title: "TEST page",
            url: "https://example.org/records-statement",
          },
        ],
        sources: [
          {
            ...emptySourceRow(),
            reference: confirmed,
            passage: "TEST passage, quoted exactly.",
          },
        ],
      },
    ],
    links: [{ label: "TEST profile", url: "https://example.org/profile" }],
    wikidataId: "Q999999991",
    slug: "",
  });

  it("is made, read back as its editor reads it, and changed", async () => {
    const withPhoto = { ...full(), photo: image };
    const doc = await saved(
      await saveIndividual(null, withPhoto),
      storedIndividualSchema,
    );
    const made = editorIndividual(doc);
    const withoutIds = JSON.parse(
      JSON.stringify(made.values, (key, value: unknown) =>
        key === "id" &&
        typeof value === "string" &&
        value !== image.id &&
        value !== ghana.id &&
        value !== confirmed.id
          ? undefined
          : value,
      ),
      // The same values, without the ids the backend gave the rows.
    ) as IndividualValues;
    expect(withoutIds).toEqual({
      ...withPhoto,
      photo: { ...image, url: made.values.photo?.url ?? null },
      slug: "records-testperson-alpha",
    });
    const again = editorIndividual(
      await read(
        adminJar,
        "individuals",
        doc.id,
        individualSearchParams(),
        storedIndividualSchema,
      ),
    );
    expect(again.values).toEqual(made.values);
    // Saving it back unchanged keeps every row as it was.
    const resaved = editorIndividual(
      await saved(
        await saveIndividual(doc.id, again.values),
        storedIndividualSchema,
      ),
    );
    expect(resaved.values).toEqual(again.values);
  });

  it("is refused on every field its editor shows, in rows of rows too", async () => {
    expect(
      await placed(
        await saveIndividual(null, EMPTY_INDIVIDUAL),
        individualFieldOf,
      ),
    ).toEqual({ name: ["This field is required."], slug: [SLUG_MESSAGE] });
    const refused = await placed(
      await saveIndividual(null, {
        ...full(),
        name: "Records Testperson Refused",
        aliases: [{ name: "" }],
        summary: "x".repeat(161),
        countries: [
          {
            country: null,
            role: "x".repeat(121),
            startDate: "May 2019",
            endDate: "",
          },
          { country: ghana, role: "", startDate: "2020", endDate: "2019" },
        ],
        photo: { ...pdf },
        bio: "x".repeat(5001),
        statements: [
          {
            text: "",
            evidence: [
              { ...emptyEvidenceRow(), kind: "document" },
              {
                ...emptyEvidenceRow(),
                kind: "link",
                title: "TEST",
                archiveUrl: "not a link",
              },
            ],
            sources: [emptySourceRow()],
          },
        ],
        links: [{ label: "", url: "ftp://example.org" }],
        wikidataId: "42",
        slug: "Not a slug",
      }),
      individualFieldOf,
    );
    expect(Object.keys(refused).sort()).toEqual(
      [
        "aliases.0.name",
        "bio",
        "countries.0.country",
        "countries.0.role",
        "countries.0.startDate",
        "countries.1.endDate",
        "links.0.label",
        "links.0.url",
        "photo",
        "slug",
        "statements.0.evidence.0.file",
        "statements.0.evidence.0.title",
        "statements.0.evidence.1.archiveUrl",
        "statements.0.evidence.1.url",
        "statements.0.sources.0.passage",
        "statements.0.sources.0.reference",
        "statements.0.text",
        "summary",
        "wikidataId",
      ].sort(),
    );
    const many = await placed(
      await saveIndividual(null, {
        ...EMPTY_INDIVIDUAL,
        name: "Records Testperson Many",
        aliases: Array.from({ length: 21 }, (_, index) => ({
          name: `Records Many ${index}`,
        })),
      }),
      individualFieldOf,
    );
    expect(Object.keys(many)).toEqual(["aliases"]);
  });

  it("is refused while another has its name, until said to be another person", async () => {
    const values = {
      ...EMPTY_INDIVIDUAL,
      name: "Records Testperson Twin",
    };
    await saved(await saveIndividual(null, values), storedIndividualSchema);
    // As the form warns while the name is typed.
    const response = await payloadRest(
      "GET",
      ["individuals", "possible-duplicates"],
      adminJar,
      undefined,
      undefined,
      `?${possibleDuplicatesSearchParams({
        name: values.name,
        aliases: [],
        wikidataId: "",
        exclude: null,
      })}`,
    );
    const { matches } = possibleDuplicatesSchema.parse(await response.json());
    // The same name needs saying it is another person; a similar one is
    // only shown.
    expect(matches).toContainEqual(
      expect.objectContaining({
        name: values.name,
        matchedOn: "name",
        needsConfirmation: true,
      }),
    );
    expect(
      matches.filter((match) => match.needsConfirmation).map((m) => m.name),
    ).toEqual([values.name]);
    const refused = await placed(
      await saveIndividual(null, values),
      individualFieldOf,
    );
    expect(Object.keys(refused)).toEqual(["notADuplicate"]);
    expect(refused.notADuplicate?.[0]).toContain(DIFFERENT_PERSON_LABEL);
    await saved(
      await saveIndividual(null, { ...values, notADuplicate: true }),
      storedIndividualSchema,
    );
  });

  it("is deleted only while nothing names them", async () => {
    const named = await saved(
      await saveIndividual(null, {
        ...EMPTY_INDIVIDUAL,
        name: "Records Testperson Named",
      }),
      storedIndividualSchema,
    );
    await topic({
      title: "TEST topic naming a record editors' individual",
      people: [{ individual: named.id, role: "subject" }],
    });
    await keptWhileUsed("individuals", named.id, "individual");
    const unnamed = await saved(
      await saveIndividual(null, {
        ...EMPTY_INDIVIDUAL,
        name: "Records Testperson Unnamed",
      }),
      storedIndividualSchema,
    );
    expect((await deleted(adminJar, "individuals", unnamed.id)).status).toBe(
      200,
    );
  });
});

describe("a reference", () => {
  const saveReference = (id: string | null, values: ReferenceValues) =>
    save(
      adminJar,
      "references",
      id,
      referenceSaveBody(values),
      referenceSearchParams(),
    );

  it("is made, checked, read back as its editor reads it, and changed", async () => {
    const values: ReferenceValues = {
      ...EMPTY_REFERENCE,
      doi: "https://doi.org/10.5555/RECORDS.1",
      kind: "report",
      publishedDate: "2024-05",
      title: "TEST reference made in its editor",
      authors: "TEST Author One\nTEST Author Two",
      containerTitle: "TEST Journal",
      publisher: "TEST Publisher",
    };
    const made = editorReference(
      await saved(await saveReference(null, values), storedReferenceSchema),
    );
    // Stored as the DOI itself, and waiting for the worker's check.
    expect(made.values).toEqual({ ...values, doi: "10.5555/records.1" });
    expect(made.status.checkStatus).toBe("pending");
    await runReferenceCheck(payload, worker.store, made.id);
    const checked = editorReference(
      await read(
        adminJar,
        "references",
        made.id,
        referenceSearchParams(),
        storedReferenceSchema,
      ),
    );
    expect(checked.values).toEqual(made.values);
    expect(checked.status.checkStatus).toBe("resolved");
    // Changing the DOI asks for a new check.
    const changed = editorReference(
      await saved(
        await saveReference(made.id, {
          ...checked.values,
          doi: "10.5555/records.2",
        }),
        storedReferenceSchema,
      ),
    );
    expect(changed.status.checkStatus).toBe("pending");
  });

  it("is refused on every field its editor shows", async () => {
    expect(
      Object.keys(
        await placed(
          await saveReference(null, EMPTY_REFERENCE),
          referenceFieldOf,
        ),
      ).sort(),
    ).toEqual(["title", "url"]);
    const refused = await placed(
      await saveReference(null, {
        ...EMPTY_REFERENCE,
        doi: "not a doi",
        isbn: "123",
        url: "ftp://example.org/x",
        publishedDate: "May 2024",
        title: "x".repeat(501),
        authors: "x".repeat(2001),
        containerTitle: "x".repeat(301),
        publisher: "x".repeat(301),
      }),
      referenceFieldOf,
    );
    expect(Object.keys(refused).sort()).toEqual(
      [
        "authors",
        "containerTitle",
        "doi",
        "isbn",
        "publishedDate",
        "publisher",
        "title",
        "url",
      ].sort(),
    );
    await saved(
      await saveReference(null, {
        ...EMPTY_REFERENCE,
        doi: "10.5555/records.taken",
        title: "TEST reference whose DOI is taken",
      }),
      storedReferenceSchema,
    );
    const taken = await placed(
      await saveReference(null, {
        ...EMPTY_REFERENCE,
        doi: "10.5555/records.taken",
        title: "TEST second reference",
      }),
      referenceFieldOf,
    );
    expect(Object.keys(taken)).toEqual(["doi"]);
  });

  it("answers the editor's lookup as its contract says", async () => {
    const lookUp = (jar: CookieJar, search: string) =>
      payloadRest(
        "GET",
        ["references", "lookup"],
        jar,
        undefined,
        undefined,
        search,
      );
    const invalid = await lookUp(adminJar, "?doi=not-a-doi");
    expect(invalid.status).toBe(400);
    expect("error" in referenceLookupSchema.parse(await invalid.json())).toBe(
      true,
    );
    const forbidden = await lookUp(moderatorJar, "?doi=10.5555/x");
    expect(forbidden.status).toBe(403);
    referenceLookupSchema.parse(await forbidden.json());
  });

  it("is deleted only while nothing cites it", async () => {
    await topic({
      title: "TEST topic citing a record editors' reference",
      references: [
        {
          reference: confirmed.id,
          stance: "supports",
          passage: "TEST passage, quoted exactly.",
        },
      ],
    });
    await keptWhileUsed("references", confirmed.id, "reference");
    const unused = editorReference(
      await saved(
        await saveReference(null, {
          ...EMPTY_REFERENCE,
          url: "https://example.org/records-unused",
          title: "TEST unused reference",
        }),
        storedReferenceSchema,
      ),
    );
    expect((await deleted(adminJar, "references", unused.id)).status).toBe(200);
  });
});

describe("a file", () => {
  const values: MediaValues = {
    alt: "TEST file uploaded in its editor",
    licence: "own_work",
    credit: "TEST credit",
    sourceUrl: "https://example.org/records-file",
  };

  it("is uploaded, read back as its editor reads it, and changed", async () => {
    const made = editorMedia(
      await saved(await upload(adminJar, null, values, png), storedMediaSchema),
    );
    expect(made.values).toEqual(values);
    expect(made.file).toMatchObject({
      mimeType: "image/png",
      width: 1,
      height: 1,
      filesize: PNG_BYTES.length,
    });
    expect(made.file.filename).toMatch(/^records-image/);
    expect(made.file.url).toMatch(/^\/api\/media\/file\//);
    const again = editorMedia(
      await read(
        adminJar,
        "media",
        made.id,
        mediaSearchParams(),
        storedMediaSchema,
      ),
    );
    // Stored a moment after the answer, with the file's address.
    expect(again.values).toEqual(made.values);
    expect({ ...again.file, updatedAt: null }).toEqual({
      ...made.file,
      updatedAt: null,
    });
    // Its fields alone, as JSON.
    const renamed = editorMedia(
      await saved(
        await save(
          adminJar,
          "media",
          made.id,
          mediaSaveBody({ ...values, alt: "TEST renamed file" }),
          mediaSearchParams(),
        ),
        storedMediaSchema,
      ),
    );
    expect(renamed.values.alt).toBe("TEST renamed file");
    expect(renamed.file.filename).toBe(made.file.filename);
    // A new file replaces the stored one.
    const replaced = editorMedia(
      await saved(
        await upload(adminJar, made.id, renamed.values, {
          name: "records-replaced.pdf",
          type: "application/pdf",
          bytes: PDF_BYTES,
        }),
        storedMediaSchema,
      ),
    );
    expect(replaced.file).toMatchObject({ mimeType: "application/pdf" });
    expect(replaced.file.filename).toMatch(/^records-replaced/);
  });

  it("is refused on every field its editor shows", async () => {
    const refused = await placed(
      await upload(
        adminJar,
        null,
        {
          ...EMPTY_MEDIA,
          credit: "x".repeat(301),
          sourceUrl: "not a link",
        },
        png,
      ),
      mediaFieldOf,
    );
    expect(Object.keys(refused).sort()).toEqual(
      ["alt", "credit", "licence", "sourceUrl"].sort(),
    );
  });

  it("is refused a file of a type it does not take, too large, or none", async () => {
    const text = await refusal(
      await upload(adminJar, null, values, {
        name: "records.txt",
        type: "text/plain",
        bytes: Buffer.from("TEST text"),
      }),
      mediaFieldOf,
    );
    expect(text).toEqual({
      fields: {
        file: ["File type text/plain (from extension txt) is not allowed."],
      },
      general: [],
    });
    // The editor refuses these two itself before sending, with its own
    // messages on the file field; the backend refuses them too.
    const large = await upload(adminJar, null, values, {
      ...png,
      bytes: Buffer.alloc(UPLOAD_MAX_BYTES + 1),
    });
    expect(await refusal(large, mediaFieldOf)).toEqual({
      fields: {},
      general: [UPLOAD_TOO_LARGE_MESSAGE],
    });
    const none = await refusal(
      await upload(adminJar, null, values),
      mediaFieldOf,
    );
    expect(none).toEqual({ fields: {}, general: ["No files were uploaded."] });
  });

  it("is deleted only while nothing uses it", async () => {
    await saved(
      await save(
        adminJar,
        "individuals",
        null,
        individualSaveBody({
          ...EMPTY_INDIVIDUAL,
          name: "Records Testperson Photographed",
          photo: image,
        }),
        individualSearchParams(),
      ),
      storedIndividualSchema,
    );
    await keptWhileUsed("media", image.id, "file");
    const unused = editorMedia(
      await saved(await upload(adminJar, null, values, png), storedMediaSchema),
    );
    expect((await deleted(adminJar, "media", unused.id)).status).toBe(200);
  });

  it("is read by moderators, who upload nothing", async () => {
    await read(
      moderatorJar,
      "media",
      image.id,
      mediaSearchParams(),
      storedMediaSchema,
    );
    expect((await upload(moderatorJar, null, values, png)).status).toBe(403);
  });
});

describe("a snippet", () => {
  const saveSnippet = (id: string | null, values: SnippetValues) =>
    save(
      adminJar,
      "snippets",
      id,
      snippetSaveBody(values),
      snippetSearchParams(),
    );

  const clip: SnippetValues = {
    ...EMPTY_SNIPPET,
    caption: "TEST snippet made in its editor",
    // Pasted as a link, as the clip editor may send it.
    youtubeId: "https://youtu.be/TESTrecs001",
    startS: 2.04,
    endS: 9,
    transcriptText: "0:01 TEST before the clip\n0:03 TEST inside the clip",
  };

  async function videoOf(youtubeId: string) {
    const response = await payloadRest(
      "GET",
      ["videos"],
      adminJar,
      undefined,
      undefined,
      `?${snippetVideoSearchParams(youtubeId)}`,
    );
    return snippetVideosSchema.parse(await response.json()).docs[0];
  }

  it("is made, read back as its editor reads it, with its video's check", async () => {
    const made = editorSnippet(
      await saved(await saveSnippet(null, clip), storedSnippetSchema),
    );
    expect(made.values).toEqual({
      ...clip,
      youtubeId: "TESTrecs001",
      startS: 2,
    });
    expect(made.status.video?.id).toBeTruthy();
    expect(await videoOf("TESTrecs001")).toMatchObject({
      checkStatus: "pending",
    });
    const video = made.status.video?.id ?? "";
    await runVideoCheck(payload, worker.store, video, fakeYouTube());
    expect(await videoOf("TESTrecs001")).toMatchObject({
      checkStatus: "playable",
      durationS: 60,
    });
    const again = editorSnippet(
      await read(
        adminJar,
        "snippets",
        made.id,
        snippetSearchParams(),
        storedSnippetSchema,
      ),
    );
    expect(again.values).toEqual(made.values);
    expect(again.status.video).toEqual({
      id: video,
      title: "A synthetic clip",
    });
  });

  it("is refused on every field its editor shows", async () => {
    expect(
      Object.keys(
        await placed(await saveSnippet(null, EMPTY_SNIPPET), snippetFieldOf),
      ).sort(),
    ).toEqual(["caption", "startS", "youtubeId"]);
    const refused = await placed(
      await saveSnippet(null, {
        ...clip,
        caption: "x".repeat(201),
        youtubeId: "not a link",
        startS: 5,
        endS: 3,
        language: "not a language!",
      }),
      snippetFieldOf,
    );
    expect(Object.keys(refused).sort()).toEqual(
      ["caption", "endS", "language", "youtubeId"].sort(),
    );
    const transcript = await placed(
      await saveSnippet(null, {
        ...clip,
        transcriptText: "no timestamps here",
      }),
      snippetFieldOf,
    );
    expect(Object.keys(transcript)).toEqual(["transcriptText"]);
    // Past the end of the video, which the worker found 60 s long.
    const past = await placed(
      await saveSnippet(null, { ...clip, endS: 90 }),
      snippetFieldOf,
    );
    expect(Object.keys(past)).toEqual(["endS"]);
  });

  it("keeps the video and speaker that published topics rely on", async () => {
    const used = editorSnippet(
      await saved(
        await saveSnippet(null, {
          ...clip,
          caption: "TEST snippet a topic uses",
        }),
        storedSnippetSchema,
      ),
    );
    await payload.create({
      collection: "topics",
      data: {
        title: "TEST topic backed by a record editors' snippet",
        summary: "TEST summary.",
        body: richText("TEST body."),
        countries: [ghana.id],
        evidence: [{ kind: "snippet", snippet: used.id }],
        slug: "",
        _status: "published",
        // The body's generated type is Lexical's, which richText builds.
      } as never,
      user: admin,
      overrideAccess: false,
    });
    const speaker = await payload.create({
      collection: "individuals",
      data: {
        name: "Records Testperson Speaker",
        slug: "",
        notADuplicate: true,
      },
      overrideAccess: true,
    });
    const named = await placed(
      await saveSnippet(used.id, {
        ...used.values,
        speaker: { id: speaker.id, title: speaker.name },
      }),
      snippetFieldOf,
    );
    expect(Object.keys(named)).toEqual(["speaker"]);
    const moved = await placed(
      await saveSnippet(used.id, { ...used.values, youtubeId: "TESTrecs002" }),
      snippetFieldOf,
    );
    expect(Object.keys(moved)).toEqual(["youtubeId"]);
    await keptWhileUsed("snippets", used.id, "snippet");
  });
});

describe("a video", () => {
  it("is read as its page reads it, with its snippets, and deleted only once none uses it", async () => {
    const snippet = editorSnippet(
      await saved(
        await save(
          adminJar,
          "snippets",
          null,
          snippetSaveBody({
            ...EMPTY_SNIPPET,
            caption: "TEST snippet of a video page",
            youtubeId: "TESTrecs003",
            startS: 0,
            endS: 4,
          }),
          snippetSearchParams(),
        ),
        storedSnippetSchema,
      ),
    );
    const id = snippet.status.video?.id ?? "";
    const video = await read(
      adminJar,
      "videos",
      id,
      videoSearchParams(),
      storedVideoSchema,
    );
    expect(video).toMatchObject({
      youtubeId: "TESTrecs003",
      checkStatus: "pending",
    });
    const listed = await payloadRest(
      "GET",
      ["snippets"],
      adminJar,
      undefined,
      undefined,
      `?${videoSnippetsSearchParams(id)}`,
    );
    const snippets = videoSnippetsSchema.parse(await listed.json());
    expect(snippets.docs.map((doc) => doc.id)).toEqual([snippet.id]);
    await keptWhileUsed("videos", id, "video");
    expect((await deleted(adminJar, "snippets", snippet.id)).status).toBe(200);
    expect((await deleted(moderatorJar, "videos", id)).status).toBe(403);
    expect((await deleted(adminJar, "videos", id)).status).toBe(200);
  });

  it("is never made or changed through the API", async () => {
    expect(
      (
        await save(
          adminJar,
          "videos",
          null,
          { youtubeId: "TESTrecs004" },
          videoSearchParams(),
        )
      ).status,
    ).toBe(403);
  });
});

describe("an archived link", () => {
  it("is read as its page reads it, and nobody changes it", async () => {
    const archive = await payload.create({
      collection: "link-archives",
      data: {
        url: "https://example.org/records-archived",
        status: "archived",
        archiveUrl:
          "https://web.archive.org/web/20240501000000/https://example.org/records-archived",
        capturedAt: "2024-05-01T00:00:00.000Z",
        checkedAt: "2024-05-01T00:00:00.000Z",
        message: "TEST copy.",
      },
      overrideAccess: true,
    });
    for (const jar of [adminJar, moderatorJar]) {
      expect(
        await read(
          jar,
          "link-archives",
          archive.id,
          linkArchiveSearchParams(),
          storedLinkArchiveSchema,
        ),
      ).toMatchObject({ url: archive.url, status: "archived" });
    }
    for (const response of [
      await save(
        adminJar,
        "link-archives",
        null,
        { url: "https://example.org/x" },
        linkArchiveSearchParams(),
      ),
      await save(
        adminJar,
        "link-archives",
        archive.id,
        { message: "TEST" },
        linkArchiveSearchParams(),
      ),
      await deleted(adminJar, "link-archives", archive.id),
    ]) {
      expect(response.status).toBe(403);
    }
  });
});
