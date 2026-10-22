"use client";

import { EMPTY_SNIPPET } from "@countrytopics/contracts";
import dynamic from "next/dynamic";

import {
  CreateFormLoading,
  type CreateFormProps,
  type CreateForms,
} from "@/admin/records/create-form";

// The snippets feature's new records made from a relationship field, in a
// dialog over the editor. The editor loads only when a dialog opens.

const SnippetForm = dynamic(
  () => import("./SnippetForm").then((module) => module.SnippetForm),
  { loading: CreateFormLoading },
);

function NewSnippet({ onCreated }: CreateFormProps) {
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

export const CREATE_FORMS: CreateForms = {
  snippets: NewSnippet,
};
