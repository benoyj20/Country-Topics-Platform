import type { AdminCollection } from "@countrytopics/contracts";

import { COLLECTIONS as archives } from "@/admin/features/archives/collections";
import { COLLECTIONS as audit } from "@/admin/features/audit/collections";
import { COLLECTIONS as individuals } from "@/admin/features/individuals/collections";
import { COLLECTIONS as media } from "@/admin/features/media/collections";
import { COLLECTIONS as moderation } from "@/admin/features/moderation/collections";
import { COLLECTIONS as people } from "@/admin/features/people/collections";
import { COLLECTIONS as references } from "@/admin/features/references/collections";
import { COLLECTIONS as snippets } from "@/admin/features/snippets/collections";
import { COLLECTIONS as taxonomy } from "@/admin/features/taxonomy/collections";
import { COLLECTIONS as topics } from "@/admin/features/topics/collections";

import type { CollectionText } from "../collection-text";
import { combine } from "./combine";

// Every feature's collections, in one place: a feature adds its own in
// its folder and is listed here once.

export const COLLECTION_TEXT: Record<AdminCollection, CollectionText> = combine(
  "Collection labels",
  {
    topics,
    references,
    snippets,
    media,
    archives,
    individuals,
    taxonomy,
    moderation,
    people,
    audit,
  },
);
