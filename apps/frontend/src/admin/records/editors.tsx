import "server-only";

import {
  type Account,
  type AdminCollection,
  EMPTY_INDIVIDUAL,
  EMPTY_MEDIA,
  EMPTY_REFERENCE,
  EMPTY_SNIPPET,
  EMPTY_TERM,
} from "@countrytopics/contracts";
import type { ReactNode } from "react";

import {
  readCountry,
  readIndividual,
  readLinkArchive,
  readMedia,
  readReference,
  readSnippet,
  readTerm,
  readVideo,
} from "./backend";
import { IndividualForm } from "./IndividualForm";
import { MediaForm } from "./MediaForm";
import { ReferenceForm } from "./ReferenceForm";
import { SnippetForm } from "./SnippetForm";
import { CountryForm, TermForm } from "./TaxonomyForms";
import { LinkArchiveView, VideoView } from "./WorkerRecords";

// The editor of each collection built in ADR 0014's phase 9, for the
// generic record page (app/(admin)/admin/collections/[collection]/[id]):
// a record's page, by its id, and a new record's, where staff may make one.

/** A record's page: what it is titled, and its editor. */
export type EditorPage = { title: string; body: ReactNode };

type Editor = {
  /** The record's page, or null when there is no such record. */
  record: (
    id: string,
    account: Account,
    notice: string | undefined,
  ) => Promise<EditorPage | null>;
  /** A new record's editor, for those who make them; absent when nobody does here. */
  create?: (account: Account) => ReactNode;
};

const isAdmin = (account: Account) => account.role === "admin";

function termEditor(collection: "categories" | "tags"): Editor {
  return {
    record: async (id, account, notice) => {
      const term = await readTerm(collection, id);
      return (
        term && {
          title: term.values.name,
          body: (
            <TermForm
              collection={collection}
              id={term.id}
              values={term.values}
              status={term.status}
              canEdit={isAdmin(account)}
              notice={notice}
            />
          ),
        }
      );
    },
    create: () => (
      <TermForm
        collection={collection}
        id={null}
        values={EMPTY_TERM}
        status={null}
        canEdit
      />
    ),
  };
}

export const EDITORS: Partial<Record<AdminCollection, Editor>> = {
  countries: {
    record: async (id, account, notice) => {
      const country = await readCountry(id);
      return (
        country && {
          title: country.values.name,
          body: (
            <CountryForm
              id={country.id}
              values={country.values}
              codes={country.codes}
              status={country.status}
              canEdit={isAdmin(account)}
              notice={notice}
            />
          ),
        }
      );
    },
  },
  categories: termEditor("categories"),
  tags: termEditor("tags"),
  individuals: {
    record: async (id, account, notice) => {
      const individual = await readIndividual(id);
      return (
        individual && {
          title: individual.values.name,
          body: (
            <IndividualForm
              id={individual.id}
              values={individual.values}
              status={individual.status}
              canEdit={isAdmin(account)}
              notice={notice}
            />
          ),
        }
      );
    },
    create: () => (
      <IndividualForm
        id={null}
        values={EMPTY_INDIVIDUAL}
        status={null}
        canEdit
      />
    ),
  },
  references: {
    record: async (id, account, notice) => {
      const reference = await readReference(id);
      return (
        reference && {
          title: reference.values.title,
          body: (
            <ReferenceForm
              id={reference.id}
              values={reference.values}
              status={reference.status}
              canEdit={isAdmin(account)}
              notice={notice}
            />
          ),
        }
      );
    },
    create: () => (
      <ReferenceForm id={null} values={EMPTY_REFERENCE} status={null} canEdit />
    ),
  },
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
    create: () => (
      <MediaForm id={null} values={EMPTY_MEDIA} file={null} canEdit />
    ),
  },
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
    create: () => (
      <SnippetForm id={null} values={EMPTY_SNIPPET} status={null} canEdit />
    ),
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
};
