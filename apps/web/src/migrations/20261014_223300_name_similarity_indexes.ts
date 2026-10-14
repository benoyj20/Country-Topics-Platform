import { type MigrateDownArgs, type MigrateUpArgs, sql } from "@payloadcms/db-postgres";

// Trigram indexes for the duplicate warning on individuals (src/individuals/
// duplicates.ts), which finds similar spellings of names and aliases with
// pg_trgm's `%` operator. Payload's schema cannot express these indexes, so
// they live only here; pg_trgm ships with PostgreSQL and any database owner
// may enable it.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    CREATE INDEX "individuals_name_key_trgm_idx"
      ON "individuals" USING gin ("name_key" gin_trgm_ops);
    CREATE INDEX "individuals_aliases_key_trgm_idx"
      ON "individuals_aliases" USING gin ("key" gin_trgm_ops);
  `);
}

// Leaves the extension installed: other database objects may use it.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "individuals_aliases_key_trgm_idx";
    DROP INDEX IF EXISTS "individuals_name_key_trgm_idx";
  `);
}
