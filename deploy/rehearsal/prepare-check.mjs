// Run by `make scale-check` inside a rehearsal web container, so it reaches
// the database that container uses. It invites the two made-up addresses
// check-stateless.mjs signs in with, and removes the admin's authenticator
// from an earlier run, which a session cannot replace, with the same script
// as `make reset-2fa`, and clears its sign-in rate limits. Refuses any
// database whose name does not end in "_rehearsal".
import { execFileSync } from "node:child_process";

import pg from "pg";

const ADMIN = "rehearsal-admin@example.test";
const MEMBER = "rehearsal-member@example.test";

const name = new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);
if (!name.endsWith("_rehearsal")) {
  console.error("Refusing: this is not a rehearsal database.");
  process.exit(2);
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
let adminExists;
try {
  await client.query(
    `INSERT INTO invitations (id, email, role)
     VALUES (gen_random_uuid(), $1, 'admin'), (gen_random_uuid(), $2, 'member')
     ON CONFLICT (email) DO NOTHING`,
    [ADMIN, MEMBER],
  );
  // The check signs in twice through one address; runs close together
  // would otherwise meet Better Auth's sign-in limit (ADR 0010).
  await client.query("DELETE FROM auth_rate_limit");
  const { rows } = await client.query(
    "SELECT 1 FROM auth_user WHERE email = $1",
    [ADMIN],
  );
  adminExists = rows.length > 0;
} finally {
  await client.end();
}
if (adminExists) {
  execFileSync(process.execPath, ["scripts/reset-two-factor.ts", ADMIN], {
    stdio: "inherit",
  });
}
