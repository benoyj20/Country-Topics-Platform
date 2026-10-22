"use client";

import { createContext, useContext } from "react";

// What a form's field ids start with. A record made from a field opens its
// editor in a dialog over another editor (CreateRecordDialog), and both
// name fields by their keys, such as "slug": the dialog's start with its
// own prefix, so every label and message points at its own input.

export const FieldIdPrefix = createContext("");

export function useFieldIdPrefix(): string {
  return useContext(FieldIdPrefix);
}
