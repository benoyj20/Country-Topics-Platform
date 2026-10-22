import "server-only";

import {
  editorSnippet,
  isRecordId,
  snippetVersionSchema,
  versionParent,
  versionSearchParams,
} from "@countrytopics/contracts";

import { readAsStaff } from "@/admin/backend";

// One version of a snippet, as the comparison reads it.

export async function readSnippetVersion(version: string) {
  if (!isRecordId(version)) return null;
  const path = `/api/snippets/versions/${version}?${versionSearchParams()}`;
  const found = await readAsStaff(path, snippetVersionSchema);
  if (!found) return null;
  const parent = versionParent(found);
  return {
    collection: "snippets" as const,
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
