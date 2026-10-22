import { EMPTY_INDIVIDUAL } from "@countrytopics/contracts";

import type { CreateFormProps } from "@/admin/records/create-form";

import { IndividualForm } from "./IndividualForm";

// The individuals feature's blank records: on the create page, and in the
// dialog a relationship field opens (create-forms.tsx).

/** A new individual's editor. */
export function NewIndividual({ onCreated }: CreateFormProps) {
  return (
    <IndividualForm
      id={null}
      values={EMPTY_INDIVIDUAL}
      status={null}
      canEdit
      onCreated={onCreated}
    />
  );
}
