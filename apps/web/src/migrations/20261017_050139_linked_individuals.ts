import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// The ids of the individuals that a Lexical body's internal links point to,
// as apps/web/src/editor.ts finds them.
const LINKED_INDIVIDUALS =
  'strict $.** ? (@.fields.linkType == "internal" && @.fields.doc.relationTo == "individuals").fields.doc.value'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "topics_rels" ADD COLUMN "individuals_id" uuid;
  ALTER TABLE "_topics_v_rels" ADD COLUMN "individuals_id" uuid;
  ALTER TABLE "topics_rels" ADD CONSTRAINT "topics_rels_individuals_fk" FOREIGN KEY ("individuals_id") REFERENCES "public"."individuals"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_topics_v_rels" ADD CONSTRAINT "_topics_v_rels_individuals_fk" FOREIGN KEY ("individuals_id") REFERENCES "public"."individuals"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "topics_rels_individuals_id_idx" ON "topics_rels" USING btree ("individuals_id");
  CREATE INDEX "_topics_v_rels_individuals_id_idx" ON "_topics_v_rels" USING btree ("individuals_id");`)
  // Topics saved before this migration get the individuals their bodies link
  // to, as the Topics hook records them on every save from now on: the live
  // documents and every saved version. (One statement per call: Postgres
  // refuses several in a query with parameters.)
  await db.execute(sql`
  INSERT INTO "topics_rels" ("order", "parent_id", "path", "individuals_id")
  SELECT row_number() OVER (PARTITION BY links.parent_id ORDER BY links.first_seen),
    links.parent_id, 'linkedIndividuals', links.individual_id
  FROM (
    SELECT t."id" AS parent_id, i."id" AS individual_id, min(q.ord) AS first_seen
    FROM "topics" t
    CROSS JOIN LATERAL jsonb_path_query(t."body", ${LINKED_INDIVIDUALS}::jsonpath)
      WITH ORDINALITY AS q(value, ord)
    JOIN "individuals" i ON i."id"::text = q.value #>> '{}'
    GROUP BY t."id", i."id"
  ) links`)
  await db.execute(sql`
  INSERT INTO "_topics_v_rels" ("order", "parent_id", "path", "individuals_id")
  SELECT row_number() OVER (PARTITION BY links.parent_id ORDER BY links.first_seen),
    links.parent_id, 'version.linkedIndividuals', links.individual_id
  FROM (
    SELECT v."id" AS parent_id, i."id" AS individual_id, min(q.ord) AS first_seen
    FROM "_topics_v" v
    CROSS JOIN LATERAL jsonb_path_query(v."version_body", ${LINKED_INDIVIDUALS}::jsonpath)
      WITH ORDINALITY AS q(value, ord)
    JOIN "individuals" i ON i."id"::text = q.value #>> '{}'
    GROUP BY v."id", i."id"
  ) links`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "topics_rels" DROP CONSTRAINT "topics_rels_individuals_fk";
  
  ALTER TABLE "_topics_v_rels" DROP CONSTRAINT "_topics_v_rels_individuals_fk";
  
  DROP INDEX "topics_rels_individuals_id_idx";
  DROP INDEX "_topics_v_rels_individuals_id_idx";
  ALTER TABLE "topics_rels" DROP COLUMN "individuals_id";
  ALTER TABLE "_topics_v_rels" DROP COLUMN "individuals_id";`)
}
