import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "_topics_v" ADD COLUMN "autosave" boolean;
  CREATE INDEX "_topics_v_autosave_idx" ON "_topics_v" USING btree ("autosave");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "_topics_v_autosave_idx";
  ALTER TABLE "_topics_v" DROP COLUMN "autosave";`)
}
