import {
  clipProblems,
  formatTime,
  parseYouTubeUrl,
  roundToTenths,
  secondsOrNull,
  SNIPPET_MAX_TIME_S,
  snippetTranscript,
  TRANSCRIPT_MAX_LENGTH,
  TRANSCRIPT_TIMEBASES,
  type TranscriptTimebase,
  VIDEO_LENGTH_TOLERANCE_S,
  YOUTUBE_ID_PATTERN,
} from "@countrytopics/domain";
import {
  type CollectionAfterChangeHook,
  type CollectionBeforeChangeHook,
  type CollectionConfig,
  type PayloadRequest,
  ValidationError,
} from "payload";

import { verifiedAdminsOnly, verifiedStaffOnly } from "@/access";
import { auditHooks, relationId } from "@/audit";
import { queueVideoCheck } from "@/content-jobs";
import { lockForTransaction } from "@/transaction-lock";

import { isUsed, keepWhileUsedByTopics } from "./topic-references";

/** A video is asked about again when a snippet of it is saved this long after. */
const VIDEO_RECHECK_AFTER_MS = 24 * 60 * 60 * 1000;
const LANGUAGE_TAG = /^[a-z]{2,3}(-[a-z0-9]{1,8})*$/i;
const LANGUAGE_MAX_LENGTH = 35;

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
      data: { youtubeId, checkStatus: "pending" },
      overrideAccess: true,
      req,
    });
  }
  const checkedAt = existing.checkedAt ? Date.parse(existing.checkedAt) : 0;
  const stale = Date.now() - checkedAt > VIDEO_RECHECK_AFTER_MS;
  if (existing.checkStatus === "pending") return existing;
  if (existing.checkStatus !== "playable" || stale) {
    return req.payload.update({
      collection: "videos",
      id: existing.id,
      data: { checkStatus: "pending" },
      overrideAccess: true,
      req,
    });
  }
  return existing;
}

function refuse(
  req: PayloadRequest,
  path: string,
  label: string,
  message: string,
): never {
  throw new ValidationError({
    collection: "snippets",
    errors: [{ path, label, message }],
    req,
  });
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
      (await isUsed(req, stored.id, [
        { collection: "topics", field: "evidence.snippet" },
      ]))
    ) {
      refuse(
        req,
        "youtubeId",
        "YouTube video",
        "Topics use this snippet, so its video cannot change. Make a new snippet for the other video.",
      );
    }
    const video = await videoFor(req, youtubeId);
    data.video = video.id;
    // The length is known once the worker has checked the video with the
    // Data API; the editor's player checks it before that.
    const duration_s = video.durationS ?? null;
    if (
      end_s !== null &&
      duration_s !== null &&
      roundToTenths(end_s) > duration_s + VIDEO_LENGTH_TOLERANCE_S
    ) {
      refuse(
        req,
        "endS",
        "End",
        `End is past the end of the video (${formatTime(duration_s)}).`,
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

/** Asks the worker about the snippet's video when it waits for a check. */
const checkVideo: CollectionAfterChangeHook = async ({ doc, req }) => {
  const videoId = relationId(doc.video);
  if (!videoId) return;
  const video = await req.payload.findByID({
    collection: "videos",
    id: videoId,
    depth: 0,
    select: { youtubeId: true, checkStatus: true },
    overrideAccess: true,
    req,
  });
  if (video.checkStatus === "pending") {
    await queueVideoCheck(req, { videoId, youtubeId: video.youtubeId });
  }
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
      maxLength: 200,
      admin: {
        description:
          "What the clip shows, such as 'Minister announces the budget, 3 May 2024'.",
      },
    },
    {
      // The clip editor: the YouTube link, the player, and the clip's times.
      // It edits the three hidden fields below.
      name: "clipEditor",
      type: "ui",
      admin: {
        components: { Field: "/components/admin/SnippetEditor#SnippetEditor" },
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
          maxLength: LANGUAGE_MAX_LENGTH,
          // Replaces Payload's text check, so the length is checked here too.
          validate: (value: unknown) =>
            typeof value === "string" &&
            value.length <= LANGUAGE_MAX_LENGTH &&
            LANGUAGE_TAG.test(value)
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
      name: "transcriptSummary",
      type: "ui",
      admin: {
        components: {
          Field: "/components/admin/TranscriptSummary#TranscriptSummary",
        },
      },
    },
    {
      name: "preview",
      type: "ui",
      admin: {
        components: {
          Field: "/components/admin/SnippetPreview#SnippetPreview",
        },
      },
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
    {
      name: "videoStatus",
      type: "ui",
      admin: {
        position: "sidebar",
        components: {
          Field: "/components/admin/VideoCheckStatus#VideoCheckStatus",
        },
      },
    },
  ],
  hooks: {
    beforeDelete: [keepWhileUsedByTopics("evidence.snippet", "snippet")],
    beforeChange: [prepareSnippet],
    afterChange: [checkVideo, ...audit.afterChange],
    afterDelete: audit.afterDelete,
  },
};
