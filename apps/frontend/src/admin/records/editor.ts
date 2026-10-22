import "server-only";

import type { Account, AdminCollection } from "@countrytopics/contracts";
import type { ReactNode } from "react";

// What a feature's record pages are (features/*/editors.tsx), for the
// generic record page (app/(admin)/admin/collections/[collection]/[id]):
// a record's page, by its id, and a new record's, where staff may make one.

/** A record's page: what it is titled, and its editor. */
export type EditorPage = { title: string; body: ReactNode };

export type Editor = {
  /** The record's page, or null when there is no such record. */
  record: (
    id: string,
    account: Account,
    notice: string | undefined,
  ) => Promise<EditorPage | null>;
  /** A new record's editor, for those who make them; absent when nobody does here. */
  create?: (account: Account) => ReactNode;
};

/** Whether the account may change what it reads: admins only, here. */
export const isAdmin = (account: Account) => account.role === "admin";

/** The collections edited on the generic record page: all but the topics'. */
export type EditedCollection = Exclude<
  AdminCollection,
  "topics" | "topic-changes"
>;
