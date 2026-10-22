"use client";

import { EMPTY_TERM } from "@countrytopics/contracts";
import dynamic from "next/dynamic";

import {
  CreateFormLoading,
  type CreateFormProps,
  type CreateForms,
} from "@/admin/records/create-form";

// The taxonomy feature's new records made from a relationship field, in a
// dialog over the editor. The editor loads only when a dialog opens.

const TermForm = dynamic(
  () => import("./TaxonomyForms").then((module) => module.TermForm),
  { loading: CreateFormLoading },
);

function NewCategory({ onCreated }: CreateFormProps) {
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

function NewTag({ onCreated }: CreateFormProps) {
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

export const CREATE_FORMS: CreateForms = {
  categories: NewCategory,
  tags: NewTag,
};
