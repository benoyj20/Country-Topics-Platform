import { isRole, isStaff } from "@countrytopics/domain";
import { sql } from "@payloadcms/db-postgres";
import { APIError, type PayloadRequest } from "payload";

import { queueSearchIndex } from "@/content-jobs";
import { transactionDb } from "@/transaction-lock";

// What deleting an account removes besides the profile (ADR 0011). Runs in
// the deletion's transaction (Users' beforeDelete), whether the member
// deleted their own account or an admin deleted it.

/**
 * Staff do not delete their own account, in the admin panel or anywhere
 * else: another admin does, so the site is never left without one by
 * mistake.
 */
export function refuseOwnStaffDeletion(
  req: PayloadRequest,
  userId: string,
): void {
  const user = req.user;
  if (user?.id !== userId || !isRole(user.role) || !isStaff(user.role)) return;
  throw new APIError(
    "Staff accounts are deleted by an admin. Ask another admin to delete yours.",
    403,
    undefined,
    true,
  );
}

/**
 * Deletes the person's notifications and feedback, and erases the text of
 * their comments. Replies by others stay; a thread whose text is erased
 * shows as a placeholder while it has visible replies. Votes and reports
 * stay, without the link to the account, which the database clears; open
 * reports on the erased comments are closed.
 */
export async function eraseAccountContent(
  req: PayloadRequest,
  userId: string,
): Promise<void> {
  const db = await transactionDb(req);
  // Locks in the order a reply takes them (the thread's comment, then its
  // author's profile, for the notification), so the two cannot deadlock.
  // The profile's lock then holds until the deletion commits: a comment or
  // notification being saved meanwhile references that row, so the
  // deletion waits for it and sees it, and later ones wait and then fail.
  await db.execute(
    sql`SELECT 1 FROM comments WHERE author_id = ${userId} FOR UPDATE`,
  );
  await db.execute(sql`SELECT 1 FROM users WHERE id = ${userId} FOR UPDATE`);

  await req.payload.delete({
    collection: "notifications",
    where: { recipient: { equals: userId } },
    overrideAccess: true,
    req,
  });
  await req.payload.delete({
    collection: "feedback",
    where: { author: { equals: userId } },
    overrideAccess: true,
    req,
  });

  // Removed comments are already erased and keep their status. One time
  // for every row: the search job below waits until a row shows it.
  const at = new Date().toISOString();
  const erased = await db.execute<{
    id: string;
    topic_id: string;
    was_visible: boolean;
  }>(sql`
    WITH own AS (
      SELECT id, status = 'visible' AS was_visible FROM comments
       WHERE author_id = ${userId} AND status <> 'removed'
       FOR UPDATE
    )
    UPDATE comments c
       SET status = 'deleted', body = '', updated_at = ${at}::timestamptz
      FROM own
     WHERE c.id = own.id
    RETURNING c.id::text AS id, c.topic_id::text AS topic_id, own.was_visible
  `);
  // Nothing is left for moderators to act on, as when they hide a comment.
  await db.execute(sql`
    UPDATE comment_reports r
       SET status = 'actioned', resolved_at = ${at}::timestamptz,
           updated_at = ${at}::timestamptz
      FROM comments c
     WHERE r.comment_id = c.id AND c.author_id = ${userId}
       AND r.status = 'open'
  `);

  // Only visible comments counted towards their topics' discussion size.
  const counted = erased.rows.filter((row) => row.was_visible);
  const [first] = counted;
  if (first) {
    await queueSearchIndex(
      req,
      [...new Set(counted.map((row) => row.topic_id))],
      { table: "comments", id: first.id, updatedAt: at },
    );
  }
}
