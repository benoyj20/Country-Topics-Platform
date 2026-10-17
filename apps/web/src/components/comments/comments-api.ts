import {
  type CommentReportReason,
  type CommentSort,
  type CommentVoteValue,
  DEFAULT_COMMENT_SORT,
} from "@countrytopics/domain";

import type {
  CommentPage,
  CommentThread,
  CommentViewer,
  PublicComment,
  ReplyPage,
} from "@/comments/types";
import type { NotificationPage } from "@/notifications/types";

// The browser's side of the comment routes (ADRs 0009 and 0010). Each call answers
// the route's JSON or throws CommentApiError with the message to show.

export class CommentApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "CommentApiError";
  }
}

async function call<T>(
  url: string,
  fallback: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const { json, ...rest } = init ?? {};
  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      ...(json === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(json),
          }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new CommentApiError(`${fallback} Check your connection.`, 0);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const record = body && typeof body === "object" ? body : {};
    throw new CommentApiError(
      "error" in record && typeof record.error === "string"
        ? record.error
        : fallback,
      response.status,
      "code" in record && typeof record.code === "string"
        ? record.code
        : undefined,
    );
  }
  // The site's own API, answering with T.
  return body as T;
}

export function fetchThreads(
  slug: string,
  sort: CommentSort,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<CommentPage> {
  const params = new URLSearchParams();
  if (sort !== DEFAULT_COMMENT_SORT) params.set("sort", sort);
  if (cursor) params.set("cursor", cursor);
  const search = params.toString();
  return call(
    `/api/v1/topics/${encodeURIComponent(slug)}/comments${search ? `?${search}` : ""}`,
    "The comments could not be loaded.",
    { signal },
  );
}

/** The thread holding one comment, for a link to it (ADR 0010). */
export function fetchThread(
  slug: string,
  commentId: string,
  signal?: AbortSignal,
): Promise<{ open: boolean; thread: CommentThread }> {
  return call(
    `/api/v1/topics/${encodeURIComponent(slug)}/comments/${encodeURIComponent(commentId)}`,
    "The linked comment could not be loaded.",
    { signal },
  );
}

export function fetchReplies(
  threadId: string,
  cursor: string,
): Promise<ReplyPage> {
  return call(
    `/api/v1/comments/${threadId}/replies?cursor=${encodeURIComponent(cursor)}`,
    "The replies could not be loaded.",
  );
}

export function fetchViewer(
  ids: string[],
  signal?: AbortSignal,
): Promise<CommentViewer> {
  return call(
    `/api/v1/account/comments?ids=${ids.join(",")}`,
    "Your votes could not be loaded.",
    { signal, cache: "no-store" },
  );
}

export async function postComment(
  slug: string,
  body: string,
  parentId: string | null,
): Promise<PublicComment> {
  const result = await call<{ comment: PublicComment }>(
    `/api/v1/topics/${encodeURIComponent(slug)}/comments`,
    "The comment could not be posted.",
    { method: "POST", json: { body, parentId } },
  );
  return result.comment;
}

export function sendVote(
  commentId: string,
  value: CommentVoteValue,
): Promise<{ score: number; value: CommentVoteValue }> {
  return call(`/api/v1/comments/${commentId}/vote`, "The vote did not count.", {
    method: "PUT",
    json: { value },
  });
}

export async function sendReport(
  commentId: string,
  reason: CommentReportReason,
  note: string,
): Promise<void> {
  await call(
    `/api/v1/comments/${commentId}/reports`,
    "The report could not be sent.",
    { method: "POST", json: { reason, note } },
  );
}

export async function saveDisplayName(displayName: string): Promise<string> {
  const result = await call<{ displayName: string }>(
    "/api/v1/account/display-name",
    "Your name could not be saved.",
    { method: "PUT", json: { displayName } },
  );
  return result.displayName;
}

const WHEN = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** "17 Oct 2026, 15:38" in the reader's time zone (comments render in the browser). */
export function formatCommentTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : WHEN.format(date);
}

export function fetchNotifications(
  cursor: string | null,
  signal?: AbortSignal,
): Promise<NotificationPage> {
  return call(
    `/api/v1/account/notifications${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    "Your notifications could not be loaded.",
    { signal, cache: "no-store" },
  );
}

export function fetchUnreadNotifications(
  signal?: AbortSignal,
): Promise<{ unread: number }> {
  return call(
    "/api/v1/account/notifications/unread",
    "Your notifications could not be counted.",
    { signal, cache: "no-store" },
  );
}

export async function markNotificationsRead(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await call(
    "/api/v1/account/notifications/read",
    "Your notifications could not be marked as read.",
    { method: "POST", json: { ids } },
  );
  // The header's count listens for this.
  window.dispatchEvent(new Event(NOTIFICATIONS_READ_EVENT));
}

export const NOTIFICATIONS_READ_EVENT = "countrytopics:notifications-read";
