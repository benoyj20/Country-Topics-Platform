"use client";

import { EMPTY_REFERENCE } from "@countrytopics/contracts";
import dynamic from "next/dynamic";

import {
  CreateFormLoading,
  type CreateFormProps,
  type CreateForms,
} from "@/admin/records/create-form";

// The references feature's new records made from a relationship field, in a
// dialog over the editor. The editor loads only when a dialog opens.

const ReferenceForm = dynamic(
  () => import("./ReferenceForm").then((module) => module.ReferenceForm),
  { loading: CreateFormLoading },
);

function NewReference({ onCreated }: CreateFormProps) {
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

export const CREATE_FORMS: CreateForms = {
  references: NewReference,
};
