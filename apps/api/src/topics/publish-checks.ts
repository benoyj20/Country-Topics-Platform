import { evidenceProblems, type SnippetEvidence } from "@countrytopics/domain";
import type { PayloadRequest } from "payload";

import { rows } from "@/array-rows";
import { relationId } from "@/audit";
import { richTextLinksTo } from "@/editor";
import { snippetEvidence } from "@/snippet-evidence";

// What a topic's evidence and references must be before it is published
// (ADR 0007).

/**
 * The snippets a topic's evidence uses, with their videos' checks, and
 * whether any names a speaker: quoting a person names them (ADR 0007).
 */
async function topicSnippets(
  req: PayloadRequest,
  evidence: unknown,
): Promise<{ snippets: SnippetEvidence[]; quotesSomeone: boolean }> {
  const snippetIds = [
    ...new Set(
      rows(evidence).flatMap((row) => {
        const id = row.kind === "snippet" ? relationId(row.snippet) : null;
        return id ? [id] : [];
      }),
    ),
  ];
  if (snippetIds.length === 0) return { snippets: [], quotesSomeone: false };
  const { docs: snippets } = await req.payload.find({
    collection: "snippets",
    where: { id: { in: snippetIds } },
    select: { caption: true, endS: true, video: true, speaker: true },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
  });
  const videoIds = snippets.flatMap((snippet) => {
    const id = relationId(snippet.video);
    return id ? [id] : [];
  });
  const { docs: videos } =
    videoIds.length > 0
      ? await req.payload.find({
          collection: "videos",
          where: { id: { in: videoIds } },
          select: { checkStatus: true, confirmedAt: true, durationS: true },
          pagination: false,
          depth: 0,
          overrideAccess: true,
          req,
        })
      : { docs: [] };
  const videosById = new Map(videos.map((video) => [String(video.id), video]));
  const snippetsById = new Map(
    snippets.map((snippet) => [String(snippet.id), snippet]),
  );
  return {
    snippets: snippetIds.map((id) => {
      const snippet = snippetsById.get(id);
      return snippetEvidence(
        snippet,
        videosById.get(relationId(snippet?.video) ?? ""),
      );
    }),
    quotesSomeone: snippets.some((snippet) => relationId(snippet.speaker)),
  };
}

/**
 * Why the topic's evidence does not allow publishing: it names individuals
 * without evidence or a reference, or cites references that are not confirmed.
 */
export async function evidenceErrors(
  req: PayloadRequest,
  topic: Record<string, unknown>,
) {
  const citedIds = [
    ...new Set(
      rows(topic.references).flatMap((row) => {
        const id = relationId(row.reference);
        return id ? [id] : [];
      }),
    ),
  ];
  const { docs } =
    citedIds.length > 0
      ? await req.payload.find({
          collection: "references",
          where: { id: { in: citedIds } },
          select: { title: true, checkStatus: true },
          pagination: false,
          depth: 0,
          overrideAccess: true,
          req,
        })
      : { docs: [] };
  const cited = new Map(docs.map((doc) => [String(doc.id), doc]));
  const { snippets, quotesSomeone } = await topicSnippets(req, topic.evidence);
  return evidenceProblems({
    namesIndividuals:
      rows(topic.people).length > 0 ||
      richTextLinksTo(topic.body, "individuals") ||
      quotesSomeone,
    evidenceCount: rows(topic.evidence).length,
    references: citedIds.map((id) => ({
      title: cited.get(id)?.title ?? "Unknown reference",
      checkStatus: cited.get(id)?.checkStatus ?? null,
    })),
    snippets,
  }).map(({ field, message }) => ({
    path: field,
    label: field === "evidence" ? "Evidence" : "References",
    message,
  }));
}
