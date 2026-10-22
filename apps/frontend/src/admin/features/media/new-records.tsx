import { EMPTY_MEDIA } from "@countrytopics/contracts";

import type { CreateFormProps } from "@/admin/records/create-form";

import { MediaForm } from "./MediaForm";

// The media feature's blank records: on the create page, and in the
// dialog a relationship field opens (create-forms.tsx).

/** A new file's editor. */
export function NewFile({ onCreated }: CreateFormProps) {
  return (
    <MediaForm
      id={null}
      values={EMPTY_MEDIA}
      file={null}
      canEdit
      onCreated={onCreated}
    />
  );
}
