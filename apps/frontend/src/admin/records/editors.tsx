import "server-only";

import {
  type Account,
  type AdminCollection,
  EMPTY_INDIVIDUAL,
  EMPTY_INVITATION,
  EMPTY_REFERENCE,
  EMPTY_SNIPPET,
  EMPTY_TERM,
} from "@countrytopics/contracts";
import type { ReactNode } from "react";

import { AuditEntryView } from "./AuditEntryView";
import {
  readAuditEntry,
  readComment,
  readCountry,
  readFeedback,
  readIndividual,
  readInvitation,
  readReport,
  readUser,
  readLinkArchive,
  readMedia,
  readReference,
  readSnippet,
  readTerm,
  readVideo,
} from "./backend";
import { IndividualForm } from "./IndividualForm";
import { MediaForm } from "./MediaForm";
import { MediaUploadsLoader } from "./MediaUploadsLoader";
import { CommentForm, FeedbackForm, ReportForm } from "./ModerationForms";
import { InvitationForm, UserForm } from "./PeopleForms";
import { ReferenceForm } from "./ReferenceForm";
import { SnippetForm } from "./SnippetForm";
import { CountryForm, TermForm } from "./TaxonomyForms";
import { LinkArchiveView, VideoView } from "./WorkerRecords";

// The editor of each collection built in ADR 0014's phases 9 and 10, for
// the generic record page (app/(admin)/admin/collections/[collection]/[id]):
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

/** The collections edited on the generic record page: all but these. */
export type EditedCollection = Exclude<
  AdminCollection,
  "topics" | "topic-changes"
>;

export const EDITORS: Record<EditedCollection, Editor> = {
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
    // Several files at once, as Payload's panel uploads them.
    create: () => <MediaUploadsLoader />,
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
  comments: {
    record: async (id, account, notice) => {
      const found = await readComment(id);
      return (
        found && {
          title: found.comment.status.body
            ? `Comment: ${shortened(found.comment.status.body)}`
            : "A comment whose text was erased",
          body: (
            <CommentForm
              id={found.comment.id}
              values={found.comment.values}
              status={found.comment.status}
              topicSlug={found.topicSlug}
              reports={found.reports.docs}
              totalReports={found.reports.totalDocs}
              admin={isAdmin(account)}
              notice={notice}
            />
          ),
        }
      );
    },
  },
  "comment-reports": {
    record: async (id, account, notice) => {
      const report = await readReport(id);
      return (
        report && {
          title: "A report on a comment",
          body: (
            <ReportForm
              id={report.id}
              values={report.values}
              status={report.status}
              admin={isAdmin(account)}
              notice={notice}
            />
          ),
        }
      );
    },
  },
  feedback: {
    record: async (id, account, notice) => {
      const feedback = await readFeedback(id);
      return (
        feedback && {
          title: `Feedback: ${shortened(feedback.status.message)}`,
          body: (
            <FeedbackForm
              id={feedback.id}
              values={feedback.values}
              status={feedback.status}
              admin={isAdmin(account)}
              notice={notice}
            />
          ),
        }
      );
    },
  },
  invitations: {
    record: async (id, _account, notice) => {
      const invitation = await readInvitation(id);
      return (
        invitation && {
          title: invitation.values.email,
          body: (
            <InvitationForm
              id={invitation.id}
              values={invitation.values}
              status={invitation.status}
              notice={notice}
            />
          ),
        }
      );
    },
    create: () => (
      <InvitationForm id={null} values={EMPTY_INVITATION} status={null} />
    ),
  },
  users: {
    record: async (id, account, notice) => {
      const user = await readUser(id);
      return (
        user && {
          title: user.status.email,
          body: (
            <UserForm
              id={user.id}
              values={user.values}
              status={user.status}
              canEdit={isAdmin(account)}
              self={
                user.status.email.toLowerCase() === account.email.toLowerCase()
              }
              notice={notice}
            />
          ),
        }
      );
    },
  },
  "audit-log": {
    record: async (id) => {
      const entry = await readAuditEntry(id);
      return (
        entry && { title: entry.action, body: <AuditEntryView entry={entry} /> }
      );
    },
  },
};

/** The start of what a member wrote, for a page's title. */
function shortened(text: string, length = 60): string {
  // By characters, so an emoji is never cut in half.
  const characters = Array.from(text.replace(/\s+/g, " ").trim());
  return characters.length > length
    ? `${characters.slice(0, length - 1).join("")}…`
    : characters.join("");
}
