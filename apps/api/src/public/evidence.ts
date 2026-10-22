import type { Licence, SnippetEvidence } from "@countrytopics/domain";
import type { Payload } from "payload";

import { rows } from "@/array-rows";
import { relationId } from "@/audit";
import type {
  LinkArchive,
  Media,
  Reference,
  Snippet,
  Topic,
  Video,
} from "@/payload-types";
import { snippetEvidence } from "@/snippet-evidence";

import { byId, ids, type Named } from "./read";
import type {
  CitedReference,
  PublicEvidence,
  PublicFile,
  PublicReference,
  PublicSnippet,
} from "./types";

// Evidence and references as visitors see them, on topics and on
// profiles (read.ts).

export function publicFile(media: Media): PublicFile | null {
  if (!media.filename || !media.mimeType) return null;
  return {
    url: `/files/${media.id}`,
    filename: media.filename,
    mimeType: media.mimeType,
    filesize: media.filesize ?? null,
    width: media.width ?? null,
    height: media.height ?? null,
    alt: media.alt,
    licence: media.licence satisfies Licence,
    credit: media.credit ?? null,
    sourceUrl: media.sourceUrl ?? null,
    focalX: media.focalX ?? null,
    focalY: media.focalY ?? null,
  };
}

export const FILE_FIELDS = {
  filename: true,
  mimeType: true,
  filesize: true,
  width: true,
  height: true,
  alt: true,
  licence: true,
  credit: true,
  sourceUrl: true,
  focalX: true,
  focalY: true,
} as const;

type SnippetFields = Pick<
  Snippet,
  | "id"
  | "caption"
  | "youtubeId"
  | "startS"
  | "endS"
  | "speaker"
  | "language"
  | "transcript"
  | "video"
>;
type VideoFields = Pick<
  Video,
  | "id"
  | "title"
  | "channel"
  | "checkStatus"
  | "checkMessage"
  | "confirmedAt"
  | "durationS"
>;

/** A snippet as visitors see it, and the facts the evidence rule checks. */
type ResolvedSnippet = {
  snippet: PublicSnippet;
  check: SnippetEvidence;
  speakerId: string | null;
};

const UNAVAILABLE_MESSAGE = "YouTube no longer plays this video here.";

async function snippetsById(
  payload: Payload,
  idList: string[],
): Promise<Map<string, ResolvedSnippet>> {
  if (idList.length === 0) return new Map();
  const { docs } = await payload.find({
    collection: "snippets",
    where: { id: { in: idList } },
    select: {
      caption: true,
      youtubeId: true,
      startS: true,
      endS: true,
      speaker: true,
      language: true,
      transcript: true,
      video: true,
    },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  const snippets = docs as SnippetFields[];
  const videoIds = ids(snippets.map((snippet) => snippet.video));
  const { docs: videoDocs } =
    videoIds.length > 0
      ? await payload.find({
          collection: "videos",
          where: { id: { in: videoIds } },
          select: {
            title: true,
            channel: true,
            checkStatus: true,
            checkMessage: true,
            confirmedAt: true,
            durationS: true,
          },
          depth: 0,
          pagination: false,
          overrideAccess: true,
        })
      : { docs: [] };
  const videos = new Map(
    (videoDocs as VideoFields[]).map((video) => [String(video.id), video]),
  );
  const speakers = await byId<Named>(
    payload,
    "individuals",
    ids(snippets.map((snippet) => snippet.speaker)),
    { name: true, slug: true },
  );
  return new Map(
    snippets.map((snippet) => {
      const video = videos.get(relationId(snippet.video) ?? "");
      const speaker = speakers.get(relationId(snippet.speaker) ?? "");
      const gone =
        video?.checkStatus === "unavailable" ||
        video?.checkStatus === "not_embeddable";
      const resolved: ResolvedSnippet = {
        snippet: {
          youtubeId: snippet.youtubeId,
          start_s: snippet.startS,
          end_s: snippet.endS,
          caption: snippet.caption,
          speaker: speaker ? { name: speaker.name, slug: speaker.slug } : null,
          language: snippet.language,
          segments: rows(snippet.transcript).map((segment) => ({
            start_s: segment.startS,
            end_s: segment.endS,
            text: segment.text,
          })),
          videoTitle: video?.title ?? null,
          channel: video?.channel ?? null,
          videoUnavailable: gone
            ? (video?.checkMessage ?? UNAVAILABLE_MESSAGE)
            : null,
        },
        check: snippetEvidence(snippet, video),
        speakerId: speaker ? String(speaker.id) : null,
      };
      return [String(snippet.id), resolved];
    }),
  );
}

type EvidenceRow = NonNullable<Topic["evidence"]>[number];

/**
 * Each evidence row as visitors see it, in the same positions: null for a
 * row whose file or snippet is gone. Snippet rows also carry what the
 * evidence rule checks.
 */
export async function resolveEvidence(
  payload: Payload,
  evidence: EvidenceRow[],
): Promise<
  {
    item: PublicEvidence | null;
    check: SnippetEvidence | null;
    speakerId?: string | null;
  }[]
> {
  const urls = evidence.flatMap((row) =>
    row.kind === "link" && row.url ? [row.url] : [],
  );
  const [files, snippets, { docs: archiveDocs }] = await Promise.all([
    byId<Media>(
      payload,
      "media",
      ids(evidence.map((row) => row.file)),
      FILE_FIELDS,
    ),
    snippetsById(payload, ids(evidence.map((row) => row.snippet))),
    urls.length > 0
      ? payload.find({
          collection: "link-archives",
          where: { url: { in: urls }, status: { equals: "archived" } },
          select: { url: true, archiveUrl: true, capturedAt: true },
          depth: 0,
          pagination: false,
          overrideAccess: true,
        })
      : Promise.resolve({ docs: [] }),
  ]);
  const archives = new Map(
    (archiveDocs as Pick<LinkArchive, "url" | "archiveUrl" | "capturedAt">[])
      .filter((doc) => doc.archiveUrl)
      .map((doc) => [doc.url, doc]),
  );

  return evidence.map((row) => {
    const base = { title: row.title || null, note: row.note || null };
    if (row.kind === "snippet") {
      const found = snippets.get(relationId(row.snippet) ?? "");
      return found
        ? {
            item: { ...base, kind: "snippet", snippet: found.snippet },
            check: found.check,
            speakerId: found.speakerId,
          }
        : { item: null, check: null };
    }
    if (row.kind === "link") {
      if (!row.url) return { item: null, check: null };
      const archive = archives.get(row.url);
      return {
        item: {
          ...base,
          kind: "link",
          url: row.url,
          archive: archive?.archiveUrl
            ? {
                url: archive.archiveUrl,
                capturedAt: archive.capturedAt ?? null,
              }
            : null,
          otherArchiveUrl: row.archiveUrl || null,
        },
        check: null,
      };
    }
    const media = files.get(relationId(row.file) ?? "");
    const file = media ? publicFile(media) : null;
    return {
      item: file ? { ...base, kind: row.kind, file } : null,
      check: null,
    };
  });
}

export async function evidenceOf(
  payload: Payload,
  evidence: EvidenceRow[],
): Promise<PublicEvidence[]> {
  return (await resolveEvidence(payload, evidence)).flatMap(({ item }) =>
    item ? [item] : [],
  );
}

export function publicReference(reference: Reference): PublicReference {
  return {
    kind: reference.kind,
    title: reference.title,
    authors: (reference.authors ?? "")
      .split("\n")
      .map((author) => author.trim())
      .filter(Boolean),
    containerTitle: reference.containerTitle ?? null,
    publisher: reference.publisher ?? null,
    publishedDate: reference.publishedDate ?? null,
    doi: reference.doi ?? null,
    isbn: reference.isbn ?? null,
    url: reference.url ?? null,
  };
}

/** References by id, with what citations show and their check status. */
export async function referencesById(
  payload: Payload,
  referenceIds: string[],
): Promise<Map<string, Reference>> {
  if (referenceIds.length === 0) return new Map();
  const { docs } = await payload.find({
    collection: "references",
    where: { id: { in: referenceIds } },
    select: {
      kind: true,
      title: true,
      authors: true,
      containerTitle: true,
      publisher: true,
      publishedDate: true,
      doi: true,
      isbn: true,
      url: true,
      checkStatus: true,
    },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  return new Map((docs as Reference[]).map((doc) => [String(doc.id), doc]));
}

export async function referencesOf(
  payload: Payload,
  cited: NonNullable<Topic["references"]>,
): Promise<CitedReference[]> {
  const references = await referencesById(
    payload,
    ids(cited.map((row) => row.reference)),
  );
  return cited.flatMap((row) => {
    const reference = references.get(relationId(row.reference) ?? "");
    return reference
      ? [
          {
            stance: row.stance,
            passage: row.passage,
            locator: row.locator || null,
            reference: publicReference(reference),
          },
        ]
      : [];
  });
}
