import { EMPTY_TERM } from "@countrytopics/contracts";

import type { CreateFormProps } from "@/admin/records/create-form";

import { TermForm } from "./TaxonomyForms";

// The taxonomy feature's blank records: on the create page, and in the
// dialog a relationship field opens (create-forms.tsx).

/** A new category's editor. */
export function NewCategory({ onCreated }: CreateFormProps) {
  return (
    <TermForm
      collection="categories"
      id={null}
      values={EMPTY_TERM}
      status={null}
      canEdit
      onCreated={onCreated}
    />
  );
}

/** A new tag's editor. */
export function NewTag({ onCreated }: CreateFormProps) {
  return (
    <TermForm
      collection="tags"
      id={null}
      values={EMPTY_TERM}
      status={null}
      canEdit
      onCreated={onCreated}
    />
  );
}
