import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_topics_people_role" AS ENUM('subject', 'speaker', 'source', 'mentioned');
  CREATE TYPE "public"."enum_topics_state" AS ENUM('draft', 'in_review', 'published', 'updated', 'archived');
  CREATE TYPE "public"."enum_topics_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__topics_v_version_people_role" AS ENUM('subject', 'speaker', 'source', 'mentioned');
  CREATE TYPE "public"."enum__topics_v_version_state" AS ENUM('draft', 'in_review', 'published', 'updated', 'archived');
  CREATE TYPE "public"."enum__topics_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_topic_changes_kind" AS ENUM('published', 'updated', 'archived', 'restored');
  CREATE TABLE "topics_people" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"individual_id" uuid,
  	"role" "enum_topics_people_role" DEFAULT 'subject'
  );
  
  CREATE TABLE "topics" (
  	"id" uuid PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"summary" varchar,
  	"body" jsonb,
  	"category_id" uuid,
  	"ready_for_review" boolean,
  	"archived" boolean,
  	"slug" varchar,
  	"state" "enum_topics_state" DEFAULT 'draft',
  	"first_published_at" timestamp(3) with time zone,
  	"last_published_at" timestamp(3) with time zone,
  	"last_edited_by_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_topics_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "topics_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"countries_id" uuid,
  	"tags_id" uuid
  );
  
  CREATE TABLE "_topics_v_version_people" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY NOT NULL,
  	"individual_id" uuid,
  	"role" "enum__topics_v_version_people_role" DEFAULT 'subject',
  	"_uuid" varchar
  );
  
  CREATE TABLE "_topics_v" (
  	"id" uuid PRIMARY KEY NOT NULL,
  	"parent_id" uuid,
  	"version_title" varchar,
  	"version_summary" varchar,
  	"version_body" jsonb,
  	"version_category_id" uuid,
  	"version_ready_for_review" boolean,
  	"version_archived" boolean,
  	"version_slug" varchar,
  	"version_state" "enum__topics_v_version_state" DEFAULT 'draft',
  	"version_first_published_at" timestamp(3) with time zone,
  	"version_last_published_at" timestamp(3) with time zone,
  	"version_last_edited_by_id" uuid,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__topics_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "_topics_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"countries_id" uuid,
  	"tags_id" uuid
  );
  
  CREATE TABLE "topic_changes" (
  	"id" uuid PRIMARY KEY NOT NULL,
  	"topic_id" uuid NOT NULL,
  	"kind" "enum_topic_changes_kind" NOT NULL,
  	"note" varchar NOT NULL,
  	"version" varchar,
  	"actor_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "topics_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "topic_changes_id" uuid;
  ALTER TABLE "topics_people" ADD CONSTRAINT "topics_people_individual_id_individuals_id_fk" FOREIGN KEY ("individual_id") REFERENCES "public"."individuals"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "topics_people" ADD CONSTRAINT "topics_people_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "topics" ADD CONSTRAINT "topics_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "topics" ADD CONSTRAINT "topics_last_edited_by_id_users_id_fk" FOREIGN KEY ("last_edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "topics_rels" ADD CONSTRAINT "topics_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "topics_rels" ADD CONSTRAINT "topics_rels_countries_fk" FOREIGN KEY ("countries_id") REFERENCES "public"."countries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "topics_rels" ADD CONSTRAINT "topics_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_topics_v_version_people" ADD CONSTRAINT "_topics_v_version_people_individual_id_individuals_id_fk" FOREIGN KEY ("individual_id") REFERENCES "public"."individuals"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_topics_v_version_people" ADD CONSTRAINT "_topics_v_version_people_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_topics_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_topics_v" ADD CONSTRAINT "_topics_v_parent_id_topics_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_topics_v" ADD CONSTRAINT "_topics_v_version_category_id_categories_id_fk" FOREIGN KEY ("version_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_topics_v" ADD CONSTRAINT "_topics_v_version_last_edited_by_id_users_id_fk" FOREIGN KEY ("version_last_edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_topics_v_rels" ADD CONSTRAINT "_topics_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_topics_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_topics_v_rels" ADD CONSTRAINT "_topics_v_rels_countries_fk" FOREIGN KEY ("countries_id") REFERENCES "public"."countries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_topics_v_rels" ADD CONSTRAINT "_topics_v_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "topic_changes" ADD CONSTRAINT "topic_changes_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "topic_changes" ADD CONSTRAINT "topic_changes_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "topics_people_order_idx" ON "topics_people" USING btree ("_order");
  CREATE INDEX "topics_people_parent_id_idx" ON "topics_people" USING btree ("_parent_id");
  CREATE INDEX "topics_people_individual_idx" ON "topics_people" USING btree ("individual_id");
  CREATE INDEX "topics_category_idx" ON "topics" USING btree ("category_id");
  CREATE UNIQUE INDEX "topics_slug_idx" ON "topics" USING btree ("slug");
  CREATE INDEX "topics_state_idx" ON "topics" USING btree ("state");
  CREATE INDEX "topics_first_published_at_idx" ON "topics" USING btree ("first_published_at");
  CREATE INDEX "topics_last_edited_by_idx" ON "topics" USING btree ("last_edited_by_id");
  CREATE INDEX "topics_updated_at_idx" ON "topics" USING btree ("updated_at");
  CREATE INDEX "topics_created_at_idx" ON "topics" USING btree ("created_at");
  CREATE INDEX "topics__status_idx" ON "topics" USING btree ("_status");
  CREATE INDEX "topics_rels_order_idx" ON "topics_rels" USING btree ("order");
  CREATE INDEX "topics_rels_parent_idx" ON "topics_rels" USING btree ("parent_id");
  CREATE INDEX "topics_rels_path_idx" ON "topics_rels" USING btree ("path");
  CREATE INDEX "topics_rels_countries_id_idx" ON "topics_rels" USING btree ("countries_id");
  CREATE INDEX "topics_rels_tags_id_idx" ON "topics_rels" USING btree ("tags_id");
  CREATE INDEX "_topics_v_version_people_order_idx" ON "_topics_v_version_people" USING btree ("_order");
  CREATE INDEX "_topics_v_version_people_parent_id_idx" ON "_topics_v_version_people" USING btree ("_parent_id");
  CREATE INDEX "_topics_v_version_people_individual_idx" ON "_topics_v_version_people" USING btree ("individual_id");
  CREATE INDEX "_topics_v_parent_idx" ON "_topics_v" USING btree ("parent_id");
  CREATE INDEX "_topics_v_version_version_category_idx" ON "_topics_v" USING btree ("version_category_id");
  CREATE INDEX "_topics_v_version_version_slug_idx" ON "_topics_v" USING btree ("version_slug");
  CREATE INDEX "_topics_v_version_version_state_idx" ON "_topics_v" USING btree ("version_state");
  CREATE INDEX "_topics_v_version_version_first_published_at_idx" ON "_topics_v" USING btree ("version_first_published_at");
  CREATE INDEX "_topics_v_version_version_last_edited_by_idx" ON "_topics_v" USING btree ("version_last_edited_by_id");
  CREATE INDEX "_topics_v_version_version_updated_at_idx" ON "_topics_v" USING btree ("version_updated_at");
  CREATE INDEX "_topics_v_version_version_created_at_idx" ON "_topics_v" USING btree ("version_created_at");
  CREATE INDEX "_topics_v_version_version__status_idx" ON "_topics_v" USING btree ("version__status");
  CREATE INDEX "_topics_v_created_at_idx" ON "_topics_v" USING btree ("created_at");
  CREATE INDEX "_topics_v_updated_at_idx" ON "_topics_v" USING btree ("updated_at");
  CREATE INDEX "_topics_v_latest_idx" ON "_topics_v" USING btree ("latest");
  CREATE INDEX "_topics_v_rels_order_idx" ON "_topics_v_rels" USING btree ("order");
  CREATE INDEX "_topics_v_rels_parent_idx" ON "_topics_v_rels" USING btree ("parent_id");
  CREATE INDEX "_topics_v_rels_path_idx" ON "_topics_v_rels" USING btree ("path");
  CREATE INDEX "_topics_v_rels_countries_id_idx" ON "_topics_v_rels" USING btree ("countries_id");
  CREATE INDEX "_topics_v_rels_tags_id_idx" ON "_topics_v_rels" USING btree ("tags_id");
  CREATE INDEX "topic_changes_topic_idx" ON "topic_changes" USING btree ("topic_id");
  CREATE INDEX "topic_changes_actor_idx" ON "topic_changes" USING btree ("actor_id");
  CREATE INDEX "topic_changes_updated_at_idx" ON "topic_changes" USING btree ("updated_at");
  CREATE INDEX "topic_changes_created_at_idx" ON "topic_changes" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_topics_fk" FOREIGN KEY ("topics_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_topic_changes_fk" FOREIGN KEY ("topic_changes_id") REFERENCES "public"."topic_changes"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_topics_id_idx" ON "payload_locked_documents_rels" USING btree ("topics_id");
  CREATE INDEX "payload_locked_documents_rels_topic_changes_id_idx" ON "payload_locked_documents_rels" USING btree ("topic_changes_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // The lock table's constraints, indexes, and columns go first: dropping the
  // tables with CASCADE would remove the constraints and make these fail.
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_topics_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_topic_changes_fk";
  DROP INDEX "payload_locked_documents_rels_topics_id_idx";
  DROP INDEX "payload_locked_documents_rels_topic_changes_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "topics_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "topic_changes_id";
  ALTER TABLE "topics_people" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "topics" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "topics_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_topics_v_version_people" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_topics_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_topics_v_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "topic_changes" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "topics_people" CASCADE;
  DROP TABLE "topics" CASCADE;
  DROP TABLE "topics_rels" CASCADE;
  DROP TABLE "_topics_v_version_people" CASCADE;
  DROP TABLE "_topics_v" CASCADE;
  DROP TABLE "_topics_v_rels" CASCADE;
  DROP TABLE "topic_changes" CASCADE;
  DROP TYPE "public"."enum_topics_people_role";
  DROP TYPE "public"."enum_topics_state";
  DROP TYPE "public"."enum_topics_status";
  DROP TYPE "public"."enum__topics_v_version_people_role";
  DROP TYPE "public"."enum__topics_v_version_state";
  DROP TYPE "public"."enum__topics_v_version_status";
  DROP TYPE "public"."enum_topic_changes_kind";`)
}
