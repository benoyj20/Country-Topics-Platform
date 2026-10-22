import { loadPayload } from "@/payload-instance";
import type { Media } from "@/payload-types";

import { FILE_FIELDS, publicFile } from "./evidence";
import { anyNamed, backedStatements, type WithStatements } from "./individuals";
import { namingTopics } from "./naming";
import { PUBLISHED } from "./read";
import type { PublicFile } from "./types";

// The files visitors may download, at /files/<id> (read.ts).

/** What the storage plugin needs to find a file: its record's storage fields. */
export type StoredFile = Pick<Media, "id" | "filename" | "_objectKey">;

/**
 * The record of a file visitors may download, or null: it must be evidence
 * in a published topic, or the photo of a public individual.
 */
export async function loadPublicFile(
  id: string,
): Promise<{ file: PublicFile; stored: StoredFile } | null> {
  const payload = await loadPayload();
  const media = (await payload.findByID({
    collection: "media",
    id,
    select: { ...FILE_FIELDS, _objectKey: true },
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
  })) as Media | null;
  const file = media ? publicFile(media) : null;
  if (!media || !file) return null;

  const evidence = await payload.count({
    collection: "topics",
    where: { and: [PUBLISHED, { "evidence.file": { equals: id } }] },
    overrideAccess: true,
  });
  let isPublic = evidence.totalDocs > 0;
  if (!isPublic) {
    // Evidence in a profile statement counts only while that statement is
    // shown: backed, on the profile of a public individual. Filtering to
    // the individuals with such a statement first lets one query ask
    // whether any of them is public.
    const { docs: citing } = await payload.find({
      collection: "individuals",
      where: { "statements.evidence.file": { equals: id } },
      select: { statements: true },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    });
    const shown = await backedStatements(payload, citing as WithStatements[]);
    const showing = [...shown]
      .filter(([, statements]) =>
        statements.some((statement) =>
          statement.evidence.some(
            (item) =>
              (item.kind === "image" || item.kind === "document") &&
              item.file.url === `/files/${id}`,
          ),
        ),
      )
      .map(([individualId]) => individualId);
    isPublic =
      showing.length > 0 &&
      (await anyNamed(payload, await namingTopics(payload, showing)));
  }
  if (!isPublic) {
    const { docs: portrayed } = await payload.find({
      collection: "individuals",
      where: { photo: { equals: id } },
      select: { slug: true },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    });
    isPublic =
      portrayed.length > 0 &&
      (await anyNamed(
        payload,
        await namingTopics(
          payload,
          portrayed.map((individual) => String(individual.id)),
        ),
      ));
  }
  if (!isPublic) return null;
  return {
    file,
    stored: {
      id: String(media.id),
      filename: media.filename,
      _objectKey: media._objectKey,
    },
  };
}
