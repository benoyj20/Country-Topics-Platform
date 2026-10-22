import type { AdminCollection } from "@countrytopics/contracts";

import { COLLECTION_TEXT } from "./registry/collections";

// What the admin calls each collection, its fields, and their stored
// values: each feature's own (features/*/collections.ts), combined in
// registry/collections.ts. What a list reads is in packages/contracts
// (admin-lists.ts).

export {
  ADMIN_GROUPS,
  type AdminGroup,
  type CollectionText,
} from "./collection-text";

export { COLLECTION_TEXT };

/** A field's name as staff know it. */
export function fieldLabel(collection: AdminCollection, field: string): string {
  return COLLECTION_TEXT[collection].fields[field] ?? field;
}

/** A stored value's name, or the value itself. */
export function valueLabel(
  collection: AdminCollection,
  field: string,
  value: string,
): string {
  return COLLECTION_TEXT[collection].values?.[field]?.[value] ?? value;
}
