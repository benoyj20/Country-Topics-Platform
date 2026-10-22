import type { Role } from "@countrytopics/domain";

import type { StatusTone } from "./status-tone";

// The shape of what the admin calls a collection, which each feature fills
// in for its own collections (features/*/collections.ts). Imports nothing
// from the features, so each of them can use it.

export type AdminGroup = "Content" | "Discussion" | "Administration";

export const ADMIN_GROUPS: readonly AdminGroup[] = [
  "Content",
  "Discussion",
  "Administration",
];

export type CollectionText = {
  plural: string;
  singular: string;
  group: AdminGroup;
  /** Shown above the list, as the panel's description. */
  description?: string;
  /** Field names as staff know them; a field without one is shown as named. */
  fields: Record<string, string>;
  /** Names for stored values, by field. */
  values?: Record<string, Readonly<Record<string, string>>>;
  /** The colours a status field's values show in (status-tone.ts), by field. */
  tones?: Record<string, Readonly<Record<string, StatusTone>>>;
};

/** Every collection's dates, named as staff know them. */
export const DATE_FIELDS = { createdAt: "Created", updatedAt: "Updated" };

/** Roles' colours, wherever a role is shown. */
export const ROLE_TONES: Readonly<Record<Role, StatusTone>> = {
  admin: "info",
  moderator: "info",
  member: "plain",
};
