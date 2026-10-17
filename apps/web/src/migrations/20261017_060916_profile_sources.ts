import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "individuals_sources" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"reference_id" uuid NOT NULL,
  	"passage" varchar NOT NULL,
  	"locator" varchar
  );
  
  ALTER TABLE "individuals_sources" ADD CONSTRAINT "individuals_sources_reference_id_references_id_fk" FOREIGN KEY ("reference_id") REFERENCES "public"."references"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "individuals_sources" ADD CONSTRAINT "individuals_sources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."individuals"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "individuals_sources_order_idx" ON "individuals_sources" USING btree ("_order");
  CREATE INDEX "individuals_sources_parent_id_idx" ON "individuals_sources" USING btree ("_parent_id");
  CREATE INDEX "individuals_sources_reference_idx" ON "individuals_sources" USING btree ("reference_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "individuals_sources" CASCADE;`)
}
