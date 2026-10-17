import { videoJobId } from "@countrytopics/jobs";
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
  fakeYouTube,
  richText,
  runReferenceCheck,
  runVideoCheck,
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

// Every snippet, video, transcript, and person here is made up for the
// tests. Video ids are well-formed but invented (TEST…), and YouTube is
// never called: the worker's checks run with a fake.
let payload: Payload;
let stopEmailWorker: (() => Promise<void>) | undefined;
let worker: Awaited<ReturnType<typeof workerSide>>;
let admin: User;
let unverifiedAdmin: User;
let adminJar: CookieJar;
let moderatorJar: CookieJar;
let kenya: string;
let individual: string;

type SnippetInput = RequiredDataFromCollectionSlug<"snippets">;
type TopicInput = RequiredDataFromCollectionSlug<"topics">;

const TRANSCRIPT = [
  "Transcript",
  "0:05",
  "5 seconds",
  "TEST line before the clip",
  "0:12",
  "TEST line inside the clip",
  "0:18",
  "TEST second line inside",
  "0:25",
  "TEST line after the clip",
].join("\n");

function createSnippet(data: Partial<SnippetInput>, user: User = admin) {
  return payload.create({
    collection: "snippets",
    // The server fills in the video and the transcript segments.
    data: {
      caption: "TEST snippet",
      youtubeId: "TESTsnip001",
      startS: 10,
      endS: 20,
      language: "en",
      transcriptTimebase: "video",
      ...data,
    },
    user,
    overrideAccess: false,
  });
}

function updateSnippet(id: string, data: Partial<SnippetInput>) {
  return payload.update({
    collection: "snippets",
    id,
    data,
    user: admin,
    overrideAccess: false,
  });
}

async function videoOf(snippet: { video?: unknown }) {
  const id =
    typeof snippet.video === "string"
      ? snippet.video
      : z.object({ id: z.string() }).parse(snippet.video).id;
  return payload.findByID({
    collection: "videos",
    id,
    depth: 0,
    overrideAccess: true,
  });
}

async function waitingVideoJobs() {
  return worker.queues.videos.getJobs(["waiting", "delayed"]);
}

const validationError = z.object({
  data: z.object({ errors: z.array(z.object({ path: z.string() })) }),
});

async function refusedPaths(promise: Promise<unknown>): Promise<string[]> {
  try {
    await promise;
  } catch (error) {
    return validationError.parse(error).data.errors.map((entry) => entry.path);
  }
  throw new Error("Expected the save to be refused");
}

async function auditActions(targetId: string): Promise<string[]> {
  const { docs } = await payload.find({
    collection: "audit-log",
    where: { targetId: { equals: targetId } },
    sort: "createdAt",
    overrideAccess: true,
  });
  return docs.map((doc) => doc.action);
}

beforeAll(async () => {
  payload = await getPayload({ config });
  stopEmailWorker = startEmailWorker();
  worker = await workerSide();
  admin = await staffProfile(payload, "snippet-admin", "admin");
  unverifiedAdmin = await staffProfile(
    payload,
    "snippet-unverified",
    "admin",
    false,
  );
  await staffProfile(payload, "snippet-moderator", "moderator");
  adminJar = await signInAsVerifiedStaff(testEmail("snippet-admin"));
  moderatorJar = await signInAsVerifiedStaff(testEmail("snippet-moderator"));
  kenya = await countryId(payload, "KE");
  const person = await payload.create({
    collection: "individuals",
    data: { name: "Snippet Testperson Gamma", slug: "", notADuplicate: true },
    overrideAccess: true,
  });
  individual = person.id;
});

afterAll(async () => {
  await worker?.close();
  await stopEmailWorker?.();
  await payload?.destroy();
});

describe("snippets", () => {
  it("store a pasted link as its video id, add the video once, and queue one check", async () => {
    const first = await createSnippet({
      youtubeId: "https://youtu.be/TESTsnip001?t=10",
      speaker: individual,
    });
    expect(first.youtubeId).toBe("TESTsnip001");
    const video = await videoOf(first);
    expect(video).toMatchObject({
      youtubeId: "TESTsnip001",
      checkStatus: "pending",
      title: null,
      confirmedAt: null,
    });

    const second = await createSnippet({
      caption: "TEST second snippet of the same video",
      youtubeId: "https://www.youtube.com/watch?v=TESTsnip001",
    });
    expect((await videoOf(second)).id).toBe(video.id);
    const jobs = (await waitingVideoJobs()).filter(
      (job) => job.id === videoJobId(video.id),
    );
    expect(jobs.map((job) => job.data)).toEqual([
      {
        videoId: video.id,
        youtubeId: "TESTsnip001",
        requestedAt: video.checkRequestedAt,
      },
    ]);
    // The worker recognises the queued job as the one the video waits for.
    expect(await worker.store.videoState(jobs[0]?.data)).toBe("pending");
    expect(await auditActions(first.id)).toEqual(["snippet.created"]);
    expect(await auditActions(video.id)).toEqual(["video.created"]);
  });

  it("keep the transcript lines inside the clip, in video time", async () => {
    const snippet = await createSnippet({
      youtubeId: "TESTsnip002",
      startS: 10.04,
      endS: 20,
      transcriptText: TRANSCRIPT,
    });
    expect(snippet.startS).toBe(10);
    expect(
      snippet.transcript?.map(({ startS, endS, text }) => ({
        startS,
        endS,
        text,
      })),
    ).toEqual([
      // It began before the clip; the player starts it at the clip's start.
      { startS: 5, endS: 12, text: "TEST line before the clip" },
      { startS: 12, endS: 18, text: "TEST line inside the clip" },
      { startS: 18, endS: 20, text: "TEST second line inside" },
    ]);

    // Timestamps that count from the clip's start are moved to video time.
    const relative = await updateSnippet(snippet.id, {
      transcriptText: "0:00 TEST first\n0:04.5 TEST second",
      transcriptTimebase: "clip",
    });
    expect(
      relative.transcript?.map(({ startS, endS }) => [startS, endS]),
    ).toEqual([
      [10, 14.5],
      [14.5, 20],
    ]);

    // Moving the clip recomputes the segments from the stored text.
    const moved = await updateSnippet(snippet.id, { startS: 12 });
    expect(moved.transcript?.[0]).toMatchObject({ startS: 12, endS: 16.5 });

    // No transcript is allowed and stays distinct from a wrong one.
    const cleared = await updateSnippet(snippet.id, { transcriptText: "" });
    expect(cleared.transcript).toEqual([]);
    // Its timestamps count from the clip's start (12 s) here.
    await updateSnippet(snippet.id, { transcriptText: "0:01 TEST line" });
    const nulled = await updateSnippet(snippet.id, { transcriptText: null });
    expect(nulled.transcript).toEqual([]);
    expect(
      await refusedPaths(
        updateSnippet(snippet.id, { transcriptText: "no timestamps here" }),
      ),
    ).toEqual(["transcriptText"]);
    expect(
      await refusedPaths(
        updateSnippet(snippet.id, {
          transcriptText: "0:40 TEST line after the clip",
          transcriptTimebase: "video",
        }),
      ),
    ).toEqual(["transcriptText"]);
    expect(await auditActions(snippet.id)).toContain("snippet.updated");
  });

  it("refuse impossible clips and links that are not YouTube videos", async () => {
    expect(
      await refusedPaths(
        createSnippet({ youtubeId: "https://vimeo.com/123", startS: 1 }),
      ),
    ).toEqual(["youtubeId"]);
    expect(
      await refusedPaths(
        createSnippet({ youtubeId: "TESTsnip003", startS: 20, endS: 20 }),
      ),
    ).toEqual(["endS"]);
    expect(
      await refusedPaths(
        createSnippet({ youtubeId: "TESTsnip003", startS: -1, endS: 5 }),
      ),
    ).toEqual(["startS"]);
    for (const language of ["not a tag", `en${"-abcdefgh".repeat(10)}`]) {
      expect(
        await refusedPaths(
          createSnippet({ youtubeId: "TESTsnip003", language }),
        ),
      ).toEqual(["language"]);
    }
    // A refused save adds no video.
    const { totalDocs } = await payload.count({
      collection: "videos",
      where: { youtubeId: { equals: "TESTsnip003" } },
      overrideAccess: true,
    });
    expect(totalDocs).toBe(0);

    // Once the worker knows the video's length, the clip must fit in it.
    const snippet = await createSnippet({ youtubeId: "TESTsnip004" });
    const video = await videoOf(snippet);
    await runVideoCheck(
      payload,
      worker.store,
      video.id,
      fakeYouTube({ duration_s: 60 }),
    );
    // The Data API reports whole seconds, so a clip may end up to 1 s past.
    await expect(
      updateSnippet(snippet.id, { endS: 60.9 }),
    ).resolves.toBeTruthy();
    expect(
      await refusedPaths(updateSnippet(snippet.id, { endS: 61.5 })),
    ).toEqual(["endS"]);
  });

  it("are written by verified admins only; staff can read them", async () => {
    const snippet = await createSnippet({ youtubeId: "TESTsnip005" });
    await expect(
      createSnippet({ youtubeId: "TESTsnip005" }, unverifiedAdmin),
    ).rejects.toMatchObject({ status: 403 });

    const read = await payloadRest(
      "GET",
      ["snippets", snippet.id],
      moderatorJar,
    );
    expect(read.status).toBe(200);
    const write = await payloadRest("POST", ["snippets"], moderatorJar, {
      caption: "TEST",
      youtubeId: "TESTsnip005",
      startS: 0,
      endS: 5,
    });
    expect(write.status).toBe(403);
    const anonymous = await payloadRest(
      "GET",
      ["snippets", snippet.id],
      new CookieJar(),
    );
    expect(anonymous.status).toBe(403);
  });
});

describe("videos", () => {
  it("store the worker's check while one is awaited, keeping the first time playable", async () => {
    const snippet = await createSnippet({ youtubeId: "TESTsnip006" });
    const { id } = await videoOf(snippet);
    expect(await runVideoCheck(payload, worker.store, id)).toBe("saved");
    const checked = await payload.findByID({
      collection: "videos",
      id,
      overrideAccess: true,
    });
    expect(checked).toMatchObject({
      checkStatus: "playable",
      title: "A synthetic clip",
      channel: "Test Channel",
      durationS: 60,
    });
    expect(checked.checkedAt).toBeTruthy();
    expect(checked.confirmedAt).toBeTruthy();

    // A late or repeated job changes nothing once the video is checked.
    expect(await runVideoCheck(payload, worker.store, id)).toBe("superseded");
    // A job for a later request, queued by a save that has not committed
    // yet, waits for it instead of being dropped; the stored request's job
    // and older ones are done.
    const storedRequest = Date.parse(checked.checkRequestedAt ?? "");
    const job = (offsetMs: number) => ({
      videoId: id,
      youtubeId: "TESTsnip006",
      requestedAt: new Date(storedRequest + offsetMs).toISOString(),
    });
    expect(await worker.store.videoState(job(1))).toBe("missing");
    expect(await worker.store.videoState(job(0))).toBe("superseded");
    expect(await worker.store.videoState(job(-1))).toBe("superseded");
    // Saving a snippet of a recently confirmed video queues no new check.
    await worker.queues.videos.obliterate({ force: true });
    await updateSnippet(snippet.id, { caption: "TEST snippet, renamed" });
    expect(await waitingVideoJobs()).toEqual([]);

    // A later check that finds it gone keeps what was known about it.
    await payload.update({
      collection: "videos",
      id,
      data: { checkStatus: "pending" },
      overrideAccess: true,
    });
    await runVideoCheck(
      payload,
      worker.store,
      id,
      fakeYouTube({
        status: "unavailable",
        title: null,
        channel: null,
        duration_s: null,
        message: "Removed.",
      }),
    );
    const gone = await payload.findByID({
      collection: "videos",
      id,
      overrideAccess: true,
    });
    expect(gone).toMatchObject({
      checkStatus: "unavailable",
      checkMessage: "Removed.",
      title: "A synthetic clip",
      durationS: 60,
      confirmedAt: checked.confirmedAt,
    });

    // Saving a snippet of a video that does not play asks again.
    await updateSnippet(snippet.id, { caption: "TEST snippet, saved again" });
    expect(
      (
        await payload.findByID({
          collection: "videos",
          id,
          overrideAccess: true,
        })
      ).checkStatus,
    ).toBe("pending");
    expect((await waitingVideoJobs()).map((job) => job.id)).toEqual([
      videoJobId(id),
    ]);
  });

  it("cannot be written through requests, and snippets cannot pick their video", async () => {
    const snippet = await createSnippet({ youtubeId: "TESTsnip007" });
    const video = await videoOf(snippet);
    const forged = await payloadRest("PATCH", ["videos", video.id], adminJar, {
      checkStatus: "playable",
      confirmedAt: new Date().toISOString(),
    });
    expect(forged.status).toBe(403);
    const created = await payloadRest("POST", ["videos"], adminJar, {
      youtubeId: "TESTsnip008",
      checkStatus: "playable",
    });
    expect(created.status).toBe(403);

    // The video and the segments always come from the snippet's own fields.
    const other = await createSnippet({ youtubeId: "TESTsnip009" });
    const pointed = await updateSnippet(other.id, {
      video: video.id,
      transcript: [{ startS: 0, endS: 1, text: "forged" }],
    });
    expect((await videoOf(pointed)).youtubeId).toBe("TESTsnip009");
    expect(pointed.transcript).toEqual([]);
    expect(
      (
        await payload.findByID({
          collection: "videos",
          id: video.id,
          overrideAccess: true,
        })
      ).checkStatus,
    ).toBe("pending");
  });

  it("cannot be deleted while a snippet uses them; snippets and speakers likewise", async () => {
    const snippet = await createSnippet({
      youtubeId: "TESTsnip010",
      speaker: individual,
    });
    const video = await videoOf(snippet);
    await expect(
      payload.delete({
        collection: "videos",
        id: video.id,
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      payload.delete({
        collection: "individuals",
        id: individual,
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 409 });

    await payload.create({
      collection: "topics",
      data: {
        title: "TEST topic using a snippet",
        slug: "",
        summary: "A fictional topic for the tests.",
        body: richText("Fictional text for the tests."),
        countries: [kenya],
        evidence: [{ kind: "snippet", snippet: snippet.id }],
      } as TopicInput,
      draft: true,
      user: admin,
      overrideAccess: false,
    });
    await expect(
      payload.delete({
        collection: "snippets",
        id: snippet.id,
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 409 });
    // Nor can its video change; its clip and transcript still can.
    expect(
      await refusedPaths(
        updateSnippet(snippet.id, { youtubeId: "TESTsnip012" }),
      ),
    ).toEqual(["youtubeId"]);
    await expect(updateSnippet(snippet.id, { endS: 15 })).resolves.toBeTruthy();
  });
});

describe("snippets as topic evidence", () => {
  it("count once their video was confirmed playable", async () => {
    const snippet = await createSnippet({
      youtubeId: "TESTsnip011",
      caption: "TEST minister's statement",
    });
    const reference = await payload.create({
      collection: "references",
      data: {
        title: "Fictional report for snippets",
        kind: "report",
        url: "https://example.org/snippet-report",
        checkStatus: "pending",
      },
      user: admin,
      overrideAccess: false,
    });
    await runReferenceCheck(payload, worker.store, reference.id);

    const draft = await payload.create({
      collection: "topics",
      data: {
        title: "TEST topic backed by a snippet",
        slug: "",
        summary: "A fictional topic for the tests.",
        body: richText("Fictional text for the tests."),
        countries: [kenya],
        people: [{ individual, role: "speaker" }],
        // A snippet needs no title of its own; stray fields are cleared.
        evidence: [
          {
            kind: "snippet",
            snippet: snippet.id,
            url: "https://example.org/stray",
          },
        ],
        references: [
          { reference: reference.id, stance: "supports", passage: "Quoted." },
        ],
      } as TopicInput,
      draft: true,
      user: admin,
      overrideAccess: false,
    });
    expect(draft.evidence?.[0]).toMatchObject({
      kind: "snippet",
      url: null,
      file: null,
    });

    const publish = () =>
      payload.update({
        collection: "topics",
        id: draft.id,
        data: { _status: "published" },
        user: admin,
        overrideAccess: false,
      });
    let refusal: unknown;
    try {
      await publish();
    } catch (error) {
      refusal = error;
    }
    expect(
      validationError.parse(refusal).data.errors.map((e) => e.path),
    ).toEqual(["evidence"]);
    expect(JSON.stringify(refusal)).toMatch(
      /TEST minister's statement.*its video is still being checked/,
    );

    await runVideoCheck(payload, worker.store, (await videoOf(snippet)).id);
    expect((await publish()).state).toBe("published");

    // A snippet row without its snippet is refused, as is an overlong title.
    await expect(
      payload.update({
        collection: "topics",
        id: draft.id,
        data: {
          _status: "published",
          changeNote: "TEST change",
          evidence: [
            { kind: "snippet", snippet: snippet.id, title: "x".repeat(201) },
          ],
        },
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      payload.update({
        collection: "topics",
        id: draft.id,
        data: {
          _status: "published",
          changeNote: "TEST change",
          evidence: [{ kind: "snippet" }],
        },
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
