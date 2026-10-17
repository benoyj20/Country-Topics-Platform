import type { CommentSort } from "@countrytopics/domain";
import * as z from "zod";

// Page cursors for comment lists: the last comment's sort keys, as
// base64url JSON, checked against the list they are used with. Scores
// change between pages, so "top" can repeat or skip a comment whose score
// changed meanwhile; dates and ids never change.

export type CommentList = CommentSort | "replies";

/** Cursors longer than this were not issued here. */
const CURSOR_MAX_LENGTH = 200;

const iso = z.iso.datetime();
const uuid = z.uuid();
const KEYS = {
  top: z.tuple([z.number().int(), iso, uuid]),
  new: z.tuple([iso, uuid]),
  old: z.tuple([iso, uuid]),
  replies: z.tuple([iso, uuid]),
} as const;

type Keys = (string | number)[];

export class InvalidCommentCursorError extends Error {
  constructor() {
    super("The page cursor is not valid for these comments.");
    this.name = "InvalidCommentCursorError";
  }
}

export function encodeCommentCursor(list: CommentList, keys: Keys): string {
  return Buffer.from(JSON.stringify({ l: list, k: keys })).toString(
    "base64url",
  );
}

/** The keys a cursor holds; throws InvalidCommentCursorError otherwise. */
export function decodeCommentCursor(list: CommentList, cursor: string): Keys {
  if (cursor.length > CURSOR_MAX_LENGTH || !/^[\w-]+$/.test(cursor)) {
    throw new InvalidCommentCursorError();
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new InvalidCommentCursorError();
  }
  const parsed = z
    .object({ l: z.literal(list), k: KEYS[list] })
    .safeParse(decoded);
  if (!parsed.success) throw new InvalidCommentCursorError();
  return parsed.data.k;
}
