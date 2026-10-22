import {
  clipProblems,
  formatTime,
  isLanguageTag,
  LANGUAGE_TAG_MAX_LENGTH,
  parseYouTubeUrl,
  roundToTenths,
  secondsOrNull,
  SNIPPET_CAPTION_MAX_LENGTH,
  SNIPPET_MAX_TIME_S,
  snippetTranscript,
  TRANSCRIPT_MAX_LENGTH,
  TRANSCRIPT_TIMEBASES,
  type TranscriptTimebase,
  VIDEO_LENGTH_TOLERANCE_S,
  YOUTUBE_ID_PATTERN,
} from "@countrytopics/domain";
import type { VideoCheckJob } from "@countrytopics/jobs";
import {
  type CollectionAfterChangeHook,
  type CollectionBeforeChangeHook,
  type CollectionConfig,
  type PayloadRequest,
} from "payload";

import { verifiedAdminsOnly, verifiedStaffOnly } from "@/access";
import { rows } from "@/array-rows";
import { auditHooks, relationId } from "@/audit";
import { queueVideoCheck } from "@/content-jobs";
import { PUBLIC_TAGS, purgeOnChange } from "@/public-cache";
import { reindexTopicsOnChange } from "@/search-index";
import { lockForTransaction } from "@/transaction-lock";

import { refuse } from "./refuse";
import { isUsed, keepWhileUsed, type Usage } from "./topic-references";

/** Where snippets are used as evidence. */
const SNIPPET_USES: Usage[] = [
  { collection: "topics", field: "evidence.snippet" },
  { collection: "individuals", field: "statements.evidence.snippet" },
];

/** A video is asked about again when a snippet of it is saved this long after. */
const VIDEO_RECHECK_AFTER_MS = 24 * 60 * 60 * 1000;
const VIDEO_CHECKS = "videoChecks";

const TIMEBASE_LABELS: Record<TranscriptTimebase, string> = {
  video: "The start of the video",
  clip: "The start of the clip",
};

// Set only by the hook below; never from the request.
const systemField = {
  access: { create: () => false, update: () => false },
} as const;

/** A start the startS field accepts; anything else it reports itself. */
function validStart(value: unknown): number | null {
  const start = secondsOrNull(value);
  return start !== null && start >= 0 && start < SNIPPET_MAX_TIME_S
    ? start
    : null;
}

function timebase(value: unknown): TranscriptTimebase {
  return value === "clip" ? "clip" : "video";
}

/**
 * The video record for a YouTube id, added when it is new. A video that is
 * not known to play, or was last checked a while ago, is marked for a new
 * check; afterChange queues it.
 */
async function videoFor(req: PayloadRequest, youtubeId: string) {
  // Two first saves of the same new video would both try to add it.
  await lockForTransaction(req, [`video:${youtubeId}`]);
  const { docs } = await req.payload.find({
    collection: "videos",
    where: { youtubeId: { equals: youtubeId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  });
  const [existing] = docs;
  if (!existing) {
    return req.payload.create({
      collection: "videos",
      data: {
        youtubeId,
        checkStatus: "pending",
        checkRequestedAt: new Date().toISOString(),
      },
      overrideAccess: true,
      req,
    });
  }
  const checkedAt = existing.checkedAt ? Date.parse(existing.checkedAt) : 0;
  const stale = Date.now() - checkedAt > VIDEO_RECHECK_AFTER_MS;
  // A pending video without a request time (from before it was recorded)
  // could never be matched to a job, so it gets a new request below.
  if (existing.checkStatus === "pending" && existing.checkRequestedAt) {
    return existing;
  }
  if (existing.checkStatus !== "playable" || stale) {
    return req.payload.update({
      collection: "videos",
      id: existing.id,
      data: {
        checkStatus: "pending",
        checkRequestedAt: new Date().toISOString(),
      },
      overrideAccess: true,
      req,
    });
  }
  return existing;
}

/**
 * The video checks this request's snippet saves need, by video id: found in
 * beforeChange and queued in afterChange. Always reached through
 * req.context, because nested local API calls copy the context object.
 */
function videoChecks(req: PayloadRequest): Map<string, VideoCheckJob> {
  const existing: unknown = req.context[VIDEO_CHECKS];
  if (existing instanceof Map) return existing;
  const created = new Map<string, VideoCheckJob>();
  req.context[VIDEO_CHECKS] = created;
  return created;
}

/**
 * Stores what the editor computed, computed again on the server: times in
 * tenths of a second, the transcript's segments inside the clip, and the
 * video record. Runs before field validation, so it skips what validation
 * will refuse anyway.
 */
const prepareSnippet: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  const stored = operation === "update" ? originalDoc : undefined;
  const youtubeId: unknown = data.youtubeId ?? stored?.youtubeId;
  const start_s = secondsOrNull(data.startS ?? stored?.startS);
  const end_s = secondsOrNull(data.endS ?? stored?.endS);
  if (start_s !== null) data.startS = roundToTenths(start_s);
  if (end_s !== null) data.endS = roundToTenths(end_s);

  if (typeof youtubeId === "string" && YOUTUBE_ID_PATTERN.test(youtubeId)) {
    // Topics were published on this clip of this video; another video would
    // be different evidence, which needs its own snippet and checks.
    if (
      stored &&
      stored.youtubeId !== youtubeId &&
      (await isUsed(req, stored.id, SNIPPET_USES))
    ) {
      refuse(
        "snippets",
        req,
        "youtubeId",
        "YouTube video",
        "Topics or profiles use this snippet as evidence, so its video cannot change. Make a new snippet for the other video.",
      );
    }
    const video = await videoFor(req, youtubeId);
    data.video = video.id;
    if (video.checkStatus === "pending" && video.checkRequestedAt) {
      videoChecks(req).set(String(video.id), {
        videoId: String(video.id),
        youtubeId: video.youtubeId,
        requestedAt: video.checkRequestedAt,
      });
    }
    // The length is known once the worker has checked the video with the
    // Data API; the editor's player checks it before that.
    const duration_s = video.durationS ?? null;
    if (
      end_s !== null &&
      duration_s !== null &&
      roundToTenths(end_s) > duration_s + VIDEO_LENGTH_TOLERANCE_S
    ) {
      refuse(
        "snippets",
        req,
        "endS",
        "End",
        `End is past the end of the video (${formatTime(duration_s)}).`,
      );
    }
  }

  // A speaker counts as someone the topics using the snippet name, and a
  // topic that names someone is published only with a reference (ADR 0007).
  // A speaker added later must not slip past that check on topics already
  // published.
  const speaker = relationId(
    "speaker" in data ? data.speaker : stored?.speaker,
  );
  if (stored && speaker && speaker !== relationId(stored.speaker)) {
    const { docs } = await req.payload.find({
      collection: "topics",
      draft: false,
      where: {
        and: [
          { _status: { equals: "published" } },
          { "evidence.snippet": { equals: stored.id } },
        ],
      },
      select: { title: true, references: true },
      pagination: false,
      depth: 0,
      overrideAccess: true,
      req,
    });
    // As the publish check asks: at least one reference, every one confirmed.
    const referenceIds = [
      ...new Set(
        docs.flatMap((topic) =>
          rows(topic.references).flatMap((row) => {
            const id = relationId(row.reference);
            return id ? [id] : [];
          }),
        ),
      ),
    ];
    const { docs: references } =
      referenceIds.length > 0
        ? await req.payload.find({
            collection: "references",
            where: { id: { in: referenceIds } },
            select: { checkStatus: true },
            depth: 0,
            pagination: false,
            overrideAccess: true,
            req,
          })
        : { docs: [] };
    const confirmed = new Set(
      references
        .filter((reference) => reference.checkStatus === "resolved")
        .map((reference) => String(reference.id)),
    );
    const unreferenced = docs.filter((topic) => {
      const cited = rows(topic.references).map((row) =>
        relationId(row.reference),
      );
      return (
        cited.length === 0 || cited.some((id) => !id || !confirmed.has(id))
      );
    });
    if (unreferenced.length > 0) {
      refuse(
        "snippets",
        req,
        "speaker",
        "Speaker",
        `Published topics use this snippet without a confirmed reference: ${unreferenced.map((topic) => `"${topic.title}"`).join(", ")}. Naming a speaker names them in those topics, so give each a confirmed reference and publish it first.`,
      );
    }
  }

  // Present but null clears the transcript; absent keeps the stored one.
  const text: unknown =
    "transcriptText" in data ? data.transcriptText : stored?.transcriptText;
  data.transcript =
    typeof text === "string" && start_s !== null && end_s !== null
      ? snippetTranscript({
          text,
          timebase: timebase(
            data.transcriptTimebase ?? stored?.transcriptTimebase,
          ),
          start_s: roundToTenths(start_s),
          end_s: roundToTenths(end_s),
        }).segments.map((segment) => ({
          startS: segment.start_s,
          endS: segment.end_s,
          text: segment.text,
        }))
      : [];
  return data;
};

/**
 * Asks the worker about the snippet's video when it waits for a check. A
 * video already waiting keeps its request time, and job ids are per request,
 * so saving again re-queues a lost job without adding a duplicate.
 */
const checkVideo: CollectionAfterChangeHook = async ({ doc, req }) => {
  const videoId = relationId(doc.video);
  const job = videoId ? videoChecks(req).get(videoId) : undefined;
  if (!videoId || !job) return;
  videoChecks(req).delete(videoId);
  await queueVideoCheck(req, job);
};

const audit = auditHooks({
  collection: "snippets",
  action: "snippet",
  snapshot: (doc) => ({
    caption: doc.caption,
    youtubeId: doc.youtubeId,
    startS: doc.startS,
    endS: doc.endS,
    speaker: relationId(doc.speaker),
    language: doc.language ?? null,
    transcriptText: doc.transcriptText ?? null,
    transcriptTimebase: doc.transcriptTimebase ?? null,
  }),
});

// F4 snippets: a clip of a YouTube video with the transcript of what is said
// in it. Topics use snippets as evidence; one snippet can back several
// topics, and every edit is kept as a version.
export const Snippets: CollectionConfig = {
  slug: "snippets",
  admin: {
    group: "Content",
    useAsTitle: "caption",
    defaultColumns: ["caption", "speaker", "video", "updatedAt"],
    listSearchableFields: ["caption", "transcriptText"],
    description:
      "Clips of YouTube videos with what is said in them. Topics use them as evidence.",
  },
  defaultSort: "-updatedAt",
  versions: { maxPerDoc: 0 },
  access: {
    read: verifiedStaffOnly,
    readVersions: verifiedStaffOnly,
    create: verifiedAdminsOnly,
    update: verifiedAdminsOnly,
    delete: verifiedAdminsOnly,
  },
  fields: [
    {
      name: "caption",
      type: "text",
      required: true,
      maxLength: SNIPPET_CAPTION_MAX_LENGTH,
      admin: {
        description:
          "What the clip shows, such as 'Minister announces the budget, 3 May 2024'.",
      },
    },
    {
      name: "youtubeId",
      label: "YouTube video",
      type: "text",
      required: true,
      index: true,
      hooks: {
        // A pasted link is stored as its video id.
        beforeValidate: [
          ({ value }) =>
            typeof value === "string"
              ? (parseYouTubeUrl(value)?.id ?? value.trim())
              : value,
        ],
      },
      validate: (value: unknown) =>
        typeof value === "string" && YOUTUBE_ID_PATTERN.test(value)
          ? true
          : "Paste a YouTube link, such as youtube.com/watch?v=… or youtu.be/….",
      admin: { hidden: true },
    },
    {
      name: "startS",
      label: "Start",
      type: "number",
      required: true,
      validate: (value: unknown) =>
        validStart(value) !== null
          ? true
          : "Set the start: a time of 0 or later, such as 95, 1:35, or 1:02:03.",
      admin: { hidden: true },
    },
    {
      name: "endS",
      label: "End",
      type: "number",
      required: true,
      validate: (
        value: unknown,
        { siblingData }: { siblingData: Record<string, unknown> },
      ) => {
        const start_s = validStart(siblingData.startS);
        // An invalid start is reported on its own field.
        if (start_s === null) return true;
        const { errors } = clipProblems({
          start_s,
          end_s: secondsOrNull(value),
        });
        return errors.length > 0 ? errors.join(" ") : true;
      },
      admin: { hidden: true },
    },
    {
      type: "row",
      fields: [
        {
          name: "speaker",
          type: "relationship",
          relationTo: "individuals",
          index: true,
          admin: { description: "Who speaks in the clip, if listed." },
        },
        {
          name: "language",
          type: "text",
          required: true,
          defaultValue: "en",
          maxLength: LANGUAGE_TAG_MAX_LENGTH,
          // Replaces Payload's text check; isLanguageTag checks the length too.
          validate: (value: unknown) =>
            typeof value === "string" && isLanguageTag(value)
              ? true
              : "Use a language code, such as en, sw, or pt-BR.",
          admin: { description: "Of what is said, such as en or sw." },
        },
      ],
    },
    {
      name: "transcriptText",
      label: "Transcript",
      type: "textarea",
      maxLength: TRANSCRIPT_MAX_LENGTH,
      validate: (
        value: unknown,
        { siblingData }: { siblingData: Record<string, unknown> },
      ) => {
        const start_s = validStart(siblingData.startS);
        const end_s = secondsOrNull(siblingData.endS);
        if (typeof value !== "string" || !value.trim()) return true;
        if (value.length > TRANSCRIPT_MAX_LENGTH) {
          return `Keep the transcript to ${TRANSCRIPT_MAX_LENGTH} characters; paste only the part around the clip.`;
        }
        // Without valid times there is no clip to check against; those
        // fields report it.
        if (start_s === null || end_s === null || end_s <= start_s) return true;
        return (
          snippetTranscript({
            text: value,
            timebase: timebase(siblingData.transcriptTimebase),
            start_s,
            end_s,
          }).problem ?? true
        );
      },
      admin: {
        rows: 10,
        description:
          "Optional. Paste lines from YouTube's '…more → Show transcript' panel, lines like '1:35 some text', or an SRT or WebVTT file. Lines outside the clip are left out. Never paste text that was not said in the video.",
      },
    },
    {
      name: "transcriptTimebase",
      label: "Transcript timestamps count from",
      type: "radio",
      required: true,
      defaultValue: "video",
      options: TRANSCRIPT_TIMEBASES.map((value) => ({
        value,
        label: TIMEBASE_LABELS[value],
      })),
      admin: { layout: "horizontal" },
    },
    {
      // The transcript inside the clip, in video time: what visitors see.
      // Computed from the pasted text on every save.
      name: "transcript",
      type: "array",
      ...systemField,
      admin: { hidden: true },
      fields: [
        { name: "startS", type: "number", required: true },
        { name: "endS", type: "number", required: true },
        { name: "text", type: "textarea", required: true },
      ],
    },
    {
      name: "video",
      type: "relationship",
      relationTo: "videos",
      index: true,
      ...systemField,
      admin: {
        readOnly: true,
        position: "sidebar",
        // Set by the server on the first save; an empty box would invite a pick.
        condition: (data) => Boolean(data?.video),
      },
    },
  ],
  hooks: purgeOnChange(PUBLIC_TAGS.snippets, {
    beforeDelete: [keepWhileUsed("snippet", SNIPPET_USES)],
    beforeChange: [prepareSnippet],
    afterChange: [
      checkVideo,
      ...audit.afterChange,
      reindexTopicsOnChange("snippets", {
        searched: (doc) => [
          relationId(doc.speaker),
          doc.language,
          doc.caption,
          rows(doc.transcript).map((line) => line.text),
        ],
        topicsShowing: async (_req, id) => ({
          "evidence.snippet": { equals: id },
        }),
      }),
    ],
    afterDelete: audit.afterDelete,
  }),
};
