import { normalizeCommentBody } from "./comments.ts";

/**
 * Feedback members send about the site itself (ADR 0011), read by staff in
 * the admin panel. It is private: nothing about it is shown publicly.
 */

export const FEEDBACK_KINDS = [
  /** Something did not work as expected. */
  "problem",
  /** Something that would make the site better. */
  "idea",
  "other",
] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_STATUSES = [
  "new",
  /** Staff have read it and need do nothing more. */
  "done",
] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_MESSAGE_MAX_LENGTH = 2_000;
/** The path of the page the feedback is about, such as `/topics/x`. */
export const FEEDBACK_PAGE_MAX_LENGTH = 300;

/** Feedback is stored as plain text, tidied like a comment. */
export const normalizeFeedbackMessage = normalizeCommentBody;

/** Why feedback cannot be sent, or null when it can (check it normalised). */
export function feedbackMessageProblem(message: string): string | null {
  if (message.length === 0) return "Write something first.";
  if (message.length > FEEDBACK_MESSAGE_MAX_LENGTH) {
    return `Feedback can be at most ${FEEDBACK_MESSAGE_MAX_LENGTH.toLocaleString("en")} characters.`;
  }
  return null;
}

/**
 * The site path feedback was sent from, or null when `value` is not one: a
 * path on this site (`/` then not `/` or `\`), without its query or
 * fragment, which can hold search terms or tokens.
 */
export function feedbackPagePath(value: string): string | null {
  if (!/^\/(?![/\\])/.test(value)) return null;
  const path = value.split(/[?#]/, 1)[0] ?? "";
  if (path.length > FEEDBACK_PAGE_MAX_LENGTH) return null;
  // Visible characters only, so the stored path reads as it was sent.
  return /^[\x21-\x7e]+$/.test(path) ? path : null;
}
