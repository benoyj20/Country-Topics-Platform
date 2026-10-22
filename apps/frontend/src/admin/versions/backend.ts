import "server-only";

import {
  COMPARED_VERSIONS_MAX,
  editorReference,
  editorSnippet,
  isRecordId,
  previousVersionSearchParams,
  referenceVersionSchema,
  snippetVersionSchema,
  type VersionedCollection,
  versionParent,
  versionSearchParams,
  versionsPageSchema,
  versionsSearchParams,
} from "@countrytopics/contracts";
import * as z from "zod";

import { BackendError } from "@/backend/request";

import { readAsStaff } from "../backend";
import type { ReferenceVersionValues } from "./compared-fields";

// The version pages' reads from Payload's REST API, as the staff member
// (ADR 0014, phase 11). A topic's version is read by ../topics/backend.ts.

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

/** A version of a reference or snippet, as the comparison reads it. */
export type RecordVersion =
  | {
      collection: "references";
      id: string;
      parent: string;
      updatedAt: string;
      values: ReferenceVersionValues;
    }
  | {
      collection: "snippets";
      id: string;
      parent: string;
      updatedAt: string;
      values: ReturnType<typeof editorSnippet>["values"];
    };

/** One version of a reference or snippet, or null when there is none. */
export async function readRecordVersion(
  collection: "references" | "snippets",
  version: string,
): Promise<RecordVersion | null> {
  if (!isRecordId(version)) return null;
  const path = `/api/${collection}/versions/${version}?${versionSearchParams()}`;
  if (collection === "references") {
    const found = await readAsStaff(path, referenceVersionSchema);
    if (!found) return null;
    const parent = versionParent(found);
    const { values, status } = editorReference({
      ...found.version,
      id: parent,
      createdAt: found.createdAt,
      updatedAt: found.updatedAt,
    });
    return {
      collection,
      id: found.id,
      parent,
      updatedAt: found.updatedAt,
      values: { ...values, checkStatus: status.checkStatus },
    };
  }
  const found = await readAsStaff(path, snippetVersionSchema);
  if (!found) return null;
  const parent = versionParent(found);
  return {
    collection,
    id: found.id,
    parent,
    updatedAt: found.updatedAt,
    values: editorSnippet({
      ...found.version,
      id: parent,
      createdAt: found.createdAt,
      updatedAt: found.updatedAt,
    }).values,
  };
}
