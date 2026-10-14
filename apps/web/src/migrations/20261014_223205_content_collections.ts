import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "individuals_aliases" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"key" varchar
  );
  
  CREATE TABLE "individuals_countries" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"country_id" uuid NOT NULL,
  	"role" varchar,
  	"start_date" varchar,
  	"end_date" varchar
  );
  
  CREATE TABLE "individuals_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"url" varchar NOT NULL
  );
  
  CREATE TABLE "individuals" (
  	"id" uuid PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"summary" varchar,
  	"bio" varchar,
  	"wikidata_id" varchar,
  	"slug" varchar NOT NULL,
  	"name_key" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "countries" (
  	"id" uuid PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"code" varchar NOT NULL,
  	"alpha3" varchar NOT NULL,
  	"numeric_code" varchar NOT NULL,
  	"iso_name" varchar NOT NULL,
  	"region" varchar,
  	"subregion" varchar,
  	"slug" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "categories" (
  	"id" uuid PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"slug" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "tags" (
  	"id" uuid PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "individuals_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "countries_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "categories_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "tags_id" uuid;
  ALTER TABLE "individuals_aliases" ADD CONSTRAINT "individuals_aliases_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."individuals"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "individuals_countries" ADD CONSTRAINT "individuals_countries_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "individuals_countries" ADD CONSTRAINT "individuals_countries_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."individuals"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "individuals_links" ADD CONSTRAINT "individuals_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."individuals"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "individuals_aliases_order_idx" ON "individuals_aliases" USING btree ("_order");
  CREATE INDEX "individuals_aliases_parent_id_idx" ON "individuals_aliases" USING btree ("_parent_id");
  CREATE INDEX "individuals_aliases_key_idx" ON "individuals_aliases" USING btree ("key");
  CREATE INDEX "individuals_countries_order_idx" ON "individuals_countries" USING btree ("_order");
  CREATE INDEX "individuals_countries_parent_id_idx" ON "individuals_countries" USING btree ("_parent_id");
  CREATE INDEX "individuals_countries_country_idx" ON "individuals_countries" USING btree ("country_id");
  CREATE INDEX "individuals_links_order_idx" ON "individuals_links" USING btree ("_order");
  CREATE INDEX "individuals_links_parent_id_idx" ON "individuals_links" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "individuals_wikidata_id_idx" ON "individuals" USING btree ("wikidata_id");
  CREATE UNIQUE INDEX "individuals_slug_idx" ON "individuals" USING btree ("slug");
  CREATE INDEX "individuals_name_key_idx" ON "individuals" USING btree ("name_key");
  CREATE INDEX "individuals_updated_at_idx" ON "individuals" USING btree ("updated_at");
  CREATE INDEX "individuals_created_at_idx" ON "individuals" USING btree ("created_at");
  CREATE INDEX "countries_name_idx" ON "countries" USING btree ("name");
  CREATE UNIQUE INDEX "countries_code_idx" ON "countries" USING btree ("code");
  CREATE UNIQUE INDEX "countries_alpha3_idx" ON "countries" USING btree ("alpha3");
  CREATE UNIQUE INDEX "countries_numeric_code_idx" ON "countries" USING btree ("numeric_code");
  CREATE INDEX "countries_region_idx" ON "countries" USING btree ("region");
  CREATE UNIQUE INDEX "countries_slug_idx" ON "countries" USING btree ("slug");
  CREATE INDEX "countries_updated_at_idx" ON "countries" USING btree ("updated_at");
  CREATE INDEX "countries_created_at_idx" ON "countries" USING btree ("created_at");
  CREATE UNIQUE INDEX "categories_name_idx" ON "categories" USING btree ("name");
  CREATE UNIQUE INDEX "categories_slug_idx" ON "categories" USING btree ("slug");
  CREATE INDEX "categories_updated_at_idx" ON "categories" USING btree ("updated_at");
  CREATE INDEX "categories_created_at_idx" ON "categories" USING btree ("created_at");
  CREATE UNIQUE INDEX "tags_name_idx" ON "tags" USING btree ("name");
  CREATE UNIQUE INDEX "tags_slug_idx" ON "tags" USING btree ("slug");
  CREATE INDEX "tags_updated_at_idx" ON "tags" USING btree ("updated_at");
  CREATE INDEX "tags_created_at_idx" ON "tags" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_individuals_fk" FOREIGN KEY ("individuals_id") REFERENCES "public"."individuals"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_countries_fk" FOREIGN KEY ("countries_id") REFERENCES "public"."countries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_individuals_id_idx" ON "payload_locked_documents_rels" USING btree ("individuals_id");
  CREATE INDEX "payload_locked_documents_rels_countries_id_idx" ON "payload_locked_documents_rels" USING btree ("countries_id");
  CREATE INDEX "payload_locked_documents_rels_categories_id_idx" ON "payload_locked_documents_rels" USING btree ("categories_id");
  CREATE INDEX "payload_locked_documents_rels_tags_id_idx" ON "payload_locked_documents_rels" USING btree ("tags_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "individuals_aliases" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "individuals_countries" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "individuals_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "individuals" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "countries" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "categories" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "tags" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "individuals_aliases" CASCADE;
  DROP TABLE "individuals_countries" CASCADE;
  DROP TABLE "individuals_links" CASCADE;
  DROP TABLE "individuals" CASCADE;
  DROP TABLE "countries" CASCADE;
  DROP TABLE "categories" CASCADE;
  DROP TABLE "tags" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_individuals_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_countries_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_categories_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_tags_fk";
  
  DROP INDEX "payload_locked_documents_rels_individuals_id_idx";
  DROP INDEX "payload_locked_documents_rels_countries_id_idx";
  DROP INDEX "payload_locked_documents_rels_categories_id_idx";
  DROP INDEX "payload_locked_documents_rels_tags_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "individuals_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "countries_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "categories_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "tags_id";`)
}
