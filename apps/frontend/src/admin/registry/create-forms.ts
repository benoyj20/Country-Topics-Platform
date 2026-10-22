import {
  ADMIN_COLLECTIONS,
  type AdminCollection,
} from "@countrytopics/contracts";

import { CREATE_FORMS as individuals } from "@/admin/features/individuals/create-forms";
import { CREATE_FORMS as media } from "@/admin/features/media/create-forms";
import { CREATE_FORMS as references } from "@/admin/features/references/create-forms";
import { CREATE_FORMS as snippets } from "@/admin/features/snippets/create-forms";
import { CREATE_FORMS as taxonomy } from "@/admin/features/taxonomy/create-forms";

import type { CreateForms } from "../records/create-form";

// Every feature's new records made from a relationship field, in one place:
// a feature adds its own in its folder and is listed here once.

export const CREATE_FORMS: CreateForms = {
  ...references,
  ...individuals,
  ...taxonomy,
  ...media,
  ...snippets,
};

/** The collections whose records a field can make. */
export const CREATED_FROM_FIELDS: ReadonlySet<AdminCollection> = new Set(
  ADMIN_COLLECTIONS.filter((collection) => CREATE_FORMS[collection]),
);
