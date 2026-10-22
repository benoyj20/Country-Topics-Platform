import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_role" AS ENUM('member', 'moderator', 'admin');
  ALTER TABLE "users" ADD COLUMN "name" varchar;
  ALTER TABLE "users" ADD COLUMN "role" "enum_users_role" DEFAULT 'member' NOT NULL;
  ALTER TABLE "users" ADD COLUMN "auth_user_id" varchar;
  CREATE UNIQUE INDEX "users_auth_user_id_idx" ON "users" USING btree ("auth_user_id");`)

  // Accounts from MVP week 1 could only be made through the admin panel, so they
  // keep admin rights. They have no Better Auth link yet; it is made by email on
  // the person's first sign-in (see src/auth/accounts.ts).
  await db.execute(sql`UPDATE "users" SET "role" = 'admin';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "users_auth_user_id_idx";
  ALTER TABLE "users" DROP COLUMN "name";
  ALTER TABLE "users" DROP COLUMN "role";
  ALTER TABLE "users" DROP COLUMN "auth_user_id";
  DROP TYPE "public"."enum_users_role";`)
}
