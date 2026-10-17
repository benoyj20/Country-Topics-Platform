import { APIError, type CollectionBeforeDeleteHook } from "payload";

type Usage =
  | {
      collection: "topics";
      field:
        | "people.individual"
        | "category"
        | "tags"
        | "references.reference"
        | "evidence.file"
        | "evidence.snippet";
    }
  | { collection: "snippets"; field: "video" | "speaker" }
  | { collection: "individuals"; field: "photo" };

/** Collections whose every saved version is kept, and so also counts. */
const VERSIONED: ReadonlySet<Usage["collection"]> = new Set([
  "topics",
  "snippets",
]);

/** "topics or their history", "topics, their history, or individuals". */
function describeUsers(usages: Usage[]): string {
  const collections = [...new Set(usages.map((usage) => usage.collection))];
  const names = [
    ...collections.filter((collection) => VERSIONED.has(collection)),
    ...(collections.some((collection) => VERSIONED.has(collection))
      ? ["their history"]
      : []),
    ...collections.filter((collection) => !VERSIONED.has(collection)),
  ];
  if (names.length <= 2) return names.join(" or ");
  return `${names.slice(0, -1).join(", ")}, or ${names.at(-1)}`;
}

/**
 * Refuses to delete a document that topics or snippets use, in their live
 * version or in any saved version (or that individuals use). Deleting it
 * would silently change published topics and their history (the database
 * would clear or drop the links), so it is edited instead.
 */
export function keepWhileUsed(
  label: string,
  usages: Usage[],
): CollectionBeforeDeleteHook {
  return async ({ id, req }) => {
    const counts = await Promise.all(
      usages.flatMap(({ collection, field }) => {
        const live = req.payload.count({
          collection,
          where: { [field]: { equals: id } },
          overrideAccess: true,
          req,
        });
        if (!VERSIONED.has(collection)) return [live];
        const versions = req.payload.countVersions({
          collection,
          where: { [`version.${field}`]: { equals: id } },
          overrideAccess: true,
          req,
        });
        return [live, versions];
      }),
    );
    if (counts.some(({ totalDocs }) => totalDocs > 0)) {
      throw new APIError(
        `This ${label} is used by ${describeUsers(usages)}, so it cannot be deleted. Edit it instead.`,
        409,
        undefined,
        true,
      );
    }
  };
}

export function keepWhileUsedByTopics(
  field: Extract<Usage, { collection: "topics" }>["field"],
  label: string,
): CollectionBeforeDeleteHook {
  return keepWhileUsed(label, [{ collection: "topics", field }]);
}
