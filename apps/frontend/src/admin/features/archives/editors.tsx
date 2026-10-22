import "server-only";

import { type EditedCollection, type Editor } from "@/admin/records/editor";

import { readLinkArchive } from "./backend";
import { LinkArchiveView } from "./LinkArchiveView";

// The archives feature's record pages, for the generic record page
// (app/(admin)/admin/collections/[collection]/[id]): a record's page,
// by its id, and a new record's, where staff may make one.

export const EDITORS = {
  "link-archives": {
    record: async (id) => {
      const archive = await readLinkArchive(id);
      return (
        archive && {
          title: archive.url,
          body: <LinkArchiveView archive={archive} />,
        }
      );
    },
  },
} satisfies Partial<Record<EditedCollection, Editor>>;
