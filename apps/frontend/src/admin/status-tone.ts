import type { AdminCollection } from "@countrytopics/contracts";

import { COLLECTION_TEXT } from "./collections";

// The colour a stored status is shown in, as a badge in lists and editors:
// green for done or public, amber for waiting on staff, red for a problem,
// blue for a role or for work newer than what is public, grey for the
// rest. The badge's text says the status; the colour only helps scan a
// list. Each feature names its status fields' colours with its collections
// (features/*/collections.ts); other choices, such as a reference's kind,
// stay plain text.

export type StatusTone = "good" | "waiting" | "problem" | "info" | "plain";

/** The colour of a status field's value; null for any other field. */
export function statusTone(
  collection: AdminCollection,
  field: string,
  value: string,
): StatusTone | null {
  const tones = COLLECTION_TEXT[collection].tones?.[field];
  return tones ? (tones[value] ?? "plain") : null;
}
