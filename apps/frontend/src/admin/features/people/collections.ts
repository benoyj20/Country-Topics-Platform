import type { AdminCollection } from "@countrytopics/contracts";
import { ROLE_LABELS } from "@countrytopics/domain";

import {
  DATE_FIELDS,
  ROLE_TONES,
  type CollectionText,
} from "@/admin/collection-text";

// What the admin calls the people feature's collections, their fields,
// and their stored values, as Payload's panel does (apps/api/src/collections),
// and the colours its statuses show in. Read through admin/collections.ts.

export const COLLECTIONS = {
  users: {
    plural: "Users",
    singular: "User",
    group: "Administration",
    fields: {
      email: "Email",
      name: "Name",
      displayName: "Public name",
      role: "Role",
      ...DATE_FIELDS,
    },
    values: { role: ROLE_LABELS },
    tones: {
      role: ROLE_TONES,
    },
  },
  invitations: {
    plural: "Invitations",
    singular: "Invitation",
    group: "Administration",
    fields: {
      email: "Email",
      role: "Role",
      acceptedAt: "Accepted",
      ...DATE_FIELDS,
    },
    values: { role: ROLE_LABELS },
    tones: {
      role: ROLE_TONES,
    },
  },
} satisfies Partial<Record<AdminCollection, CollectionText>>;
