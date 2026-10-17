import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_snippets_transcript_timebase" AS ENUM('video', 'clip');
  CREATE TYPE "public"."enum__snippets_v_version_transcript_timebase" AS ENUM('video', 'clip');
  CREATE TYPE "public"."enum_videos_check_status" AS ENUM('pending', 'playable', 'not_embeddable', 'unavailable', 'failed');
  ALTER TYPE "public"."enum_topics_evidence_kind" ADD VALUE 'snippet';
  ALTER TYPE "public"."enum__topics_v_version_evidence_kind" ADD VALUE 'snippet';
  CREATE TABLE "snippets_transcript" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"start_s" numeric NOT NULL,
  	"end_s" numeric NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "snippets" (
  	"id" uuid PRIMARY KEY NOT NULL,
  	"caption" varchar NOT NULL,
  	"youtube_id" varchar NOT NULL,
  	"start_s" numeric NOT NULL,
  	"end_s" numeric NOT NULL,
  	"speaker_id" uuid,
  	"language" varchar DEFAULT 'en' NOT NULL,
  	"transcript_text" varchar,
  	"transcript_timebase" "enum_snippets_transcript_timebase" DEFAULT 'video' NOT NULL,
  	"video_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_snippets_v_version_transcript" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY NOT NULL,
  	"start_s" numeric NOT NULL,
  	"end_s" numeric NOT NULL,
  	"text" varchar NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_snippets_v" (
  	"id" uuid PRIMARY KEY NOT NULL,
  	"parent_id" uuid,
  	"version_caption" varchar NOT NULL,
  	"version_youtube_id" varchar NOT NULL,
  	"version_start_s" numeric NOT NULL,
  	"version_end_s" numeric NOT NULL,
  	"version_speaker_id" uuid,
  	"version_language" varchar DEFAULT 'en' NOT NULL,
  	"version_transcript_text" varchar,
  	"version_transcript_timebase" "enum__snippets_v_version_transcript_timebase" DEFAULT 'video' NOT NULL,
  	"version_video_id" uuid,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "videos" (
  	"id" uuid PRIMARY KEY NOT NULL,
  	"youtube_id" varchar NOT NULL,
  	"title" varchar,
  	"channel" varchar,
  	"duration_s" numeric,
  	"check_status" "enum_videos_check_status" DEFAULT 'pending' NOT NULL,
  	"check_message" varchar,
  	"checked_at" timestamp(3) with time zone,
  	"confirmed_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "topics_evidence" ADD COLUMN "snippet_id" uuid;
  ALTER TABLE "_topics_v_version_evidence" ADD COLUMN "snippet_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "snippets_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "videos_id" uuid;
  ALTER TABLE "snippets_transcript" ADD CONSTRAINT "snippets_transcript_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."snippets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "snippets" ADD CONSTRAINT "snippets_speaker_id_individuals_id_fk" FOREIGN KEY ("speaker_id") REFERENCES "public"."individuals"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "snippets" ADD CONSTRAINT "snippets_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_snippets_v_version_transcript" ADD CONSTRAINT "_snippets_v_version_transcript_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_snippets_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_snippets_v" ADD CONSTRAINT "_snippets_v_parent_id_snippets_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."snippets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_snippets_v" ADD CONSTRAINT "_snippets_v_version_speaker_id_individuals_id_fk" FOREIGN KEY ("version_speaker_id") REFERENCES "public"."individuals"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_snippets_v" ADD CONSTRAINT "_snippets_v_version_video_id_videos_id_fk" FOREIGN KEY ("version_video_id") REFERENCES "public"."videos"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "snippets_transcript_order_idx" ON "snippets_transcript" USING btree ("_order");
  CREATE INDEX "snippets_transcript_parent_id_idx" ON "snippets_transcript" USING btree ("_parent_id");
  CREATE INDEX "snippets_youtube_id_idx" ON "snippets" USING btree ("youtube_id");
  CREATE INDEX "snippets_speaker_idx" ON "snippets" USING btree ("speaker_id");
  CREATE INDEX "snippets_video_idx" ON "snippets" USING btree ("video_id");
  CREATE INDEX "snippets_updated_at_idx" ON "snippets" USING btree ("updated_at");
  CREATE INDEX "snippets_created_at_idx" ON "snippets" USING btree ("created_at");
  CREATE INDEX "_snippets_v_version_transcript_order_idx" ON "_snippets_v_version_transcript" USING btree ("_order");
  CREATE INDEX "_snippets_v_version_transcript_parent_id_idx" ON "_snippets_v_version_transcript" USING btree ("_parent_id");
  CREATE INDEX "_snippets_v_parent_idx" ON "_snippets_v" USING btree ("parent_id");
  CREATE INDEX "_snippets_v_version_version_youtube_id_idx" ON "_snippets_v" USING btree ("version_youtube_id");
  CREATE INDEX "_snippets_v_version_version_speaker_idx" ON "_snippets_v" USING btree ("version_speaker_id");
  CREATE INDEX "_snippets_v_version_version_video_idx" ON "_snippets_v" USING btree ("version_video_id");
  CREATE INDEX "_snippets_v_version_version_updated_at_idx" ON "_snippets_v" USING btree ("version_updated_at");
  CREATE INDEX "_snippets_v_version_version_created_at_idx" ON "_snippets_v" USING btree ("version_created_at");
  CREATE INDEX "_snippets_v_created_at_idx" ON "_snippets_v" USING btree ("created_at");
  CREATE INDEX "_snippets_v_updated_at_idx" ON "_snippets_v" USING btree ("updated_at");
  CREATE UNIQUE INDEX "videos_youtube_id_idx" ON "videos" USING btree ("youtube_id");
  CREATE INDEX "videos_check_status_idx" ON "videos" USING btree ("check_status");
  CREATE INDEX "videos_updated_at_idx" ON "videos" USING btree ("updated_at");
  CREATE INDEX "videos_created_at_idx" ON "videos" USING btree ("created_at");
  ALTER TABLE "topics_evidence" ADD CONSTRAINT "topics_evidence_snippet_id_snippets_id_fk" FOREIGN KEY ("snippet_id") REFERENCES "public"."snippets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_topics_v_version_evidence" ADD CONSTRAINT "_topics_v_version_evidence_snippet_id_snippets_id_fk" FOREIGN KEY ("snippet_id") REFERENCES "public"."snippets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_snippets_fk" FOREIGN KEY ("snippets_id") REFERENCES "public"."snippets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_videos_fk" FOREIGN KEY ("videos_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "topics_evidence_snippet_idx" ON "topics_evidence" USING btree ("snippet_id");
  CREATE INDEX "_topics_v_version_evidence_snippet_idx" ON "_topics_v_version_evidence" USING btree ("snippet_id");
  CREATE INDEX "payload_locked_documents_rels_snippets_id_idx" ON "payload_locked_documents_rels" USING btree ("snippets_id");
  CREATE INDEX "payload_locked_documents_rels_videos_id_idx" ON "payload_locked_documents_rels" USING btree ("videos_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Rolling back would have to delete topic evidence and its history, so it
  // refuses while any topic or topic version uses a snippet. Foreign keys
  // into the snippet tables are dropped before the tables.
  await db.execute(sql`
   DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM "topics_evidence" WHERE "kind" = 'snippet')
       OR EXISTS (SELECT 1 FROM "_topics_v_version_evidence" WHERE "kind" = 'snippet') THEN
      RAISE EXCEPTION 'Topics or their history use video snippets as evidence; this migration cannot be rolled back without deleting them.';
    END IF;
  END $$;
  ALTER TABLE "topics_evidence" DROP CONSTRAINT "topics_evidence_snippet_id_snippets_id_fk";
  ALTER TABLE "_topics_v_version_evidence" DROP CONSTRAINT "_topics_v_version_evidence_snippet_id_snippets_id_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_snippets_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_videos_fk";
  DROP INDEX "topics_evidence_snippet_idx";
  DROP INDEX "_topics_v_version_evidence_snippet_idx";
  DROP INDEX "payload_locked_documents_rels_snippets_id_idx";
  DROP INDEX "payload_locked_documents_rels_videos_id_idx";
  ALTER TABLE "topics_evidence" DROP COLUMN "snippet_id";
  ALTER TABLE "_topics_v_version_evidence" DROP COLUMN "snippet_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "snippets_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "videos_id";
  ALTER TABLE "topics_evidence" ALTER COLUMN "kind" SET DATA TYPE text;
  ALTER TABLE "topics_evidence" ALTER COLUMN "kind" SET DEFAULT 'document'::text;
  DROP TYPE "public"."enum_topics_evidence_kind";
  CREATE TYPE "public"."enum_topics_evidence_kind" AS ENUM('document', 'image', 'link');
  ALTER TABLE "topics_evidence" ALTER COLUMN "kind" SET DEFAULT 'document'::"public"."enum_topics_evidence_kind";
  ALTER TABLE "topics_evidence" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_topics_evidence_kind" USING "kind"::"public"."enum_topics_evidence_kind";
  ALTER TABLE "_topics_v_version_evidence" ALTER COLUMN "kind" SET DATA TYPE text;
  ALTER TABLE "_topics_v_version_evidence" ALTER COLUMN "kind" SET DEFAULT 'document'::text;
  DROP TYPE "public"."enum__topics_v_version_evidence_kind";
  CREATE TYPE "public"."enum__topics_v_version_evidence_kind" AS ENUM('document', 'image', 'link');
  ALTER TABLE "_topics_v_version_evidence" ALTER COLUMN "kind" SET DEFAULT 'document'::"public"."enum__topics_v_version_evidence_kind";
  ALTER TABLE "_topics_v_version_evidence" ALTER COLUMN "kind" SET DATA TYPE "public"."enum__topics_v_version_evidence_kind" USING "kind"::"public"."enum__topics_v_version_evidence_kind";
  ALTER TABLE "snippets_transcript" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "snippets" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_snippets_v_version_transcript" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_snippets_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "videos" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "snippets_transcript" CASCADE;
  DROP TABLE "_snippets_v_version_transcript" CASCADE;
  DROP TABLE "_snippets_v" CASCADE;
  DROP TABLE "snippets" CASCADE;
  DROP TABLE "videos" CASCADE;
  DROP TYPE "public"."enum_snippets_transcript_timebase";
  DROP TYPE "public"."enum__snippets_v_version_transcript_timebase";
  DROP TYPE "public"."enum_videos_check_status";`)
}
