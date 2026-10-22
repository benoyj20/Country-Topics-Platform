import type { AdminCollection } from "@countrytopics/contracts";
import type { ComponentType } from "react";

// A related record made without leaving the editor (ADR 0014, phase 11):
// each feature offers a new record's editor for the collections a
// relationship field can make (features/*/create-forms.tsx), combined in
// registry/create-forms.ts and opened by CreateRecordDialog.

export type CreateFormProps = {
  /**
   * The new record's id, once saved, for a dialog to choose it; absent on
   * the create page, which opens the record instead.
   */
  onCreated?: (id: string) => void;
};

export type CreateForms = Partial<
  Record<AdminCollection, ComponentType<CreateFormProps>>
>;

/** Shown while a dialog's editor loads: they load only when one opens. */
export function CreateFormLoading() {
  return <p className="admin-muted">Loading the editor…</p>;
}
