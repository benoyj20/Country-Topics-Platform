"use client";

import dynamic from "next/dynamic";

import {
  CreateFormLoading,
  type CreateForms,
} from "@/admin/records/create-form";

// The media feature's new records made from a relationship field, in a
// dialog over the editor. Each dynamic() names its import, as Next.js
// needs, and loads only when a dialog opens.

const NewFile = dynamic(
  () => import("./new-records").then((module) => module.NewFile),
  { loading: CreateFormLoading },
);

export const CREATE_FORMS: CreateForms = {
  media: NewFile,
};
