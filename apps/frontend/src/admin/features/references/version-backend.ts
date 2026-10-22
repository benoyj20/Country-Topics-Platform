import "server-only";

import {
  editorReference,
  isRecordId,
  referenceVersionSchema,
  versionParent,
  versionSearchParams,
} from "@countrytopics/contracts";

import { readAsStaff } from "@/admin/backend";

import type { ReferenceVersionValues } from "./versions";

// One version of a reference, as the comparison reads it.

export async function readReferenceVersion(version: string) {
  if (!isRecordId(version)) return null;
  const path = `/api/references/versions/${version}?${versionSearchParams()}`;
  const found = await readAsStaff(path, referenceVersionSchema);
  if (!found) return null;
  const parent = versionParent(found);
  const { values, status } = editorReference({
    ...found.version,
    id: parent,
    createdAt: found.createdAt,
    updatedAt: found.updatedAt,
  });
  const kept: ReferenceVersionValues = {
    ...values,
    checkStatus: status.checkStatus,
  };
  return {
    collection: "references" as const,
    id: found.id,
    parent,
    updatedAt: found.updatedAt,
    values: kept,
  };
}
