import type { Payload, Where } from "payload";

// Whom a topic names (ADR 0007): its people, the individuals its text links
// to, and the speakers of the snippets it uses as evidence.

/** The condition for topics that name any of the individuals. */
export async function namingTopics(
  payload: Payload,
  individualIds: string[],
): Promise<Where> {
  // Snippets are not versioned with topics: a published topic quotes the
  // speaker its snippet names now, as its page shows.
  const { docs: spoken } = await payload.find({
    collection: "snippets",
    where: { speaker: { in: individualIds } },
    // Only the ids are needed; Payload always returns them.
    select: { youtubeId: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  const naming: Where[] = [
    { "people.individual": { in: individualIds } },
    { linkedIndividuals: { in: individualIds } },
  ];
  if (spoken.length > 0) {
    naming.push({ "evidence.snippet": { in: spoken.map((doc) => doc.id) } });
  }
  return { or: naming };
}
