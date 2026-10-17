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
// Moderation (ADR 0010): only visible comments are listed, counted, voted
// on, reported, or replied to. A hidden thread that still has visible
// replies is listed as a placeholder, without its author or text, so the
// replies keep their place. A locked thread takes no new replies or votes.
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
export const PUBLIC_TOPIC = `t._status = 'published' AND t.state IN ('published', 'updated', 'archived')`;

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
const LOCKED = () =>
  new CommentRefusal(
    409,
    "A moderator locked this thread, so it takes no new replies or votes.",
    "locked",
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
  status: string;
};

const COMMENT_COLUMNS = `c.id::text AS id, u.display_name AS author, c.body,
  c.score::int AS score, c.created_at, c.status::text AS status`;

const VISIBLE = "c.status = 'visible'";

function publicComment(row: CommentRow): PublicComment {
  const createdAt = row.created_at.toISOString();
  // Only a thread with visible replies is listed while hidden.
  if (row.status !== "visible") {
    return {
      id: row.id,
      author: null,
      body: "",
      score: 0,
      createdAt,
      hidden: true,
    };
  }
  return {
    id: row.id,
    author: row.author,
    body: row.body,
    score: row.score,
    createdAt,
    hidden: false,
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

type ThreadRow = CommentRow & { reply_count: number; locked: boolean };

/**
 * Up to `shown` threads matching `conditions` (on `c`), with their visible
 * reply counts and first replies; `rows` holds one more when there is
 * one, to tell whether another page follows. Hidden threads are kept only
 * while they have visible replies.
 */
async function loadThreads(
  db: Queryable,
  conditions: string[],
  params: unknown[],
  orderBy: string,
  shown: number,
): Promise<{ rows: ThreadRow[]; threads: CommentThread[] }> {
  params.push(shown + 1);
  const { rows } = await db.query<ThreadRow>(
    `SELECT ${COMMENT_COLUMNS}, c.locked IS TRUE AS locked, replies.count AS reply_count
       FROM comments c
       LEFT JOIN users u ON u.id = c.author_id
       CROSS JOIN LATERAL (
         SELECT count(*)::int AS count FROM comments r
          WHERE r.parent_id = c.id AND r.status = 'visible'
       ) replies
      WHERE c.parent_id IS NULL AND (${VISIBLE} OR replies.count > 0)
        AND ${conditions.join(" AND ")}
      ORDER BY ${orderBy}
      LIMIT $${params.length}`,
    params,
  );
  const listed = rows.slice(0, shown);
  const replies = await firstReplies(
    db,
    listed.filter((row) => row.reply_count > 0).map((row) => row.id),
  );
  return {
    rows,
    threads: listed.map((row): CommentThread => {
      const first = replies.get(row.id) ?? [];
      const lastReply = first.at(-1);
      return {
        ...publicComment(row),
        locked: row.locked,
        replyCount: row.reply_count,
        replies: first.map(publicComment),
        moreReplies:
          row.reply_count > first.length && lastReply
            ? replyCursor(lastReply)
            : null,
      };
    }),
  };
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
  const conditions = ["c.topic_id = $1"];
  if (cursor) conditions.push(after(sort, cursor, order, params));
  const [page, total] = await Promise.all([
    loadThreads(
      db,
      conditions,
      params,
      order.keys.map((key) => `${key} ${order.direction}`).join(", "),
      COMMENT_THREADS_PAGE_SIZE,
    ),
    db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM comments c
        WHERE c.topic_id = $1 AND ${VISIBLE}`,
      [topic.id],
    ),
  ]);
  const last = page.rows[COMMENT_THREADS_PAGE_SIZE - 1];
  return {
    open: topic.open,
    total: total.rows[0]?.count ?? 0,
    threads: page.threads,
    nextCursor:
      page.rows.length > COMMENT_THREADS_PAGE_SIZE && last
        ? threadCursor(sort, last)
        : null,
  };
}

/**
 * The thread holding a comment (the comment itself, or a reply's thread)
 * on a topic, as a list shows it; null when it is not listed there. For
 * links to one comment, such as from a notification.
 */
export async function findThread(
  db: Queryable,
  topic: CommentTopic,
  commentId: string,
): Promise<CommentThread | null> {
  const { threads } = await loadThreads(
    db,
    [
      "c.topic_id = $1",
      `c.id = (SELECT COALESCE(x.parent_id, x.id) FROM comments x
                WHERE x.id = $2 AND x.topic_id = $1)`,
    ],
    [topic.id, commentId],
    "c.id",
    1,
  );
  return threads[0] ?? null;
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
          WHERE c.parent_id = thread.id AND ${VISIBLE}
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
 * A page of a thread's visible replies, after the cursor; null when the id
 * is not a thread (a top-level comment) on a public topic. A hidden
 * thread's replies stay listed.
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
  const conditions = ["c.parent_id = $1", VISIBLE];
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
 * discussions stay two levels deep, and tell that thread's author. The
 * author must have chosen a display name. Returns the comment as the API
 * shows it, and when it was saved.
 */
export async function createComment(
  pool: Pool,
  { topic, authorId, parentId, body }: NewComment,
): Promise<{ comment: PublicComment; updatedAt: string }> {
  if (!topic.open) throw CLOSED();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let threadAuthorId: string | null = null;
    if (parentId) {
      // Locked against a moderator hiding or locking it meanwhile.
      const { rows } = await client.query<{
        topic_id: string;
        parent_id: string | null;
        author_id: string | null;
        status: string;
        locked: boolean;
      }>(
        `SELECT topic_id::text AS topic_id, parent_id::text AS parent_id,
                author_id::text AS author_id, status::text AS status,
                locked IS TRUE AS locked
           FROM comments WHERE id = $1 FOR SHARE`,
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
      if (parent.status !== "visible") throw NOT_FOUND();
      if (parent.locked) throw LOCKED();
      threadAuthorId = parent.author_id;
    }
    const { rows: authors } = await client.query<{
      display_name: string | null;
    }>("SELECT display_name FROM users WHERE id = $1", [authorId]);
    const author = authors[0]?.display_name;
    if (!author) {
      throw new CommentRefusal(
        409,
        "Choose the name shown with your comments first.",
        "display-name-required",
      );
    }
    const at = timestamp();
    const { rows } = await client.query<
      Omit<CommentRow, "author"> & { updated_at: Date }
    >(
      `INSERT INTO comments
         (id, topic_id, parent_id, author_id, body, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       RETURNING id::text AS id, body, score::int AS score, created_at,
                 updated_at, status::text AS status`,
      [uuidv7(), topic.id, parentId, authorId, body, at],
    );
    const saved = rows[0];
    if (!saved) throw new Error("The comment was not saved.");
    if (threadAuthorId && threadAuthorId !== authorId) {
      await client.query(
        `INSERT INTO notifications
           (id, recipient_id, kind, comment_id, created_at, updated_at)
         VALUES ($1, $2, 'reply', $3, $4, $4)`,
        [uuidv7(), threadAuthorId, saved.id, at],
      );
    }
    await client.query("COMMIT");
    return {
      comment: publicComment({ ...saved, author }),
      updatedAt: saved.updated_at.toISOString(),
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * A visible comment on a public topic, for votes and reports; refuses
 * otherwise. `locked` is whether its thread is locked.
 */
async function commentForAction(
  db: Queryable,
  commentId: string,
): Promise<{ authorId: string | null; open: boolean; locked: boolean }> {
  const { rows } = await db.query<{
    author_id: string | null;
    state: string;
    locked: boolean;
  }>(
    `SELECT c.author_id::text AS author_id, t.state::text AS state,
            COALESCE(thread.locked, c.locked) IS TRUE AS locked
       FROM comments c
       JOIN topics t ON t.id = c.topic_id
       LEFT JOIN comments thread ON thread.id = c.parent_id
      WHERE c.id = $1 AND ${VISIBLE} AND ${PUBLIC_TOPIC}`,
    [commentId],
  );
  const comment = rows[0];
  if (!comment) throw NOT_FOUND();
  return {
    authorId: comment.author_id,
    open: comment.state !== "archived",
    locked: comment.locked,
  };
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
    if (comment.locked) throw LOCKED();
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
 * Returns false when they had already reported it. Comments on archived
 * topics and in locked threads can still be reported.
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
