import type { Pool } from "pg";

import type { User } from "@/payload-types";

// A member's copy of what the site holds about them (ADR 0011), from
// GET /api/v1/account/export. It lists what was stored, as stored: the
// text of their hidden comments too, but not staff's notes about them.

export type AccountExport = {
  exportedAt: string;
  account: {
    email: string;
    name: string | null;
    displayName: string | null;
    role: string;
    createdAt: string;
  };
  /**
   * Sign-in providers linked to the account, as Better Auth names them
   * ("google"). Email links need none.
   */
  linkedAccounts: string[];
  /** Sign-in sessions stored for the account. */
  sessions: {
    createdAt: string;
    expiresAt: string;
    ipAddress: string | null;
    userAgent: string | null;
  }[];
  comments: {
    id: string;
    topic: string | null;
    replyTo: string | null;
    text: string;
    status: string;
    moderationReason: string | null;
    score: number;
    createdAt: string;
  }[];
  votes: { comment: string | null; value: number; createdAt: string }[];
  reports: {
    comment: string | null;
    reason: string;
    note: string | null;
    status: string;
    createdAt: string;
  }[];
  notifications: {
    kind: string;
    comment: string | null;
    createdAt: string;
    readAt: string | null;
  }[];
  feedback: {
    kind: string;
    message: string;
    page: string | null;
    status: string;
    createdAt: string;
  }[];
};

/**
 * Everything listed in AccountExport for `profile`, read from the primary
 * one query after another, so an export holds one connection at a time.
 */
export async function accountExport(
  pool: Pool,
  profile: User,
): Promise<AccountExport> {
  const authUserId = profile.authUserId ?? null;
  const methods = await pool.query<{ provider: string }>(
    `SELECT DISTINCT "providerId" AS provider FROM auth_account
      WHERE "userId" = $1 ORDER BY 1`,
    [authUserId],
  );
  const sessions = await pool.query<{
    created_at: Date;
    expires_at: Date;
    ip_address: string | null;
    user_agent: string | null;
  }>(
    `SELECT "createdAt" AS created_at, "expiresAt" AS expires_at,
            "ipAddress" AS ip_address, "userAgent" AS user_agent
      FROM auth_session WHERE "userId" = $1 ORDER BY "createdAt"`,
    [authUserId],
  );
  const comments = await pool.query<{
    id: string;
    topic: string | null;
    parent_id: string | null;
    body: string;
    status: string;
    moderation_reason: string | null;
    score: number;
    created_at: Date;
  }>(
    `SELECT c.id::text AS id, t.slug AS topic, c.parent_id::text AS parent_id,
            c.body, c.status::text AS status,
            c.moderation_reason::text AS moderation_reason,
            c.score::int AS score, c.created_at
      FROM comments c LEFT JOIN topics t ON t.id = c.topic_id
      WHERE c.author_id = $1 ORDER BY c.created_at, c.id`,
    [profile.id],
  );
  const votes = await pool.query<{
    comment: string | null;
    value: number;
    created_at: Date;
  }>(
    `SELECT comment_id::text AS comment, value::int AS value, created_at
      FROM comment_votes WHERE voter_id = $1 ORDER BY created_at, id`,
    [profile.id],
  );
  const reports = await pool.query<{
    comment: string | null;
    reason: string;
    note: string | null;
    status: string;
    created_at: Date;
  }>(
    `SELECT comment_id::text AS comment, reason::text AS reason, note,
            status::text AS status, created_at
      FROM comment_reports WHERE reporter_id = $1 ORDER BY created_at, id`,
    [profile.id],
  );
  const notes = await pool.query<{
    kind: string;
    comment: string | null;
    created_at: Date;
    read_at: Date | null;
  }>(
    `SELECT kind::text AS kind, comment_id::text AS comment, created_at,
            read_at
      FROM notifications WHERE recipient_id = $1 ORDER BY created_at, id`,
    [profile.id],
  );
  const feedback = await pool.query<{
    kind: string;
    message: string;
    page: string | null;
    status: string;
    created_at: Date;
  }>(
    `SELECT kind::text AS kind, message, page, status::text AS status,
            created_at
      FROM feedback WHERE author_id = $1 ORDER BY created_at, id`,
    [profile.id],
  );

  return {
    exportedAt: new Date().toISOString(),
    account: {
      email: profile.email,
      name: profile.name ?? null,
      displayName: profile.displayName ?? null,
      role: profile.role,
      createdAt: profile.createdAt,
    },
    linkedAccounts: methods.rows.map((row) => row.provider),
    sessions: sessions.rows.map((row) => ({
      createdAt: row.created_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
    })),
    comments: comments.rows.map((row) => ({
      id: row.id,
      topic: row.topic,
      replyTo: row.parent_id,
      text: row.body,
      status: row.status,
      moderationReason: row.moderation_reason,
      score: row.score,
      createdAt: row.created_at.toISOString(),
    })),
    votes: votes.rows.map((row) => ({
      comment: row.comment,
      value: row.value,
      createdAt: row.created_at.toISOString(),
    })),
    reports: reports.rows.map((row) => ({
      comment: row.comment,
      reason: row.reason,
      note: row.note,
      status: row.status,
      createdAt: row.created_at.toISOString(),
    })),
    notifications: notes.rows.map((row) => ({
      kind: row.kind,
      comment: row.comment,
      createdAt: row.created_at.toISOString(),
      readAt: row.read_at ? row.read_at.toISOString() : null,
    })),
    feedback: feedback.rows.map((row) => ({
      kind: row.kind,
      message: row.message,
      page: row.page,
      status: row.status,
      createdAt: row.created_at.toISOString(),
    })),
  };
}
