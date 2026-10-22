import "server-only";

import {
  isAdmin,
  type EditedCollection,
  type Editor,
} from "@/admin/records/editor";

import { readSnippet, readVideo } from "./backend";
import { SnippetForm } from "./SnippetForm";
import { VideoView } from "./VideoView";
import { NewSnippet } from "./new-records";

// The snippets feature's record pages, for the generic record page
// (app/(admin)/admin/collections/[collection]/[id]): a record's page,
// by its id, and a new record's, where staff may make one.

export const EDITORS = {
  snippets: {
    record: async (id, account, notice) => {
      const snippet = await readSnippet(id);
      return (
        snippet && {
          title: snippet.values.caption,
          body: (
            <SnippetForm
              id={snippet.id}
              values={snippet.values}
              status={snippet.status}
              canEdit={isAdmin(account)}
              notice={notice}
            />
          ),
        }
      );
    },
    create: () => <NewSnippet />,
  },
  videos: {
    record: async (id, account) => {
      const found = await readVideo(id);
      return (
        found && {
          title: found.video.title || `YouTube video ${found.video.youtubeId}`,
          body: (
            <VideoView
              video={found.video}
              snippets={found.snippets.docs.map((doc) => ({
                id: doc.id,
                caption: doc.caption ?? null,
                startS: doc.startS ?? null,
                endS: doc.endS ?? null,
              }))}
              totalSnippets={found.snippets.totalDocs}
              canDelete={isAdmin(account)}
            />
          ),
        }
      );
    },
  },
} satisfies Partial<Record<EditedCollection, Editor>>;
