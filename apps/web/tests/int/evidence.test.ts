import { linkJobId, processLinkArchive } from "@countrytopics/jobs";
import {
  type Bibliography,
  SourceUnavailableError,
  type WebArchive,
} from "@countrytopics/sources";
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
  file,
  linkNode,
  PDF_BYTES,
  PNG_BYTES,
  richText,
  runReferenceCheck,
  workerSide,
} from "./fixtures";
import {
  CookieJar,
  countryId,
  payloadRest,
  signInAsVerifiedStaff,
  staffProfile,
  startEmailWorker,
  testEmail,
} from "./helpers";

// Every topic, person, file, and reference here is made up for the tests.
// DOIs use Crossref's test prefix 10.5555; links use the reserved
// example.org domain.
let payload: Payload;
let stopEmailWorker: (() => Promise<void>) | undefined;
let worker: Awaited<ReturnType<typeof workerSide>>;
let admin: User;
let adminJar: CookieJar;
let moderatorJar: CookieJar;
let kenya: string;
let individual: string;

type TopicInput = RequiredDataFromCollectionSlug<"topics">;

function upload(name: string, mimetype: string, data: Buffer, alt = name) {
  return payload.create({
    collection: "media",
    data: { alt, licence: "own_work" },
    file: file(name, mimetype, data),
    user: admin,
    overrideAccess: false,
  });
}

function createReference(
  data: Partial<RequiredDataFromCollectionSlug<"references">>,
) {
  return payload.create({
    collection: "references",
    // The check status is set by the server whatever is sent; the type needs it.
    data: {
      title: "Fictional reference",
      kind: "report",
      checkStatus: "pending",
      ...data,
    },
    user: admin,
    overrideAccess: false,
  });
}

async function confirmedReference(title: string, url: string) {
  const reference = await createReference({ title, url });
  await runReferenceCheck(payload, worker.store, reference.id);
  return reference.id;
}

function createDraft(data: Partial<TopicInput> & { title: string }) {
  return payload.create({
    collection: "topics",
    data: {
      slug: "",
      summary: "A fictional topic for the tests.",
      body: richText("Fictional text for the tests."),
      countries: [kenya],
      ...data,
    } as TopicInput,
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

const validationError = z.object({
  data: z.object({ errors: z.array(z.object({ path: z.string() })) }),
});

/** The fields a refused save names, in order. */
function errorPaths(error: unknown): string[] {
  return validationError.parse(error).data.errors.map((entry) => entry.path);
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the operation to be refused");
}

beforeAll(async () => {
  payload = await getPayload({ config });
  stopEmailWorker = startEmailWorker();
  worker = await workerSide();
  admin = await staffProfile(payload, "evidence-admin", "admin");
  await staffProfile(payload, "evidence-moderator", "moderator");
  adminJar = await signInAsVerifiedStaff(testEmail("evidence-admin"));
  moderatorJar = await signInAsVerifiedStaff(testEmail("evidence-moderator"));
  kenya = await countryId(payload, "KE");
  const person = await payload.create({
    collection: "individuals",
    data: { name: "Evidence Testperson Beta", slug: "", notADuplicate: true },
    overrideAccess: true,
  });
  individual = person.id;
});

afterAll(async () => {
  globalThis.countryTopicsBibliography = undefined;
  await worker?.close();
  await stopEmailWorker?.();
  await payload?.destroy();
});

describe("files", () => {
  it("are stored in S3 storage and served only to staff, with safe headers", async () => {
    const image = await upload("evidence-photo.png", "image/png", PNG_BYTES);
    expect(image).toMatchObject({ mimeType: "image/png", licence: "own_work" });
    const filename = image.filename ?? "";

    const served = await payloadRest(
      "GET",
      ["media", "file", filename],
      moderatorJar,
    );
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(served.headers.get("x-content-type-options")).toBe("nosniff");
    expect(served.headers.get("cache-control")).toBe("private, no-store");
    expect(Buffer.from(await served.arrayBuffer()).equals(PNG_BYTES)).toBe(
      true,
    );

    const anonymous = await payloadRest(
      "GET",
      ["media", "file", filename],
      new CookieJar(),
    );
    expect(anonymous.status).toBe(403);
  });

  it("must be images or PDFs by content, not by name, and need a licence", async () => {
    await expect(
      upload(
        "not-really.png",
        "image/png",
        Buffer.from("plain text, not an image"),
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      upload(
        "drawing.svg",
        "image/svg+xml",
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        ),
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      payload.create({
        collection: "media",
        data: { alt: "No licence" } as RequiredDataFromCollectionSlug<"media">,
        file: file("unlicensed.pdf", "application/pdf", PDF_BYTES),
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      (await upload("evidence-report.pdf", "application/pdf", PDF_BYTES))
        .mimeType,
    ).toBe("application/pdf");
  });

  it("cannot be deleted while an individual or a topic uses them", async () => {
    const photo = await upload("person-photo.png", "image/png", PNG_BYTES);
    await payload.update({
      collection: "individuals",
      id: individual,
      data: { photo: photo.id },
      overrideAccess: true,
    });
    await expect(
      payload.delete({
        collection: "media",
        id: photo.id,
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 409 });
    // Only images can be an individual's photo.
    const pdf = await upload("not-a-photo.pdf", "application/pdf", PDF_BYTES);
    await expect(
      payload.update({
        collection: "individuals",
        id: individual,
        data: { photo: pdf.id },
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("references", () => {
  it("normalise their identifiers, need at least one, and queue a check", async () => {
    const reference = await createReference({
      doi: "https://doi.org/10.5555/Fictional-1",
      isbn: "0-306-40615-2",
    });
    expect(reference).toMatchObject({
      doi: "10.5555/fictional-1",
      isbn: "9780306406157",
      url: null,
      checkStatus: "pending",
    });
    const jobs = await worker.queues.references.getJobs(["waiting", "delayed"]);
    const queued = {
      referenceId: reference.id,
      requestedAt: reference.checkRequestedAt,
      doi: "10.5555/fictional-1",
      isbn: "9780306406157",
      url: null,
    };
    expect(jobs.map((job) => job.data)).toContainEqual(queued);
    // The worker recognises the queued job as the one the reference waits for.
    expect(
      await worker.store.referenceState(
        jobs.find((job) => job.data.referenceId === reference.id)?.data,
      ),
    ).toBe("pending");
    // The worker's start-up pass would queue exactly that job again.
    expect((await worker.store.pendingChecks(1_000)).references).toContainEqual(
      queued,
    );

    await expect(createReference({})).rejects.toMatchObject({ status: 400 });
    await expect(
      createReference({ isbn: "0-306-40615-3" }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      createReference({ url: "javascript:alert(1)" }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      createReference({ doi: "10.5555/FICTIONAL-1" }),
      "the same DOI twice",
    ).rejects.toMatchObject({ status: 400 });
    // Admins cannot set the check result themselves.
    const forged = await createReference({
      url: "https://example.org/forged",
      checkStatus: "resolved",
    });
    expect(forged.checkStatus).toBe("pending");
  });

  it("store the worker's result only for the identifiers it checked", async () => {
    const reference = await createReference({ doi: "10.5555/fictional-2" });
    expect(await runReferenceCheck(payload, worker.store, reference.id)).toBe(
      "saved",
    );
    const checked = await payload.findByID({
      collection: "references",
      id: reference.id,
      overrideAccess: true,
    });
    expect(checked).toMatchObject({
      checkStatus: "resolved",
      checkMessage: "DOI: Found in Crossref.",
    });
    expect(checked.checkedAt).toBeTruthy();

    // Editing other fields keeps the result; changing the DOI starts over.
    const retitled = await payload.update({
      collection: "references",
      id: reference.id,
      data: { title: "Fictional reference, retitled" },
      user: admin,
      overrideAccess: false,
    });
    expect(retitled.checkStatus).toBe("resolved");
    const oldJob = {
      referenceId: reference.id,
      requestedAt: retitled.checkRequestedAt ?? "",
      doi: "10.5555/fictional-2",
      isbn: null,
      url: null,
    };
    const changed = await payload.update({
      collection: "references",
      id: reference.id,
      data: { doi: "10.5555/fictional-3" },
      user: admin,
      overrideAccess: false,
    });
    expect(changed.checkStatus).toBe("pending");
    // A late job for the old DOI must not confirm the new one.
    expect(await worker.store.referenceState(oldJob)).toBe("superseded");
    expect(
      await worker.store.saveReferenceCheck(oldJob, {
        status: "resolved",
        message: "stale",
      }),
    ).toBe(false);

    await runReferenceCheck(payload, worker.store, reference.id, {
      bibliography: {
        lookupDoi: async () => ({ found: false }),
        lookupIsbn: async () => ({ found: false }),
      },
      checkUrl: async () => ({ outcome: "resolved" }),
    });
    expect(
      (
        await payload.findByID({
          collection: "references",
          id: reference.id,
          overrideAccess: true,
        })
      ).checkStatus,
    ).toBe("not_found");

    // Saving it again queues a check inside that save's transaction, with a
    // later request time. A worker that runs before the commit still sees
    // the earlier request (with "not found", or the identifiers from before)
    // and must wait rather than drop the job, which would leave the
    // reference "being checked" for ever.
    const stored = await payload.findByID({
      collection: "references",
      id: reference.id,
      overrideAccess: true,
    });
    const storedRequest = Date.parse(stored.checkRequestedAt ?? "");
    const job = (offsetMs: number, doi = "10.5555/fictional-3") => ({
      referenceId: reference.id,
      requestedAt: new Date(storedRequest + offsetMs).toISOString(),
      doi,
      isbn: null,
      url: null,
    });
    expect(await worker.store.referenceState(job(1))).toBe("missing");
    expect(
      await worker.store.referenceState(job(1, "10.5555/fictional-5")),
    ).toBe("missing");
    // The job for the stored request is done; an older one is superseded.
    expect(await worker.store.referenceState(job(0))).toBe("superseded");
    expect(await worker.store.referenceState(job(-1))).toBe("superseded");
  });

  it("can be looked up by DOI or ISBN, by admins only", async () => {
    const fake: Bibliography = {
      lookupDoi: async (doi) =>
        doi === "10.5555/fictional-4"
          ? {
              found: true,
              metadata: {
                source: "Crossref",
                kind: "article",
                title: "A fictional paper",
                authors: ["Ada Example"],
              },
            }
          : { found: false },
      lookupIsbn: async () => {
        throw new SourceUnavailableError(
          "Open Library",
          "did not answer in time",
        );
      },
    };
    globalThis.countryTopicsBibliography = fake;
    const lookup = (search: string, jar = adminJar) =>
      payloadRest(
        "GET",
        ["references", "lookup"],
        jar,
        undefined,
        undefined,
        search,
      );

    const found = await lookup("?doi=doi:10.5555/FICTIONAL-4");
    expect(found.status).toBe(200);
    expect(found.headers.get("cache-control")).toBe("no-store");
    expect(await found.json()).toMatchObject({
      found: true,
      doi: "10.5555/fictional-4",
      metadata: { title: "A fictional paper", authors: ["Ada Example"] },
    });
    expect(await (await lookup("?doi=10.5555/unknown")).json()).toMatchObject({
      found: false,
    });
    expect((await lookup("?doi=not-a-doi")).status).toBe(400);
    const unavailable = await lookup("?isbn=978-0-306-40615-7");
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toMatchObject({
      error: expect.stringMatching(/Open Library did not answer/),
    });
    expect(
      (await lookup("?doi=10.5555/fictional-4", moderatorJar)).status,
    ).toBe(403);
  });

  it("cannot be deleted while a topic or its history cites them", async () => {
    const reference = await confirmedReference(
      "Fictional cited report",
      "https://example.org/cited",
    );
    await createDraft({
      title: "Fictional topic citing a report",
      references: [{ reference, stance: "context", passage: "Quoted." }],
    });
    await expect(
      payload.delete({
        collection: "references",
        id: reference,
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("publishing with evidence", () => {
  it("needs evidence and a confirmed reference when the topic names individuals", async () => {
    const draft = await createDraft({
      title: "Fictional topic naming a person",
      people: [{ individual, role: "subject" }],
    });
    expect(errorPaths(await rejection(publish(draft.id)))).toEqual([
      "evidence",
      "references",
    ]);

    // Linking a person in the text names them too.
    const linked = await createDraft({
      title: "Fictional topic linking a person",
      body: richText(
        linkNode({ relationTo: "individuals", value: individual }),
      ),
    });
    expect(errorPaths(await rejection(publish(linked.id)))).toEqual([
      "evidence",
      "references",
    ]);

    const pending = await createReference({
      title: "Fictional pending report",
      url: "https://example.org/pending",
    });
    const withEvidence = {
      evidence: [
        {
          kind: "link" as const,
          title: "Fictional statement",
          url: "https://example.org/statement",
        },
      ],
      references: [
        {
          reference: pending.id,
          stance: "supports" as const,
          passage: "Quoted.",
        },
      ],
    };
    const unconfirmed = await rejection(publish(draft.id, withEvidence));
    expect(errorPaths(unconfirmed)).toEqual(["references"]);
    expect(JSON.stringify(unconfirmed)).toMatch(
      /Fictional pending report.*still being checked/,
    );

    // A passage is required for every cited reference.
    await runReferenceCheck(payload, worker.store, pending.id);
    await expect(
      publish(draft.id, {
        ...withEvidence,
        references: [
          { reference: pending.id, stance: "supports", passage: "" },
        ],
      }),
    ).rejects.toMatchObject({ status: 400 });
    const published = await publish(draft.id, withEvidence);
    expect(published.state).toBe("published");
  });

  it("keeps only the fields that fit each kind of evidence, and the right file types", async () => {
    const pdf = await upload(
      "evidence-statement.pdf",
      "application/pdf",
      PDF_BYTES,
    );
    const draft = await createDraft({
      title: "Fictional topic with documents",
      evidence: [
        {
          kind: "document",
          title: "Fictional document",
          file: pdf.id,
          url: "https://example.org/stray",
        },
      ],
    });
    expect(draft.evidence?.[0]).toMatchObject({ kind: "document", url: null });

    await expect(
      publish(draft.id, {
        evidence: [{ kind: "image", title: "Not an image", file: pdf.id }],
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      publish(draft.id, { evidence: [{ kind: "link", title: "No link" }] }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      publish(draft.id, {
        evidence: [
          { kind: "link", title: "Unsafe", url: "javascript:alert(1)" },
        ],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("queues evidence links for archiving and keeps the first copy", async () => {
    const url = "https://example.org/archived-statement";
    await createDraft({
      title: "Fictional topic with a web page",
      evidence: [{ kind: "link", title: "Fictional page", url }],
    });
    const job = await worker.queues.links.getJob(linkJobId(url));
    expect(job?.data).toEqual({ url });

    const archive = (timestamp: string): WebArchive => ({
      canCapture: false,
      findSnapshot: async () => ({
        archiveUrl: `https://web.archive.org/web/${timestamp}/${url}`,
        capturedAt: "2026-10-14T12:00:00Z",
      }),
      requestCapture: async () => ({ refused: "unused" }),
      captureStatus: async () => ({ state: "pending" }),
    });
    await processLinkArchive(
      { url },
      { archive: archive("20261014120000"), store: worker.store },
      { isFinal: false },
    );
    // A later run never replaces a copy already found.
    await processLinkArchive(
      { url },
      { archive: archive("20261015120000"), store: worker.store },
      { isFinal: false },
    );
    await worker.store.saveLinkArchive(url, {
      status: "failed",
      archiveUrl: null,
      capturedAt: null,
      message: "late",
    });

    const listed = await payloadRest(
      "GET",
      ["link-archives"],
      moderatorJar,
      undefined,
      undefined,
      `?where[url][equals]=${encodeURIComponent(url)}`,
    );
    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject({
      totalDocs: 1,
      docs: [
        {
          url,
          status: "archived",
          archiveUrl: `https://web.archive.org/web/20261014120000/${url}`,
        },
      ],
    });
    // Archived links are written by the worker only.
    const forged = await payloadRest("POST", ["link-archives"], adminJar, {
      url: "https://example.org/x",
      status: "archived",
    });
    expect(forged.status).toBe(403);

    // Saving again does not queue a link that already has a copy.
    await job?.remove();
    await createDraft({
      title: "Fictional topic reusing the page",
      evidence: [{ kind: "link", title: "Same page", url }],
    });
    expect(await worker.queues.links.getJob(linkJobId(url))).toBeUndefined();
  });

  it("can archive a published topic even if a reference changed since", async () => {
    const reference = await confirmedReference(
      "Fictional report to edit",
      "https://example.org/to-edit",
    );
    const draft = await createDraft({
      title: "Fictional topic to archive",
      people: [{ individual, role: "mentioned" }],
      evidence: [
        {
          kind: "link",
          title: "Fictional page",
          url: "https://example.org/to-archive",
        },
      ],
      references: [{ reference, stance: "supports", passage: "Quoted." }],
    });
    await publish(draft.id);
    await payload.update({
      collection: "references",
      id: reference,
      data: { url: "https://example.org/edited" },
      user: admin,
      overrideAccess: false,
    });
    const archived = await publish(draft.id, {
      archived: true,
      changeNote: "Out of date.",
    });
    expect(archived.state).toBe("archived");
    // Bringing it back is a normal publish and needs the reference confirmed.
    expect(
      errorPaths(
        await rejection(
          publish(draft.id, { archived: false, changeNote: "Back." }),
        ),
      ),
    ).toEqual(["references"]);
  });
});
