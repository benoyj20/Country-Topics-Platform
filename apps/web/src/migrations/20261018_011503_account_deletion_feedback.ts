import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_feedback_kind" AS ENUM('problem', 'idea', 'other');
  CREATE TYPE "public"."enum_feedback_status" AS ENUM('new', 'done');
  ALTER TYPE "public"."enum_comments_status" ADD VALUE 'deleted';
  CREATE TABLE "feedback" (
  	"id" uuid PRIMARY KEY NOT NULL,
  	"author_id" uuid NOT NULL,
  	"kind" "enum_feedback_kind" NOT NULL,
  	"message" varchar NOT NULL,
  	"page" varchar,
  	"status" "enum_feedback_status" DEFAULT 'new' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "feedback_id" uuid;
  ALTER TABLE "feedback" ADD CONSTRAINT "feedback_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "feedback_author_idx" ON "feedback" USING btree ("author_id");
  CREATE INDEX "feedback_updated_at_idx" ON "feedback" USING btree ("updated_at");
  CREATE INDEX "feedback_created_at_idx" ON "feedback" USING btree ("created_at");
  CREATE INDEX "status_createdAt_1_idx" ON "feedback" USING btree ("status","created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_feedback_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_feedback_id_idx" ON "payload_locked_documents_rels" USING btree ("feedback_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_feedback_fk";
  ALTER TABLE "feedback" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "feedback" CASCADE;
  
  ALTER TABLE "comments" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "comments" ALTER COLUMN "status" SET DEFAULT 'visible'::text;
  -- Comments erased with their author's account stay erased, as removed.
  UPDATE "comments" SET "status" = 'removed' WHERE "status" = 'deleted';
  DROP TYPE "public"."enum_comments_status";
  CREATE TYPE "public"."enum_comments_status" AS ENUM('visible', 'hidden', 'removed');
  ALTER TABLE "comments" ALTER COLUMN "status" SET DEFAULT 'visible'::"public"."enum_comments_status";
  ALTER TABLE "comments" ALTER COLUMN "status" SET DATA TYPE "public"."enum_comments_status" USING "status"::"public"."enum_comments_status";
  DROP INDEX "payload_locked_documents_rels_feedback_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "feedback_id";
  DROP TYPE "public"."enum_feedback_kind";
  DROP TYPE "public"."enum_feedback_status";`)
}
