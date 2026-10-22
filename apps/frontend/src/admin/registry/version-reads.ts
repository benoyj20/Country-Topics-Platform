import "server-only";

import { readReferenceVersion } from "@/admin/features/references/version-backend";
import { readSnippetVersion } from "@/admin/features/snippets/version-backend";

// One version of a record on the generic version page, read by its
// feature; a topic's has a page of its own. Each versioned feature is
// listed here once.

/** A version of a reference or snippet, as the comparison reads it. */
export type RecordVersion =
  | NonNullable<Awaited<ReturnType<typeof readReferenceVersion>>>
  | NonNullable<Awaited<ReturnType<typeof readSnippetVersion>>>;

/** One version of a reference or snippet, or null when there is none. */
export function readRecordVersion(
  collection: "references" | "snippets",
  version: string,
): Promise<RecordVersion | null> {
  return collection === "references"
    ? readReferenceVersion(version)
    : readSnippetVersion(version);
}
