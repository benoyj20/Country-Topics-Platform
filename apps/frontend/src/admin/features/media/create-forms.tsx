"use client";

import { EMPTY_MEDIA } from "@countrytopics/contracts";
import dynamic from "next/dynamic";

import {
  CreateFormLoading,
  type CreateFormProps,
  type CreateForms,
} from "@/admin/records/create-form";

// The media feature's new records made from a relationship field, in a
// dialog over the editor. The editor loads only when a dialog opens.

const MediaForm = dynamic(
  () => import("./MediaForm").then((module) => module.MediaForm),
  { loading: CreateFormLoading },
);

function NewFile({ onCreated }: CreateFormProps) {
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

export const CREATE_FORMS: CreateForms = {
  media: NewFile,
};
