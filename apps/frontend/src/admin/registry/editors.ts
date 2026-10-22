import "server-only";

import { combine } from "@countrytopics/contracts";

import { EDITORS as archives } from "@/admin/features/archives/editors";
import { EDITORS as audit } from "@/admin/features/audit/editors";
import { EDITORS as individuals } from "@/admin/features/individuals/editors";
import { EDITORS as media } from "@/admin/features/media/editors";
import { EDITORS as moderation } from "@/admin/features/moderation/editors";
import { EDITORS as people } from "@/admin/features/people/editors";
import { EDITORS as references } from "@/admin/features/references/editors";
import { EDITORS as snippets } from "@/admin/features/snippets/editors";
import { EDITORS as taxonomy } from "@/admin/features/taxonomy/editors";

import type { EditedCollection, Editor } from "../records/editor";

// Every feature's record pages, in one place: a feature adds its own in
// its folder and is listed here once. The topics' have pages of their own.

export const EDITORS: Record<EditedCollection, Editor> = combine(
  "Record pages",
  {
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
