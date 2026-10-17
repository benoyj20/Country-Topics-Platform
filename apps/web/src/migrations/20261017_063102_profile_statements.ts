import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_individuals_statements_evidence_kind" AS ENUM('document', 'image', 'link', 'snippet');
  CREATE TABLE "individuals_statements_evidence" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kind" "enum_individuals_statements_evidence_kind" DEFAULT 'document' NOT NULL,
  	"title" varchar,
  	"file_id" uuid,
  	"snippet_id" uuid,
  	"url" varchar,
  	"archive_url" varchar,
  	"note" varchar
  );
  
  CREATE TABLE "individuals_statements_sources" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"reference_id" uuid NOT NULL,
  	"passage" varchar NOT NULL,
  	"locator" varchar
  );
  
  CREATE TABLE "individuals_statements" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL
  );
  
  ALTER TABLE "individuals_statements_evidence" ADD CONSTRAINT "individuals_statements_evidence_file_id_media_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "individuals_statements_evidence" ADD CONSTRAINT "individuals_statements_evidence_snippet_id_snippets_id_fk" FOREIGN KEY ("snippet_id") REFERENCES "public"."snippets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "individuals_statements_evidence" ADD CONSTRAINT "individuals_statements_evidence_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."individuals_statements"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "individuals_statements_sources" ADD CONSTRAINT "individuals_statements_sources_reference_id_references_id_fk" FOREIGN KEY ("reference_id") REFERENCES "public"."references"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "individuals_statements_sources" ADD CONSTRAINT "individuals_statements_sources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."individuals_statements"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "individuals_statements" ADD CONSTRAINT "individuals_statements_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."individuals"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "individuals_statements_evidence_order_idx" ON "individuals_statements_evidence" USING btree ("_order");
  CREATE INDEX "individuals_statements_evidence_parent_id_idx" ON "individuals_statements_evidence" USING btree ("_parent_id");
  CREATE INDEX "individuals_statements_evidence_file_idx" ON "individuals_statements_evidence" USING btree ("file_id");
  CREATE INDEX "individuals_statements_evidence_snippet_idx" ON "individuals_statements_evidence" USING btree ("snippet_id");
  CREATE INDEX "individuals_statements_sources_order_idx" ON "individuals_statements_sources" USING btree ("_order");
  CREATE INDEX "individuals_statements_sources_parent_id_idx" ON "individuals_statements_sources" USING btree ("_parent_id");
  CREATE INDEX "individuals_statements_sources_reference_idx" ON "individuals_statements_sources" USING btree ("reference_id");
  CREATE INDEX "individuals_statements_order_idx" ON "individuals_statements" USING btree ("_order");
  CREATE INDEX "individuals_statements_parent_id_idx" ON "individuals_statements" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "individuals_statements_evidence" CASCADE;
  DROP TABLE "individuals_statements_sources" CASCADE;
  DROP TABLE "individuals_statements" CASCADE;
  DROP TYPE "public"."enum_individuals_statements_evidence_kind";`)
}
