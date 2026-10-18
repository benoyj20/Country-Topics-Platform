import { sql } from "@payloadcms/db-postgres";
import type { PayloadRequest } from "payload";

import { queueSearchIndex } from "@/content-jobs";
import { transactionDb } from "@/transaction-lock";

// What deleting an account removes besides the profile (ADR 0011). Runs in
// the deletion's transaction (Users' beforeDelete), whether the member
// deleted their own account or an admin deleted it.

/**
 * Deletes the person's notifications and feedback, and erases the text of
 * their comments. Replies by others stay; a thread whose text is erased
 * shows as a placeholder while it has visible replies. Votes and reports
 * stay, without the link to the account, which the database clears.
 */
export async function eraseAccountContent(
  req: PayloadRequest,
  userId: string,
): Promise<void> {
  const db = await transactionDb(req);
  // Holds the profile until the deletion commits, so a comment posted
  // meanwhile waits for it (its author reference checks this row) and then
  // fails, instead of slipping in after the erasure with its text.
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

/**
 * How recently a member must have signed in to delete their account, so
 * that someone at a device left signed in cannot do it.
 */
export const RECENT_SIGN_IN_MS = 10 * 60 * 1_000;

/**
 * Whether a session began recently enough for account deletion. Both times
 * come from this process's clock: Better Auth stamps sessions when it
 * creates them.
 */
export function signedInRecently(
  sessionCreatedAt: Date,
  now: Date = new Date(),
): boolean {
  return now.getTime() - sessionCreatedAt.getTime() <= RECENT_SIGN_IN_MS;
}
