/**
 * F6 comments: members discuss a topic in two levels, top-level comments
 * and replies to them. Pure rules shared by the server, which enforces them,
 * and the browser, which checks before sending.
 */

/** Characters in a comment after normalising it. */
export const COMMENT_BODY_MAX_LENGTH = 5_000;

export const COMMENT_SORTS = [
  /** Highest score first, then newest. */
  "top",
  "new",
  "old",
] as const;
export type CommentSort = (typeof COMMENT_SORTS)[number];
export const DEFAULT_COMMENT_SORT: CommentSort = "top";

export function isCommentSort(value: unknown): value is CommentSort {
  return (
    typeof value === "string" &&
    (COMMENT_SORTS as readonly string[]).includes(value)
  );
}

/** An up vote, a down vote, or 0 to take a vote back. */
export const COMMENT_VOTE_VALUES = [-1, 0, 1] as const;
export type CommentVoteValue = (typeof COMMENT_VOTE_VALUES)[number];

export const COMMENT_REPORT_REASONS = [
  "spam",
  "abuse",
  "misleading",
  "off-topic",
  "other",
] as const;
export type CommentReportReason = (typeof COMMENT_REPORT_REASONS)[number];
export const COMMENT_REPORT_NOTE_MAX_LENGTH = 500;

/**
 * Control characters other than tab and line feed, which nothing typed
 * needs, and the bidirectional embeddings, overrides, and isolates, which
 * can make text read differently from what was stored. Marks such as RLM,
 * which right-to-left writing uses, are kept.
 */
function isHiddenControl(code: number): boolean {
  return (
    (code < 0x20 && code !== 0x09 && code !== 0x0a) ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}

/**
 * A comment as it is stored and shown: plain text, with line breaks kept,
 * trailing spaces and runs of blank lines trimmed, and invisible controls
 * removed.
 */
export function normalizeCommentBody(text: string): string {
  const unified = text.normalize("NFC").replace(/\r\n?/g, "\n");
  return [...unified]
    .filter((char) => !isHiddenControl(char.codePointAt(0) ?? 0))
    .join("")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Why a comment cannot be posted, or null when it can (check it normalised). */
export function commentBodyProblem(body: string): string | null {
  if (body.length === 0) return "Write something first.";
  if (body.length > COMMENT_BODY_MAX_LENGTH) {
    return `Comments can be at most ${COMMENT_BODY_MAX_LENGTH.toLocaleString("en")} characters.`;
  }
  return null;
}

/** Why a report cannot be sent, or null when it can (note trimmed). */
export function commentReportProblem(
  reason: CommentReportReason,
  note: string,
): string | null {
  if (note.length > COMMENT_REPORT_NOTE_MAX_LENGTH) {
    return `The note can be at most ${COMMENT_REPORT_NOTE_MAX_LENGTH} characters.`;
  }
  if (reason === "other" && note.length === 0) {
    return "Say what is wrong with the comment.";
  }
  return null;
}

export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 40;

// Letters, marks, and digits in any script, with spaces and the punctuation
// names use, starting with a letter or digit. No symbols, emoji, or
// controls, so a name cannot hide text.
const DISPLAY_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} .'’_-]*$/u;

// Words that would make a member look like staff or the site, and whole
// names the page itself shows in place of a name, compared as lowercase
// words without punctuation.
const RESERVED_NAME_WORDS = new Set([
  "admin",
  "administrator",
  "moderator",
  "mod",
  "staff",
  "official",
]);
const RESERVED_NAMES = new Set([
  "you",
  "former member",
  "deleted account",
  "anonymous",
]);
const SITE_NAME = "country topics";

function isReservedName(name: string): boolean {
  const words = name
    .toLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter(Boolean);
  const joined = words.join(" ");
  return (
    words.some((word) => RESERVED_NAME_WORDS.has(word)) ||
    RESERVED_NAMES.has(joined) ||
    joined.includes(SITE_NAME)
  );
}

/** A display name with its spaces tidied; check it with displayNameProblem. */
export function normalizeDisplayName(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

/**
 * Why a display name, the name shown publicly with a member's comments,
 * cannot be used, or null when it can (check it normalised).
 */
export function displayNameProblem(name: string): string | null {
  const length = [...name].length;
  if (length < DISPLAY_NAME_MIN_LENGTH || length > DISPLAY_NAME_MAX_LENGTH) {
    return `Use ${DISPLAY_NAME_MIN_LENGTH} to ${DISPLAY_NAME_MAX_LENGTH} characters.`;
  }
  if (!DISPLAY_NAME_PATTERN.test(name)) {
    return "Use letters, numbers, spaces, and . ' _ - only, starting with a letter or number.";
  }
  if (isReservedName(name)) {
    return "That name could be mistaken for the site or its staff. Choose another.";
  }
  return null;
}
