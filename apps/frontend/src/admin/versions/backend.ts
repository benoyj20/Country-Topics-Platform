import "server-only";

import {
  COMPARED_VERSIONS_MAX,
  isRecordId,
  previousVersionSearchParams,
  type VersionedCollection,
  versionsPageSchema,
  versionsSearchParams,
} from "@countrytopics/contracts";
import * as z from "zod";

import { BackendError } from "@/backend/request";

import { readAsStaff } from "../backend";

// The version pages' reads from Payload's REST API, as the staff member
// (ADR 0014, phase 11): what every versioned collection shares. One version
// of a record is read by its feature (registry/version-reads.ts).

/** A page of a record's versions, newest first. */
export async function readVersions(
  collection: VersionedCollection,
  parent: string,
  page: number,
  limit?: number,
) {
  const path = `/api/${collection}/versions?${versionsSearchParams(collection, parent, page, { limit })}`;
  const answer = await readAsStaff(path, versionsPageSchema(collection));
  if (!answer) throw new BackendError(path, 404);
  return answer;
}

/** The ids of the versions a comparison offers, newest first. */
export async function readVersionChoices(
  collection: VersionedCollection,
  parent: string,
) {
  return (await readVersions(collection, parent, 1, COMPARED_VERSIONS_MAX))
    .docs;
}

/** The version of `parent` saved just before `before`, or null for the first. */
export async function readPreviousVersion(
  collection: VersionedCollection,
  parent: string,
  before: string,
): Promise<string | null> {
  const path = `/api/${collection}/versions?${previousVersionSearchParams(parent, before)}`;
  const answer = await readAsStaff(
    path,
    z.object({ docs: z.array(z.object({ id: z.string() })) }),
  );
  return answer?.docs[0]?.id ?? null;
}

/**
 * The version a comparison shows by default: the one asked for, else the
 * one saved before (`previous`), else, for the first version, the one
 * saved after it among `choices` (newest first).
 */
export function comparedWith(
  shown: string,
  asked: string | string[] | undefined,
  previous: string | null,
  choices: readonly { id: string }[],
): string | null {
  if (typeof asked === "string" && isRecordId(asked) && asked !== shown) {
    return asked;
  }
  if (previous) return previous;
  const at = choices.findIndex((choice) => choice.id === shown);
  return at > 0 ? (choices[at - 1]?.id ?? null) : null;
}
