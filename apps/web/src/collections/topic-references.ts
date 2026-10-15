import { APIError, type CollectionBeforeDeleteHook } from "payload";

/**
 * Refuses to delete an individual, category, or tag that a topic uses, in its
 * live version or in any saved version. Deleting it would silently change
 * published topics and their history (the database would clear or drop the
 * links), so it is edited instead.
 */
export function keepWhileUsedByTopics(
  field: "people.individual" | "category" | "tags",
  label: string,
): CollectionBeforeDeleteHook {
  return async ({ id, req }) => {
    const [live, versions] = await Promise.all([
      req.payload.count({
        collection: "topics",
        where: { [field]: { equals: id } },
        overrideAccess: true,
        req,
      }),
      req.payload.countVersions({
        collection: "topics",
        where: { [`version.${field}`]: { equals: id } },
        overrideAccess: true,
        req,
      }),
    ]);
    if (live.totalDocs > 0 || versions.totalDocs > 0) {
      throw new APIError(
        `This ${label} is used by topics or their history, so it cannot be deleted. Edit it instead.`,
        409,
        undefined,
        true,
      );
    }
  };
}
