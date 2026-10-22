import { EMPTY_SNIPPET } from "@countrytopics/contracts";

import type { CreateFormProps } from "@/admin/records/create-form";

import { SnippetForm } from "./SnippetForm";

// The snippets feature's blank records: on the create page, and in the
// dialog a relationship field opens (create-forms.tsx).

/** A new snippet's editor. */
export function NewSnippet({ onCreated }: CreateFormProps) {
  return (
    <SnippetForm
      id={null}
      values={EMPTY_SNIPPET}
      status={null}
      canEdit
      onCreated={onCreated}
    />
  );
}
