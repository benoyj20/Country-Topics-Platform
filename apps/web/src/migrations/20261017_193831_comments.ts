import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_comment_reports_reason" AS ENUM('spam', 'abuse', 'misleading', 'off-topic', 'other');
  CREATE TABLE "comments" (
  	"id" uuid PRIMARY KEY NOT NULL,
  	"topic_id" uuid NOT NULL,
  	"parent_id" uuid,
  	"author_id" uuid,
  	"body" varchar NOT NULL,
  	"score" numeric DEFAULT 0 NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "comment_reports" (
  	"id" uuid PRIMARY KEY NOT NULL,
  	"comment_id" uuid NOT NULL,
  	"reporter_id" uuid,
  	"reason" "enum_comment_reports_reason" NOT NULL,
  	"note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "comment_votes" (
  	"id" uuid PRIMARY KEY NOT NULL,
  	"comment_id" uuid NOT NULL,
  	"voter_id" uuid,
  	"value" numeric NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "users" ADD COLUMN "display_name" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "comments_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "comment_reports_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "comment_votes_id" uuid;
  ALTER TABLE "comments" ADD CONSTRAINT "comments_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "comment_reports" ADD CONSTRAINT "comment_reports_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "comment_reports" ADD CONSTRAINT "comment_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "comment_votes" ADD CONSTRAINT "comment_votes_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "comment_votes" ADD CONSTRAINT "comment_votes_voter_id_users_id_fk" FOREIGN KEY ("voter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "comments_topic_idx" ON "comments" USING btree ("topic_id");
  CREATE INDEX "comments_parent_idx" ON "comments" USING btree ("parent_id");
  CREATE INDEX "comments_author_idx" ON "comments" USING btree ("author_id");
  CREATE INDEX "comments_updated_at_idx" ON "comments" USING btree ("updated_at");
  CREATE INDEX "comments_created_at_idx" ON "comments" USING btree ("created_at");
  CREATE INDEX "topic_parent_createdAt_idx" ON "comments" USING btree ("topic_id","parent_id","created_at");
  CREATE INDEX "topic_parent_score_createdAt_idx" ON "comments" USING btree ("topic_id","parent_id","score","created_at");
  CREATE INDEX "parent_createdAt_idx" ON "comments" USING btree ("parent_id","created_at");
  CREATE INDEX "comment_reports_comment_idx" ON "comment_reports" USING btree ("comment_id");
  CREATE INDEX "comment_reports_reporter_idx" ON "comment_reports" USING btree ("reporter_id");
  CREATE INDEX "comment_reports_updated_at_idx" ON "comment_reports" USING btree ("updated_at");
  CREATE INDEX "comment_reports_created_at_idx" ON "comment_reports" USING btree ("created_at");
  CREATE UNIQUE INDEX "comment_reporter_idx" ON "comment_reports" USING btree ("comment_id","reporter_id");
  CREATE INDEX "comment_votes_comment_idx" ON "comment_votes" USING btree ("comment_id");
  CREATE INDEX "comment_votes_voter_idx" ON "comment_votes" USING btree ("voter_id");
  CREATE INDEX "comment_votes_updated_at_idx" ON "comment_votes" USING btree ("updated_at");
  CREATE INDEX "comment_votes_created_at_idx" ON "comment_votes" USING btree ("created_at");
  CREATE UNIQUE INDEX "comment_voter_idx" ON "comment_votes" USING btree ("comment_id","voter_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_comments_fk" FOREIGN KEY ("comments_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_comment_reports_fk" FOREIGN KEY ("comment_reports_id") REFERENCES "public"."comment_reports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_comment_votes_fk" FOREIGN KEY ("comment_votes_id") REFERENCES "public"."comment_votes"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_comments_id_idx" ON "payload_locked_documents_rels" USING btree ("comments_id");
  CREATE INDEX "payload_locked_documents_rels_comment_reports_id_idx" ON "payload_locked_documents_rels" USING btree ("comment_reports_id");
  CREATE INDEX "payload_locked_documents_rels_comment_votes_id_idx" ON "payload_locked_documents_rels" USING btree ("comment_votes_id");`)

  // Added by hand: the search index (packages/search, ADR 0008), which
  // Payload's schema does not describe, counts each topic's comments for
  // "Most discussed" (ADR 0009). Every topic has none yet, so the default
  // is already right for the documents indexed before this migration.
  await db.execute(sql`
    ALTER TABLE "search_topics" ADD COLUMN "comment_count" integer NOT NULL DEFAULT 0;
    CREATE INDEX "search_topics_discussed_idx" ON "search_topics" USING btree ("comment_count" DESC, "first_published_at" DESC, "topic_id" DESC);
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "search_topics_discussed_idx";
    ALTER TABLE "search_topics" DROP COLUMN IF EXISTS "comment_count";
  `)
  await db.execute(sql`
   ALTER TABLE "comments" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "comment_reports" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "comment_votes" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "comments" CASCADE;
  DROP TABLE "comment_reports" CASCADE;
  DROP TABLE "comment_votes" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_comments_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_comment_reports_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_comment_votes_fk";
  
  DROP INDEX "payload_locked_documents_rels_comments_id_idx";
  DROP INDEX "payload_locked_documents_rels_comment_reports_id_idx";
  DROP INDEX "payload_locked_documents_rels_comment_votes_id_idx";
  ALTER TABLE "users" DROP COLUMN "display_name";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "comments_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "comment_reports_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "comment_votes_id";
  DROP TYPE "public"."enum_comment_reports_reason";`)
}
