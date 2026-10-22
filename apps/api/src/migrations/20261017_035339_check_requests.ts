import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "references" ADD COLUMN "check_requested_at" timestamp(3) with time zone;
  ALTER TABLE "_references_v" ADD COLUMN "version_check_requested_at" timestamp(3) with time zone;
  ALTER TABLE "videos" ADD COLUMN "check_requested_at" timestamp(3) with time zone;
  UPDATE "references" SET "check_requested_at" = now() WHERE "check_status" = 'pending';
  UPDATE "videos" SET "check_requested_at" = now() WHERE "check_status" = 'pending';`)
  // Records already waiting get a request time, so the worker's start-up
  // pass queues their checks again; their old jobs carry no request time and
  // are refused.
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "references" DROP COLUMN "check_requested_at";
  ALTER TABLE "_references_v" DROP COLUMN "version_check_requested_at";
  ALTER TABLE "videos" DROP COLUMN "check_requested_at";`)
}
