import type { SearchSourceChange } from "@countrytopics/jobs";
import type {
  CollectionAfterChangeHook,
  PayloadRequest,
  TypeWithID,
  Where,
} from "payload";

import { queueSearchIndex } from "@/content-jobs";

// Keeping the search index current (ADR 0008). A topic's search document
// holds the names of the countries, category, tags, and people it shows,
// and the speakers and languages of its snippets, so a save that changes
// one of those re-indexes the published topics that show it. The worker
// waits for the save to commit, then reads the topics as they are.

type Table = Exclude<SearchSourceChange["table"], "topics">;

type Saved = TypeWithID & { updatedAt: string };

/** Published topics (their live versions) matching `where`. */
async function publishedTopicIds(
  req: PayloadRequest,
  where: Where,
): Promise<string[]> {
  const { docs } = await req.payload.find({
    collection: "topics",
    draft: false,
    where: { and: [{ _status: { equals: "published" } }, where] },
    // Only the ids are needed; Payload always returns them.
    select: { slug: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  });
  return docs.map((doc) => String(doc.id));
}

/**
 * An afterChange hook that re-indexes the topics showing a document when a
 * field search uses changes. New documents are skipped: no topic shows them
 * yet. Deletions need nothing: what topics show cannot be deleted while in
 * use, and the hourly rebuild drops anything else.
 */
export function reindexTopicsOnChange<T extends Saved>(
  table: Table,
  {
    searched,
    topicsShowing,
  }: {
    /** The values search uses, in a form that compares as JSON. */
    searched: (doc: T) => unknown;
    /** Which topics show the document. */
    topicsShowing: (req: PayloadRequest, id: string) => Promise<Where>;
  },
): CollectionAfterChangeHook<T> {
  return async ({ doc, previousDoc, operation, req }) => {
    if (operation !== "update") return doc;
    if (
      JSON.stringify(searched(doc)) === JSON.stringify(searched(previousDoc))
    ) {
      return doc;
    }
    const id = String(doc.id);
    await queueSearchIndex(
      req,
      await publishedTopicIds(req, await topicsShowing(req, id)),
      { table, id, updatedAt: doc.updatedAt },
    );
    return doc;
  };
}
