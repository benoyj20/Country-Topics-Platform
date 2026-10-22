"use client";

import { EMPTY_INDIVIDUAL } from "@countrytopics/contracts";
import dynamic from "next/dynamic";

import {
  CreateFormLoading,
  type CreateFormProps,
  type CreateForms,
} from "@/admin/records/create-form";

// The individuals feature's new records made from a relationship field, in a
// dialog over the editor. The editor loads only when a dialog opens.

const IndividualForm = dynamic(
  () => import("./IndividualForm").then((module) => module.IndividualForm),
  { loading: CreateFormLoading },
);

function NewIndividual({ onCreated }: CreateFormProps) {
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

export const CREATE_FORMS: CreateForms = {
  individuals: NewIndividual,
};
