import type { CollectionBeforeChangeHook } from "payload";

import { richTextLinkedIds } from "@/editor";

// The individuals a topic's body links to, kept as a relationship.

/**
 * Keeps the individuals linked in the body as a relationship, so a public
 * page can ask which topics name a person without reading every body.
 */
export const recordBodyLinks: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
}) => {
  const linked = richTextLinkedIds(
    data.body ?? originalDoc?.body,
    "individuals",
  );
  // Only individuals that still exist: before body links were recorded, an
  // individual linked only in a body could be deleted, and the relationship
  // refuses ids it cannot find.
  const { docs } =
    linked.length > 0
      ? await req.payload.find({
          collection: "individuals",
          where: { id: { in: linked } },
          select: { slug: true },
          depth: 0,
          pagination: false,
          overrideAccess: true,
          req,
        })
      : { docs: [] };
  const existing = new Set(docs.map((doc) => String(doc.id)));
  data.linkedIndividuals = linked.filter((id) => existing.has(id));
  return data;
};
