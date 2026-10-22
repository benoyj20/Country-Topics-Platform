import { type MigrateUpArgs, sql } from "@payloadcms/db-postgres";

// Drops pgvector (ADR 0014, "No pgvector"). Nothing ever used it, and the
// databases now run on the plain postgres:17 image, which lacks it. A
// database that still lists the extension would write `CREATE EXTENSION
// vector` into its backups, which then fail to restore there. Databases
// that never loaded it are left as they are.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`DROP EXTENSION IF EXISTS vector;`);
}

// Nothing to restore: no table, column, or index ever used the extension,
// and the plain image cannot load it.
export async function down(): Promise<void> {}
