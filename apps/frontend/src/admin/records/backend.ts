import "server-only";

import {
  auditEntrySearchParams,
  commentReportsSchema,
  commentReportsSearchParams,
  commentSearchParams,
  commentTopicSlug,
  countrySearchParams,
  editorComment,
  editorFeedback,
  editorInvitation,
  editorReport,
  editorUser,
  feedbackSearchParams,
  invitationSearchParams,
  reportSearchParams,
  storedAuditEntrySchema,
  storedCommentSchema,
  storedFeedbackSchema,
  storedInvitationSchema,
  storedReportSchema,
  storedUserSchema,
  userSearchParams,
  editorCountry,
  editorIndividual,
  editorMedia,
  editorReference,
  editorSnippet,
  editorTerm,
  individualSearchParams,
  linkArchiveSearchParams,
  mediaSearchParams,
  referenceSearchParams,
  snippetSearchParams,
  storedCountrySchema,
  storedIndividualSchema,
  storedLinkArchiveSchema,
  storedMediaSchema,
  storedReferenceSchema,
  storedSnippetSchema,
  storedTermSchema,
  storedVideoSchema,
  type TermCollection,
  termSearchParams,
  videoSearchParams,
  videoSnippetsSchema,
  videoSnippetsSearchParams,
} from "@countrytopics/contracts";
import type * as z from "zod";

import { BackendError } from "@/backend/request";

import { readAsStaff } from "../backend";
import { isUuid } from "../list-state";

// The record editors' reads from Payload's REST API, as the staff member,
// with the same query a save is answered with (packages/contracts).

/** One record of `collection`, or null when there is none. */
async function readRecord<T>(
  collection: string,
  id: string,
  params: URLSearchParams,
  schema: z.ZodType<T>,
): Promise<T | null> {
  if (!isUuid(id)) return null;
  return readAsStaff(`/api/${collection}/${id}?${params}`, schema);
}

export async function readCountry(id: string) {
  const stored = await readRecord(
    "countries",
    id,
    countrySearchParams(),
    storedCountrySchema,
  );
  return stored && editorCountry(stored);
}

export async function readTerm(collection: TermCollection, id: string) {
  const stored = await readRecord(
    collection,
    id,
    termSearchParams(collection),
    storedTermSchema,
  );
  return stored && editorTerm(stored);
}

export async function readIndividual(id: string) {
  const stored = await readRecord(
    "individuals",
    id,
    individualSearchParams(),
    storedIndividualSchema,
  );
  return stored && editorIndividual(stored);
}

export async function readReference(id: string) {
  const stored = await readRecord(
    "references",
    id,
    referenceSearchParams(),
    storedReferenceSchema,
  );
  return stored && editorReference(stored);
}

export async function readMedia(id: string) {
  const stored = await readRecord(
    "media",
    id,
    mediaSearchParams(),
    storedMediaSchema,
  );
  return stored && editorMedia(stored);
}

export async function readSnippet(id: string) {
  const stored = await readRecord(
    "snippets",
    id,
    snippetSearchParams(),
    storedSnippetSchema,
  );
  return stored && editorSnippet(stored);
}

/** A video, with the snippets cut from it. */
export async function readVideo(id: string) {
  const video = await readRecord(
    "videos",
    id,
    videoSearchParams(),
    storedVideoSchema,
  );
  if (!video) return null;
  const path = `/api/snippets?${videoSnippetsSearchParams(video.id)}`;
  const snippets = await readAsStaff(path, videoSnippetsSchema);
  if (!snippets) throw new BackendError(path, 404);
  return { video, snippets };
}

export function readLinkArchive(id: string) {
  return readRecord(
    "link-archives",
    id,
    linkArchiveSearchParams(),
    storedLinkArchiveSchema,
  );
}

/** A comment, with its topic's public address and its reports. */
export async function readComment(id: string) {
  if (!isUuid(id)) return null;
  const path = `/api/comment-reports?${commentReportsSearchParams(id)}`;
  const [stored, reports] = await Promise.all([
    readRecord("comments", id, commentSearchParams(), storedCommentSchema),
    readAsStaff(path, commentReportsSchema),
  ]);
  if (!stored) return null;
  if (!reports) throw new BackendError(path, 404);
  return {
    comment: editorComment(stored),
    topicSlug: commentTopicSlug(stored),
    reports,
  };
}

export async function readReport(id: string) {
  const stored = await readRecord(
    "comment-reports",
    id,
    reportSearchParams(),
    storedReportSchema,
  );
  return stored && editorReport(stored);
}

export async function readFeedback(id: string) {
  const stored = await readRecord(
    "feedback",
    id,
    feedbackSearchParams(),
    storedFeedbackSchema,
  );
  return stored && editorFeedback(stored);
}

export async function readInvitation(id: string) {
  const stored = await readRecord(
    "invitations",
    id,
    invitationSearchParams(),
    storedInvitationSchema,
  );
  return stored && editorInvitation(stored);
}

export async function readUser(id: string) {
  const stored = await readRecord(
    "users",
    id,
    userSearchParams(),
    storedUserSchema,
  );
  return stored && editorUser(stored);
}

export function readAuditEntry(id: string) {
  return readRecord(
    "audit-log",
    id,
    auditEntrySearchParams(),
    storedAuditEntrySchema,
  );
}
