import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_topics_evidence_kind" AS ENUM('document', 'image', 'link');
  CREATE TYPE "public"."enum_topics_references_stance" AS ENUM('supports', 'contradicts', 'context');
  CREATE TYPE "public"."enum__topics_v_version_evidence_kind" AS ENUM('document', 'image', 'link');
  CREATE TYPE "public"."enum__topics_v_version_references_stance" AS ENUM('supports', 'contradicts', 'context');
  CREATE TYPE "public"."enum_references_kind" AS ENUM('article', 'book', 'chapter', 'report', 'web_page', 'dataset', 'other');
  CREATE TYPE "public"."enum_references_check_status" AS ENUM('pending', 'resolved', 'not_found', 'failed');
  CREATE TYPE "public"."enum__references_v_version_kind" AS ENUM('article', 'book', 'chapter', 'report', 'web_page', 'dataset', 'other');
  CREATE TYPE "public"."enum__references_v_version_check_status" AS ENUM('pending', 'resolved', 'not_found', 'failed');
  CREATE TYPE "public"."enum_media_licence" AS ENUM('public_domain', 'cc_by', 'cc_by_sa', 'other_open', 'permission', 'own_work', 'official_document');
  CREATE TYPE "public"."enum_link_archives_status" AS ENUM('archived', 'not_archived', 'failed');
  CREATE TABLE "topics_evidence" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kind" "enum_topics_evidence_kind" DEFAULT 'document',
  	"title" varchar,
  	"file_id" uuid,
  	"url" varchar,
  	"archive_url" varchar,
  	"note" varchar
  );
  
  CREATE TABLE "topics_references" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"reference_id" uuid,
  	"stance" "enum_topics_references_stance" DEFAULT 'supports',
  	"passage" varchar,
  	"locator" varchar
  );
  
  CREATE TABLE "_topics_v_version_evidence" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY NOT NULL,
  	"kind" "enum__topics_v_version_evidence_kind" DEFAULT 'document',
  	"title" varchar,
  	"file_id" uuid,
  	"url" varchar,
  	"archive_url" varchar,
  	"note" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_topics_v_version_references" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY NOT NULL,
  	"reference_id" uuid,
  	"stance" "enum__topics_v_version_references_stance" DEFAULT 'supports',
  	"passage" varchar,
  	"locator" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "references" (
  	"id" uuid PRIMARY KEY NOT NULL,
  	"doi" varchar,
  	"isbn" varchar,
  	"url" varchar,
  	"kind" "enum_references_kind" DEFAULT 'article' NOT NULL,
  	"published_date" varchar,
  	"title" varchar NOT NULL,
  	"authors" varchar,
  	"container_title" varchar,
  	"publisher" varchar,
  	"check_status" "enum_references_check_status" DEFAULT 'pending' NOT NULL,
  	"check_message" varchar,
  	"checked_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_references_v" (
  	"id" uuid PRIMARY KEY NOT NULL,
  	"parent_id" uuid,
  	"version_doi" varchar,
  	"version_isbn" varchar,
  	"version_url" varchar,
  	"version_kind" "enum__references_v_version_kind" DEFAULT 'article' NOT NULL,
  	"version_published_date" varchar,
  	"version_title" varchar NOT NULL,
  	"version_authors" varchar,
  	"version_container_title" varchar,
  	"version_publisher" varchar,
  	"version_check_status" "enum__references_v_version_check_status" DEFAULT 'pending' NOT NULL,
  	"version_check_message" varchar,
  	"version_checked_at" timestamp(3) with time zone,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "media" (
  	"id" uuid PRIMARY KEY NOT NULL,
  	"alt" varchar NOT NULL,
  	"licence" "enum_media_licence" NOT NULL,
  	"credit" varchar,
  	"source_url" varchar,
  	"_objectkey" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "link_archives" (
  	"id" uuid PRIMARY KEY NOT NULL,
  	"url" varchar NOT NULL,
  	"status" "enum_link_archives_status" NOT NULL,
  	"archive_url" varchar,
  	"captured_at" timestamp(3) with time zone,
  	"message" varchar,
  	"checked_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "individuals" ADD COLUMN "photo_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "references_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "media_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "link_archives_id" uuid;
  ALTER TABLE "topics_evidence" ADD CONSTRAINT "topics_evidence_file_id_media_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "topics_evidence" ADD CONSTRAINT "topics_evidence_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "topics_references" ADD CONSTRAINT "topics_references_reference_id_references_id_fk" FOREIGN KEY ("reference_id") REFERENCES "public"."references"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "topics_references" ADD CONSTRAINT "topics_references_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_topics_v_version_evidence" ADD CONSTRAINT "_topics_v_version_evidence_file_id_media_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_topics_v_version_evidence" ADD CONSTRAINT "_topics_v_version_evidence_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_topics_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_topics_v_version_references" ADD CONSTRAINT "_topics_v_version_references_reference_id_references_id_fk" FOREIGN KEY ("reference_id") REFERENCES "public"."references"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_topics_v_version_references" ADD CONSTRAINT "_topics_v_version_references_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_topics_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_references_v" ADD CONSTRAINT "_references_v_parent_id_references_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."references"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "topics_evidence_order_idx" ON "topics_evidence" USING btree ("_order");
  CREATE INDEX "topics_evidence_parent_id_idx" ON "topics_evidence" USING btree ("_parent_id");
  CREATE INDEX "topics_evidence_file_idx" ON "topics_evidence" USING btree ("file_id");
  CREATE INDEX "topics_references_order_idx" ON "topics_references" USING btree ("_order");
  CREATE INDEX "topics_references_parent_id_idx" ON "topics_references" USING btree ("_parent_id");
  CREATE INDEX "topics_references_reference_idx" ON "topics_references" USING btree ("reference_id");
  CREATE INDEX "_topics_v_version_evidence_order_idx" ON "_topics_v_version_evidence" USING btree ("_order");
  CREATE INDEX "_topics_v_version_evidence_parent_id_idx" ON "_topics_v_version_evidence" USING btree ("_parent_id");
  CREATE INDEX "_topics_v_version_evidence_file_idx" ON "_topics_v_version_evidence" USING btree ("file_id");
  CREATE INDEX "_topics_v_version_references_order_idx" ON "_topics_v_version_references" USING btree ("_order");
  CREATE INDEX "_topics_v_version_references_parent_id_idx" ON "_topics_v_version_references" USING btree ("_parent_id");
  CREATE INDEX "_topics_v_version_references_reference_idx" ON "_topics_v_version_references" USING btree ("reference_id");
  CREATE UNIQUE INDEX "references_doi_idx" ON "references" USING btree ("doi");
  CREATE INDEX "references_isbn_idx" ON "references" USING btree ("isbn");
  CREATE INDEX "references_check_status_idx" ON "references" USING btree ("check_status");
  CREATE INDEX "references_updated_at_idx" ON "references" USING btree ("updated_at");
  CREATE INDEX "references_created_at_idx" ON "references" USING btree ("created_at");
  CREATE INDEX "_references_v_parent_idx" ON "_references_v" USING btree ("parent_id");
  CREATE INDEX "_references_v_version_version_doi_idx" ON "_references_v" USING btree ("version_doi");
  CREATE INDEX "_references_v_version_version_isbn_idx" ON "_references_v" USING btree ("version_isbn");
  CREATE INDEX "_references_v_version_version_check_status_idx" ON "_references_v" USING btree ("version_check_status");
  CREATE INDEX "_references_v_version_version_updated_at_idx" ON "_references_v" USING btree ("version_updated_at");
  CREATE INDEX "_references_v_version_version_created_at_idx" ON "_references_v" USING btree ("version_created_at");
  CREATE INDEX "_references_v_created_at_idx" ON "_references_v" USING btree ("created_at");
  CREATE INDEX "_references_v_updated_at_idx" ON "_references_v" USING btree ("updated_at");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE UNIQUE INDEX "link_archives_url_idx" ON "link_archives" USING btree ("url");
  CREATE INDEX "link_archives_updated_at_idx" ON "link_archives" USING btree ("updated_at");
  CREATE INDEX "link_archives_created_at_idx" ON "link_archives" USING btree ("created_at");
  ALTER TABLE "individuals" ADD CONSTRAINT "individuals_photo_id_media_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_references_fk" FOREIGN KEY ("references_id") REFERENCES "public"."references"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_link_archives_fk" FOREIGN KEY ("link_archives_id") REFERENCES "public"."link_archives"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "individuals_photo_idx" ON "individuals" USING btree ("photo_id");
  CREATE INDEX "payload_locked_documents_rels_references_id_idx" ON "payload_locked_documents_rels" USING btree ("references_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_link_archives_id_idx" ON "payload_locked_documents_rels" USING btree ("link_archives_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Reordered from the generated version: the foreign keys into the new
  // tables are dropped first, because DROP TABLE ... CASCADE removes them and
  // a later DROP CONSTRAINT would then fail.
  await db.execute(sql`
   ALTER TABLE "individuals" DROP CONSTRAINT "individuals_photo_id_media_id_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_references_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_media_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_link_archives_fk";
  DROP INDEX "individuals_photo_idx";
  DROP INDEX "payload_locked_documents_rels_references_id_idx";
  DROP INDEX "payload_locked_documents_rels_media_id_idx";
  DROP INDEX "payload_locked_documents_rels_link_archives_id_idx";
  ALTER TABLE "individuals" DROP COLUMN "photo_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "references_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "media_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "link_archives_id";
  DROP TABLE "topics_evidence" CASCADE;
  DROP TABLE "topics_references" CASCADE;
  DROP TABLE "_topics_v_version_evidence" CASCADE;
  DROP TABLE "_topics_v_version_references" CASCADE;
  DROP TABLE "references" CASCADE;
  DROP TABLE "_references_v" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "link_archives" CASCADE;
  DROP TYPE "public"."enum_topics_evidence_kind";
  DROP TYPE "public"."enum_topics_references_stance";
  DROP TYPE "public"."enum__topics_v_version_evidence_kind";
  DROP TYPE "public"."enum__topics_v_version_references_stance";
  DROP TYPE "public"."enum_references_kind";
  DROP TYPE "public"."enum_references_check_status";
  DROP TYPE "public"."enum__references_v_version_kind";
  DROP TYPE "public"."enum__references_v_version_check_status";
  DROP TYPE "public"."enum_media_licence";
  DROP TYPE "public"."enum_link_archives_status";`)
}
