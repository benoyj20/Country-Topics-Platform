import "server-only";

import {
  isAdmin,
  type EditedCollection,
  type Editor,
} from "@/admin/records/editor";

import { readMedia } from "./backend";
import { MediaForm } from "./MediaForm";
import { MediaUploadsLoader } from "./MediaUploadsLoader";

// The media feature's record pages, for the generic record page
// (app/(admin)/admin/collections/[collection]/[id]): a record's page,
// by its id, and a new record's, where staff may make one.

export const EDITORS = {
  media: {
    record: async (id, account, notice) => {
      const media = await readMedia(id);
      return (
        media && {
          title: media.values.alt || media.file.filename || "",
          body: (
            <MediaForm
              id={media.id}
              values={media.values}
              file={media.file}
              canEdit={isAdmin(account)}
              notice={notice}
            />
          ),
        }
      );
    },
    // Several files at once, as Payload's panel uploads them.
    create: () => <MediaUploadsLoader />,
  },
} satisfies Partial<Record<EditedCollection, Editor>>;
