import { APIError, type CollectionBeforeDeleteHook } from "payload";

type Usage =
  | {
      collection: "topics";
      field:
        | "people.individual"
        | "category"
        | "tags"
        | "references.reference"
        | "evidence.file";
    }
  | { collection: "individuals"; field: "photo" };

/**
 * Refuses to delete a document that topics use, in their live version or in
 * any saved version (or that individuals use). Deleting it would silently
 * change published topics and their history (the database would clear or
 * drop the links), so it is edited instead.
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
        if (collection !== "topics") return [live];
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
      const users = usages.some(
        ({ collection }) => collection === "individuals",
      )
        ? "topics, their history, or individuals"
        : "topics or their history";
      throw new APIError(
        `This ${label} is used by ${users}, so it cannot be deleted. Edit it instead.`,
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
