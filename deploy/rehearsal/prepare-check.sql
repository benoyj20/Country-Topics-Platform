-- Run by `make scale-check` on the rehearsal database only: invites the two
-- made-up addresses check-stateless.mjs signs in with, and removes the
-- admin's authenticator from an earlier run, which a session cannot replace.
INSERT INTO invitations (id, email, role)
VALUES
  (gen_random_uuid(), 'rehearsal-admin@example.test', 'admin'),
  (gen_random_uuid(), 'rehearsal-member@example.test', 'member')
ON CONFLICT (email) DO NOTHING;

DELETE FROM auth_two_factor
 WHERE "userId" IN (
   SELECT id FROM auth_user WHERE email = 'rehearsal-admin@example.test'
 );
