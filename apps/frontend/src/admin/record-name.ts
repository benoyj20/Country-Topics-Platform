import type { RelatedRecord } from "@countrytopics/contracts";

/**
 * A related record's name, or what stands in for it: the server's pages
 * and the browser's pickers both show records this way.
 */
export function recordName(record: RelatedRecord): string {
  if (record.title === null) return `A removed or hidden record (${record.id})`;
  return record.title || "Untitled";
}
