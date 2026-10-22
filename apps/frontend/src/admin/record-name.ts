import type { RelatedRecord } from "@countrytopics/contracts";

/**
 * A related record's name, or what stands in for it: the server's pages
 * and the browser's pickers both show records this way.
 */
export function recordName(record: RelatedRecord): string {
  if (record.title === null) return `A removed or hidden record (${record.id})`;
  return record.title || "Untitled";
}

/**
 * A related account's name for staff: its address, which only admins may
 * read. `staff` when the account is a staff member's, such as whoever
 * moderated a comment. An account deleted since leaves none.
 */
export function personName(
  record: RelatedRecord | null,
  { admin, staff }: { admin: boolean; staff: boolean },
): string {
  // Admins read every account: one they cannot is gone.
  if (!record || (record.title === null && admin)) return "A deleted account";
  if (record.title === null) {
    return staff
      ? "A staff member (only admins see accounts)"
      : "A member (only admins see accounts)";
  }
  return record.title || "Untitled";
}
