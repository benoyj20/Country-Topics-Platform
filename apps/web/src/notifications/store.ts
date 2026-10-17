import { COMMENT_STATUSES, MODERATION_REASONS } from "@countrytopics/domain";
import type { Pool } from "pg";

import { decodeCommentCursor, encodeCommentCursor } from "@/comments/cursor";
import { PUBLIC_TOPIC } from "@/comments/store";

import { NOTIFICATIONS_PAGE_SIZE, UNREAD_COUNT_MAX } from "./limits";
import type { MemberNotification, NotificationPage } from "./types";

// A member's notifications (ADR 0010), in SQL on the Notifications
// collection's table. They are made where comments change: a reply in
// src/comments/store.ts, a hidden comment in its moderation hooks. A reply
// that a moderator has since hidden is no longer listed or counted.

type Queryable = Pick<Pool, "query">;

const EXCERPT_LENGTH = 200;

const LISTED = `NOT (n.kind = 'reply' AND c.status <> 'visible')`;

function excerpt(text: string): string {
  const chars = [...text];
  return chars.length > EXCERPT_LENGTH
    ? `${chars.slice(0, EXCERPT_LENGTH).join("").trimEnd()}…`
    : text;
}

type Row = {
  id: string;
  kind: string;
  created_at: Date;
  read: boolean;
  comment_id: string;
  status: string;
  reason: string | null;
  body: string;
  author: string | null;
  slug: string | null;
  title: string | null;
};

function notificationOf(row: Row): MemberNotification {
  const base = {
    id: row.id,
    createdAt: row.created_at.toISOString(),
    read: row.read,
    topic: row.slug && row.title ? { slug: row.slug, title: row.title } : null,
    commentId: row.comment_id,
  };
  if (row.kind === "reply") {
    return {
      ...base,
      kind: "reply",
      author: row.author,
      excerpt: excerpt(row.body),
    };
  }
  const status =
    COMMENT_STATUSES.find((value) => value === row.status) ?? "hidden";
  return {
    ...base,
    kind: "comment-hidden",
    status,
    reason: MODERATION_REASONS.find((value) => value === row.reason) ?? null,
    excerpt: status === "removed" ? null : excerpt(row.body),
  };
}

/** A page of a member's notifications, newest first. */
export async function listNotifications(
  db: Queryable,
  recipientId: string,
  cursor: string | null,
): Promise<NotificationPage> {
  const params: unknown[] = [recipientId];
  const conditions = ["n.recipient_id = $1", LISTED];
  if (cursor) {
    const [at, id] = decodeCommentCursor("notifications", cursor);
    params.push(at, id);
    conditions.push(
      `(n.created_at, n.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`,
    );
  }
  params.push(NOTIFICATIONS_PAGE_SIZE + 1);
  const { rows } = await db.query<Row>(
    `SELECT n.id::text AS id, n.kind::text AS kind, n.created_at,
            n.read_at IS NOT NULL AS read, c.id::text AS comment_id,
            c.status::text AS status, c.moderation_reason::text AS reason,
            c.body, u.display_name AS author,
            CASE WHEN ${PUBLIC_TOPIC} THEN t.slug END AS slug,
            CASE WHEN ${PUBLIC_TOPIC} THEN t.title END AS title
       FROM notifications n
       JOIN comments c ON c.id = n.comment_id
       JOIN topics t ON t.id = c.topic_id
       LEFT JOIN users u ON u.id = c.author_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT $${params.length}`,
    params,
  );
  const shown = rows.slice(0, NOTIFICATIONS_PAGE_SIZE);
  const last = shown.at(-1);
  return {
    notifications: shown.map(notificationOf),
    nextCursor:
      rows.length > NOTIFICATIONS_PAGE_SIZE && last
        ? encodeCommentCursor("notifications", [
            last.created_at.toISOString(),
            last.id,
          ])
        : null,
  };
}

/** How many of a member's notifications are unread, up to UNREAD_COUNT_MAX. */
export async function unreadNotifications(
  db: Queryable,
  recipientId: string,
): Promise<number> {
  const { rows } = await db.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM (
       SELECT 1 FROM notifications n JOIN comments c ON c.id = n.comment_id
        WHERE n.recipient_id = $1 AND n.read_at IS NULL AND ${LISTED}
        LIMIT $2
     ) unread`,
    [recipientId, UNREAD_COUNT_MAX],
  );
  return rows[0]?.count ?? 0;
}

/** Marks a member's own notifications as read; returns how many changed. */
export async function markNotificationsRead(
  db: Queryable,
  recipientId: string,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const at = new Date().toISOString();
  const { rowCount } = await db.query(
    `UPDATE notifications SET read_at = $3, updated_at = $3
      WHERE recipient_id = $1 AND id = ANY($2::uuid[]) AND read_at IS NULL`,
    [recipientId, ids, at],
  );
  return rowCount ?? 0;
}
