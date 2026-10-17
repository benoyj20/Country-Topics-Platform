import type {
  CommentReportReason,
  CommentSort,
  CommentVoteValue,
} from "@countrytopics/domain";
import type { Pool } from "pg";
import { v7 as uuidv7 } from "uuid";

import {
  type CommentList,
  decodeCommentCursor,
  encodeCommentCursor,
} from "./cursor";
import type {
  CommentPage,
  CommentThread,
  CommentViewer,
  PublicComment,
  ReplyPage,
} from "./types";

// Comments, votes, and reports (ADR 0009), in SQL on the tables of the
// Comments, CommentVotes, and CommentReports collections. Lists use keyset
// paging on the collections' compound indexes. Every query is
// parameterised; sort expressions come from fixed lists.
//
// Timestamps come from this process, as Payload's do, never from the
// database's now(): a search document's version is the latest updatedAt of
// the topic and the rows it shows, comments included, and comparing values
// from two clocks would let an older document win (the database's clock
// can run ahead of the host's).

const timestamp = () => new Date().toISOString();

/** Threads in one page. */
export const COMMENT_THREADS_PAGE_SIZE = 20;
/** Replies shown with each thread; the rest load on request. */
export const THREAD_REPLIES_SHOWN = 5;
/** Replies in one page of a thread's other replies. */
export const REPLIES_PAGE_SIZE = 50;
/** Comment ids one viewer request may ask about. */
export const VIEWER_IDS_MAX = 200;

type Queryable = Pick<Pool, "query">;

// A topic's comments are public while the topic is: from its first publish,
// including once archived (when they are closed).
const PUBLIC_TOPIC = `t._status = 'published' AND t.state IN ('published', 'updated', 'archived')`;

/** Why a write was refused, with the status and message the API answers. */
export class CommentRefusal extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "CommentRefusal";
  }
}

const NOT_FOUND = () =>
  new CommentRefusal(404, "That comment does not exist or is not public.");
const CLOSED = () =>
  new CommentRefusal(
    409,
    "This topic is archived, so its discussion is closed.",
    "closed",
  );

export type CommentTopic = { id: string; open: boolean };

/** The public topic with this slug, for its comments; null otherwise. */
export async function findCommentTopic(
  db: Queryable,
  slug: string,
): Promise<CommentTopic | null> {
  const { rows } = await db.query<{ id: string; state: string }>(
    `SELECT t.id::text AS id, t.state::text AS state FROM topics t
      WHERE t.slug = $1 AND ${PUBLIC_TOPIC}`,
    [slug],
  );
  const topic = rows[0];
  return topic ? { id: topic.id, open: topic.state !== "archived" } : null;
}

type CommentRow = {
  id: string;
  author: string | null;
  body: string;
  score: number;
  created_at: Date;
};

const COMMENT_COLUMNS = `c.id::text AS id, u.display_name AS author, c.body,
  c.score::int AS score, c.created_at`;

function publicComment(row: CommentRow): PublicComment {
  return {
    id: row.id,
    author: row.author,
    body: row.body,
    score: row.score,
    createdAt: row.created_at.toISOString(),
  };
}

const THREAD_ORDER: Record<
  CommentSort,
  { keys: string[]; types: string[]; direction: "ASC" | "DESC" }
> = {
  top: {
    keys: ["c.score", "c.created_at", "c.id"],
    types: ["numeric", "timestamptz", "uuid"],
    direction: "DESC",
  },
  new: {
    keys: ["c.created_at", "c.id"],
    types: ["timestamptz", "uuid"],
    direction: "DESC",
  },
  old: {
    keys: ["c.created_at", "c.id"],
    types: ["timestamptz", "uuid"],
    direction: "ASC",
  },
};

function threadCursor(sort: CommentSort, row: CommentRow): string {
  const at = row.created_at.toISOString();
  return encodeCommentCursor(
    sort,
    sort === "top" ? [row.score, at, row.id] : [at, row.id],
  );
}

function replyCursor(row: CommentRow): string {
  return encodeCommentCursor("replies", [row.created_at.toISOString(), row.id]);
}

/** `(keys) > (cursor keys)` or `<`, for keyset paging. */
function after(
  list: CommentList,
  cursor: string,
  order: { keys: string[]; types: string[]; direction: "ASC" | "DESC" },
  params: unknown[],
): string {
  const values = decodeCommentCursor(list, cursor);
  const placeholders = values.map((value, index) => {
    params.push(value);
    return `$${params.length}::${order.types[index]}`;
  });
  const comparison = order.direction === "DESC" ? "<" : ">";
  return `(${order.keys.join(", ")}) ${comparison} (${placeholders.join(", ")})`;
}

/** A page of a topic's threads, each with its first replies. */
export async function listThreads(
  db: Queryable,
  topic: CommentTopic,
  sort: CommentSort,
  cursor: string | null,
): Promise<CommentPage> {
  const order = THREAD_ORDER[sort];
  const params: unknown[] = [topic.id];
  const conditions = ["c.topic_id = $1", "c.parent_id IS NULL"];
  if (cursor) conditions.push(after(sort, cursor, order, params));
  params.push(COMMENT_THREADS_PAGE_SIZE + 1);
  const [threads, total] = await Promise.all([
    db.query<CommentRow & { reply_count: number }>(
      `SELECT ${COMMENT_COLUMNS},
              (SELECT count(*)::int FROM comments r WHERE r.parent_id = c.id)
                AS reply_count
         FROM comments c LEFT JOIN users u ON u.id = c.author_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY ${order.keys.map((key) => `${key} ${order.direction}`).join(", ")}
        LIMIT $${params.length}`,
      params,
    ),
    db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM comments WHERE topic_id = $1",
      [topic.id],
    ),
  ]);
  const shown = threads.rows.slice(0, COMMENT_THREADS_PAGE_SIZE);
  const replies = await firstReplies(
    db,
    shown.filter((row) => row.reply_count > 0).map((row) => row.id),
  );
  const last = shown.at(-1);
  return {
    open: topic.open,
    total: total.rows[0]?.count ?? 0,
    threads: shown.map((row): CommentThread => {
      const first = replies.get(row.id) ?? [];
      const lastReply = first.at(-1);
      return {
        ...publicComment(row),
        replyCount: row.reply_count,
        replies: first.map(publicComment),
        moreReplies:
          row.reply_count > first.length && lastReply
            ? replyCursor(lastReply)
            : null,
      };
    }),
    nextCursor:
      threads.rows.length > COMMENT_THREADS_PAGE_SIZE && last
        ? threadCursor(sort, last)
        : null,
  };
}

/** The oldest replies of each thread, in one query. */
async function firstReplies(
  db: Queryable,
  threadIds: string[],
): Promise<Map<string, CommentRow[]>> {
  const byThread = new Map<string, CommentRow[]>();
  if (threadIds.length === 0) return byThread;
  const { rows } = await db.query<CommentRow & { thread_id: string }>(
    `SELECT thread.id::text AS thread_id, r.*
       FROM unnest($1::uuid[]) AS thread(id)
       CROSS JOIN LATERAL (
         SELECT ${COMMENT_COLUMNS}
           FROM comments c LEFT JOIN users u ON u.id = c.author_id
          WHERE c.parent_id = thread.id
          ORDER BY c.created_at, c.id
          LIMIT $2
       ) r`,
    [threadIds, THREAD_REPLIES_SHOWN],
  );
  for (const row of rows) {
    byThread.set(row.thread_id, [...(byThread.get(row.thread_id) ?? []), row]);
  }
  return byThread;
}

const REPLY_ORDER = {
  keys: ["c.created_at", "c.id"],
  types: ["timestamptz", "uuid"],
  direction: "ASC" as const,
};

/**
 * A page of a thread's replies, after the cursor; null when the id is not
 * a thread (a top-level comment) on a public topic.
 */
export async function listReplies(
  db: Queryable,
  threadId: string,
  cursor: string | null,
): Promise<ReplyPage | null> {
  const { rowCount } = await db.query(
    `SELECT 1 FROM comments c JOIN topics t ON t.id = c.topic_id
      WHERE c.id = $1 AND c.parent_id IS NULL AND ${PUBLIC_TOPIC}`,
    [threadId],
  );
  if (!rowCount) return null;
  const params: unknown[] = [threadId];
  const conditions = ["c.parent_id = $1"];
  if (cursor) conditions.push(after("replies", cursor, REPLY_ORDER, params));
  params.push(REPLIES_PAGE_SIZE + 1);
  const { rows } = await db.query<CommentRow>(
    `SELECT ${COMMENT_COLUMNS}
       FROM comments c LEFT JOIN users u ON u.id = c.author_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY c.created_at, c.id
      LIMIT $${params.length}`,
    params,
  );
  const shown = rows.slice(0, REPLIES_PAGE_SIZE);
  const last = shown.at(-1);
  return {
    replies: shown.map(publicComment),
    nextCursor:
      rows.length > REPLIES_PAGE_SIZE && last ? replyCursor(last) : null,
  };
}

export type NewComment = {
  topic: CommentTopic;
  authorId: string;
  /** A thread to reply to; null to start one. */
  parentId: string | null;
  /** Normalised and checked (packages/domain, comments.ts). */
  body: string;
};

/**
 * Saves a comment. Replies go to the comment that starts a thread, so
 * discussions stay two levels deep. The author must have chosen a display
 * name. Returns the comment as the API shows it, and when it was saved.
 */
export async function createComment(
  db: Queryable,
  { topic, authorId, parentId, body }: NewComment,
): Promise<{ comment: PublicComment; updatedAt: string }> {
  if (!topic.open) throw CLOSED();
  if (parentId) {
    const { rows } = await db.query<{
      topic_id: string;
      parent_id: string | null;
    }>(
      `SELECT topic_id::text AS topic_id, parent_id::text AS parent_id
         FROM comments WHERE id = $1`,
      [parentId],
    );
    const parent = rows[0];
    if (!parent || parent.topic_id !== topic.id) throw NOT_FOUND();
    if (parent.parent_id !== null) {
      throw new CommentRefusal(
        400,
        "Replies go to the comment that starts the thread.",
      );
    }
  }
  const { rows: authors } = await db.query<{ display_name: string | null }>(
    "SELECT display_name FROM users WHERE id = $1",
    [authorId],
  );
  const author = authors[0]?.display_name;
  if (!author) {
    throw new CommentRefusal(
      409,
      "Choose the name shown with your comments first.",
      "display-name-required",
    );
  }
  const { rows } = await db.query<
    Omit<CommentRow, "author"> & { updated_at: Date }
  >(
    `INSERT INTO comments
       (id, topic_id, parent_id, author_id, body, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $6)
     RETURNING id::text AS id, body, score::int AS score, created_at, updated_at`,
    [uuidv7(), topic.id, parentId, authorId, body, timestamp()],
  );
  const saved = rows[0];
  if (!saved) throw new Error("The comment was not saved.");
  return {
    comment: publicComment({ ...saved, author }),
    updatedAt: saved.updated_at.toISOString(),
  };
}

/** A comment on a public topic, for votes and reports; refuses otherwise. */
async function commentForAction(
  db: Queryable,
  commentId: string,
): Promise<{ authorId: string | null; open: boolean }> {
  const { rows } = await db.query<{
    author_id: string | null;
    state: string;
  }>(
    `SELECT c.author_id::text AS author_id, t.state::text AS state
       FROM comments c JOIN topics t ON t.id = c.topic_id
      WHERE c.id = $1 AND ${PUBLIC_TOPIC}`,
    [commentId],
  );
  const comment = rows[0];
  if (!comment) throw NOT_FOUND();
  return { authorId: comment.author_id, open: comment.state !== "archived" };
}

/**
 * Sets a member's vote on a comment (0 takes it back) and keeps the
 * comment's score in step, in one transaction. A lock per member and
 * comment makes two votes at once from one member count once; the score
 * itself changes by a relative update, so votes from different members
 * never overwrite each other. The comment's updatedAt is left alone, so a
 * vote does not re-index the topic for search.
 */
export async function voteOnComment(
  pool: Pool,
  {
    voterId,
    commentId,
    value,
  }: { voterId: string; commentId: string; value: CommentVoteValue },
): Promise<{ score: number; value: CommentVoteValue }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const comment = await commentForAction(client, commentId);
    if (comment.authorId === voterId) {
      throw new CommentRefusal(403, "You cannot vote on your own comment.");
    }
    if (!comment.open) throw CLOSED();
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`comment_votes:${commentId}:${voterId}`],
    );
    const { rows: existing } = await client.query<{ value: number }>(
      `SELECT value::int AS value FROM comment_votes
        WHERE comment_id = $1 AND voter_id = $2`,
      [commentId, voterId],
    );
    const previous = existing[0]?.value ?? 0;
    if (value === 0) {
      await client.query(
        "DELETE FROM comment_votes WHERE comment_id = $1 AND voter_id = $2",
        [commentId, voterId],
      );
    } else if (previous === 0) {
      await client.query(
        `INSERT INTO comment_votes
           (id, comment_id, voter_id, value, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $5)`,
        [uuidv7(), commentId, voterId, value, timestamp()],
      );
    } else if (previous !== value) {
      await client.query(
        `UPDATE comment_votes SET value = $3, updated_at = $4
          WHERE comment_id = $1 AND voter_id = $2`,
        [commentId, voterId, value, timestamp()],
      );
    }
    const { rows } = await client.query<{ score: number }>(
      `UPDATE comments SET score = score + $2 WHERE id = $1
       RETURNING score::int AS score`,
      [commentId, value - previous],
    );
    await client.query("COMMIT");
    return { score: rows[0]?.score ?? 0, value };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Records a member's report of a comment, once per member and comment.
 * Returns false when they had already reported it. Archived topics' comments
 * can still be reported.
 */
export async function reportComment(
  db: Queryable,
  {
    reporterId,
    commentId,
    reason,
    note,
  }: {
    reporterId: string;
    commentId: string;
    reason: CommentReportReason;
    /** Trimmed and checked; empty for none. */
    note: string;
  },
): Promise<boolean> {
  const comment = await commentForAction(db, commentId);
  if (comment.authorId === reporterId) {
    throw new CommentRefusal(403, "You cannot report your own comment.");
  }
  const { rowCount } = await db.query(
    `INSERT INTO comment_reports
       (id, comment_id, reporter_id, reason, note, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $6)
     ON CONFLICT (comment_id, reporter_id) DO NOTHING`,
    [uuidv7(), commentId, reporterId, reason, note || null, timestamp()],
  );
  return rowCount === 1;
}

/** A member's votes, reports, and own comments among `commentIds`. */
export async function commentViewer(
  db: Queryable,
  userId: string,
  commentIds: string[],
): Promise<Omit<CommentViewer, "account">> {
  if (commentIds.length === 0) return { votes: {}, reported: [], mine: [] };
  const [votes, reports, mine] = await Promise.all([
    db.query<{ comment_id: string; value: 1 | -1 }>(
      `SELECT comment_id::text AS comment_id, value::int AS value
         FROM comment_votes WHERE voter_id = $1 AND comment_id = ANY($2::uuid[])`,
      [userId, commentIds],
    ),
    db.query<{ comment_id: string }>(
      `SELECT comment_id::text AS comment_id FROM comment_reports
        WHERE reporter_id = $1 AND comment_id = ANY($2::uuid[])`,
      [userId, commentIds],
    ),
    db.query<{ id: string }>(
      `SELECT id::text AS id FROM comments
        WHERE author_id = $1 AND id = ANY($2::uuid[])`,
      [userId, commentIds],
    ),
  ]);
  return {
    votes: Object.fromEntries(
      votes.rows.map((row) => [row.comment_id, row.value]),
    ),
    reported: reports.rows.map((row) => row.comment_id),
    mine: mine.rows.map((row) => row.id),
  };
}
