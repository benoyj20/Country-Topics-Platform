import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_comments_status" AS ENUM('visible', 'hidden', 'removed');
  CREATE TYPE "public"."enum_comments_moderation_reason" AS ENUM('spam', 'abuse', 'misleading', 'off-topic', 'other');
  CREATE TYPE "public"."enum_comment_reports_status" AS ENUM('open', 'dismissed', 'actioned');
  CREATE TYPE "public"."enum_notifications_kind" AS ENUM('reply', 'comment-hidden');
  CREATE TABLE "notifications" (
  	"id" uuid PRIMARY KEY NOT NULL,
  	"recipient_id" uuid NOT NULL,
  	"kind" "enum_notifications_kind" NOT NULL,
  	"comment_id" uuid NOT NULL,
  	"read_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "comments" ADD COLUMN "status" "enum_comments_status" DEFAULT 'visible' NOT NULL;
  ALTER TABLE "comments" ADD COLUMN "moderation_reason" "enum_comments_moderation_reason";
  ALTER TABLE "comments" ADD COLUMN "moderation_note" varchar;
  ALTER TABLE "comments" ADD COLUMN "locked" boolean DEFAULT false;
  ALTER TABLE "comments" ADD COLUMN "moderated_by_id" uuid;
  ALTER TABLE "comments" ADD COLUMN "moderated_at" timestamp(3) with time zone;
  ALTER TABLE "comment_reports" ADD COLUMN "status" "enum_comment_reports_status" DEFAULT 'open' NOT NULL;
  ALTER TABLE "comment_reports" ADD COLUMN "resolved_by_id" uuid;
  ALTER TABLE "comment_reports" ADD COLUMN "resolved_at" timestamp(3) with time zone;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "notifications_id" uuid;
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "notifications_recipient_idx" ON "notifications" USING btree ("recipient_id");
  CREATE INDEX "notifications_comment_idx" ON "notifications" USING btree ("comment_id");
  CREATE INDEX "notifications_updated_at_idx" ON "notifications" USING btree ("updated_at");
  CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");
  CREATE INDEX "recipient_createdAt_idx" ON "notifications" USING btree ("recipient_id","created_at");
  CREATE UNIQUE INDEX "recipient_comment_kind_idx" ON "notifications" USING btree ("recipient_id","comment_id","kind");
  ALTER TABLE "comments" ADD CONSTRAINT "comments_moderated_by_id_users_id_fk" FOREIGN KEY ("moderated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "comment_reports" ADD CONSTRAINT "comment_reports_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_notifications_fk" FOREIGN KEY ("notifications_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "comments_moderated_by_idx" ON "comments" USING btree ("moderated_by_id");
  CREATE INDEX "comment_reports_resolved_by_idx" ON "comment_reports" USING btree ("resolved_by_id");
  CREATE INDEX "status_createdAt_idx" ON "comment_reports" USING btree ("status","created_at");
  CREATE INDEX "payload_locked_documents_rels_notifications_id_idx" ON "payload_locked_documents_rels" USING btree ("notifications_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "notifications" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "notifications" CASCADE;
  ALTER TABLE "comments" DROP CONSTRAINT "comments_moderated_by_id_users_id_fk";
  
  ALTER TABLE "comment_reports" DROP CONSTRAINT "comment_reports_resolved_by_id_users_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_notifications_fk";
  
  DROP INDEX "comments_moderated_by_idx";
  DROP INDEX "comment_reports_resolved_by_idx";
  DROP INDEX "status_createdAt_idx";
  DROP INDEX "payload_locked_documents_rels_notifications_id_idx";
  ALTER TABLE "comments" DROP COLUMN "status";
  ALTER TABLE "comments" DROP COLUMN "moderation_reason";
  ALTER TABLE "comments" DROP COLUMN "moderation_note";
  ALTER TABLE "comments" DROP COLUMN "locked";
  ALTER TABLE "comments" DROP COLUMN "moderated_by_id";
  ALTER TABLE "comments" DROP COLUMN "moderated_at";
  ALTER TABLE "comment_reports" DROP COLUMN "status";
  ALTER TABLE "comment_reports" DROP COLUMN "resolved_by_id";
  ALTER TABLE "comment_reports" DROP COLUMN "resolved_at";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "notifications_id";
  DROP TYPE "public"."enum_comments_status";
  DROP TYPE "public"."enum_comments_moderation_reason";
  DROP TYPE "public"."enum_comment_reports_status";
  DROP TYPE "public"."enum_notifications_kind";`)
}
