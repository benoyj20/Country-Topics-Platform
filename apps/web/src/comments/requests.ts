import {
  COMMENT_BODY_MAX_LENGTH,
  COMMENT_REPORT_NOTE_MAX_LENGTH,
  COMMENT_REPORT_REASONS,
  type CommentSort,
  DEFAULT_COMMENT_SORT,
  DISPLAY_NAME_MAX_LENGTH,
  isCommentSort,
} from "@countrytopics/domain";
import * as z from "zod";

import { VIEWER_IDS_MAX } from "./store";

// What the comment routes accept (ADR 0009). Bodies are checked here for
// shape; the rules in packages/domain (comments.ts) then check content.

/**
 * JSON bodies larger than this are refused unread. A comment's characters
 * can take up to 4 bytes each in UTF-8 (6 as JSON escapes).
 */
export const COMMENT_REQUEST_MAX_BYTES = COMMENT_BODY_MAX_LENGTH * 6 + 1_024;
/** Bodies of the other writes are a few short fields. */
export const SMALL_REQUEST_MAX_BYTES = 8 * 1_024;

// Text is bounded before normalising, which can only shorten it; the
// domain rules then give the exact limit and message.
export const newCommentSchema = z
  .object({
    body: z.string().max(COMMENT_BODY_MAX_LENGTH * 2),
    parentId: z.uuid().nullable().optional(),
  })
  .strict();

export const voteSchema = z
  .object({ value: z.union([z.literal(-1), z.literal(0), z.literal(1)]) })
  .strict();

export const reportSchema = z
  .object({
    reason: z.enum(COMMENT_REPORT_REASONS),
    note: z
      .string()
      .max(COMMENT_REPORT_NOTE_MAX_LENGTH * 2)
      .optional(),
  })
  .strict();

export const displayNameSchema = z
  .object({ displayName: z.string().max(DISPLAY_NAME_MAX_LENGTH * 4) })
  .strict();

/** zod's issues as sentences naming the field. */
export function problemsOf(error: z.ZodError): string[] {
  return error.issues.map((issue) =>
    issue.path.length > 0
      ? `"${issue.path.join(".")}": ${issue.message}`
      : issue.message,
  );
}

export const commentIdSchema = z.uuid();

type ListParams = {
  sort: CommentSort;
  cursor: string | null;
  problems: string[];
  /** The same request in its one canonical form. */
  canonical: URLSearchParams;
};

/**
 * The parameters of a comment list: `sort` (threads only) and `cursor`,
 * each at most once. Anything else is a problem, so equal requests share
 * one address and one cache entry, as GET /api/v1/topics does.
 */
export function parseListParams(
  params: URLSearchParams,
  { sorted }: { sorted: boolean },
): ListParams {
  const allowed = sorted ? ["sort", "cursor"] : ["cursor"];
  const problems: string[] = [];
  for (const key of new Set(params.keys())) {
    if (!allowed.includes(key)) problems.push(`"${key}" is not a parameter.`);
    else if (params.getAll(key).length > 1) {
      problems.push(`"${key}" was given more than once.`);
    }
  }
  let sort = DEFAULT_COMMENT_SORT;
  const askedSort = params.get("sort");
  if (sorted && askedSort !== null) {
    if (isCommentSort(askedSort)) sort = askedSort;
    else problems.push(`"${askedSort}" is not a way to sort comments.`);
  }
  const cursor = params.get("cursor") || null;
  const canonical = new URLSearchParams();
  if (sort !== DEFAULT_COMMENT_SORT) canonical.set("sort", sort);
  if (cursor) canonical.set("cursor", cursor);
  return { sort, cursor, problems, canonical };
}

/** Comment ids from `?ids=a,b,c`, or the problem with them. */
export function parseIds(
  value: string | null,
): { ids: string[] } | { problem: string } {
  const ids = [...new Set((value ?? "").split(",").filter(Boolean))];
  if (ids.length > VIEWER_IDS_MAX) {
    return { problem: `Ask about at most ${VIEWER_IDS_MAX} comments.` };
  }
  if (ids.some((id) => !commentIdSchema.safeParse(id).success)) {
    return { problem: '"ids" must be comment ids, separated by commas.' };
  }
  return { ids };
}
