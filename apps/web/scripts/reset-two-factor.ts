// Removes a person's authenticator app so they can set up a new one, for staff
// who lost their phone. Run on the host that holds DATABASE_URL:
//
//   make reset-2fa EMAIL=person@example.org
//
// It signs them out of the admin panel everywhere (their sessions lose the
// verification mark) but keeps their account, profile, and role.

import pg from "pg";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes("@")) {
  console.error("Usage: make reset-2fa EMAIL=person@example.org");
  process.exit(2);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set");
  process.exit(2);
}

const client = new pg.Client({
  connectionString: databaseUrl,
  connectionTimeoutMillis: 5_000,
});
await client.connect();
try {
  await client.query("BEGIN");
  const user = await client.query<{ id: string }>(
    `SELECT id FROM auth_user WHERE email = $1`,
    [email],
  );
  const userId = user.rows[0]?.id;
  if (!userId) {
    await client.query("ROLLBACK");
    console.error(`No account signs in with ${email}`);
    process.exitCode = 1;
  } else {
    await client.query(`DELETE FROM auth_two_factor WHERE "userId" = $1`, [
      userId,
    ]);
    await client.query(
      `UPDATE auth_user SET "twoFactorEnabled" = false, "adminVerificationFailures" = 0,
         "adminVerificationLockedUntil" = NULL WHERE id = $1`,
      [userId],
    );
    await client.query(
      `UPDATE auth_session SET "twoFactorVerifiedAt" = NULL WHERE "userId" = $1`,
      [userId],
    );
    await client.query("COMMIT");
    console.log(
      `Removed the authenticator for ${email}; they can set up a new one on /account.`,
    );
  }
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
