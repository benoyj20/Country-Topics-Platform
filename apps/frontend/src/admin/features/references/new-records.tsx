import { EMPTY_REFERENCE } from "@countrytopics/contracts";

import type { CreateFormProps } from "@/admin/records/create-form";

import { ReferenceForm } from "./ReferenceForm";

// The references feature's blank records: on the create page, and in the
// dialog a relationship field opens (create-forms.tsx).

/** A new reference's editor. */
export function NewReference({ onCreated }: CreateFormProps) {
  return (
    <ReferenceForm
      id={null}
      values={EMPTY_REFERENCE}
      status={null}
      canEdit
      onCreated={onCreated}
    />
  );
}
