import { type MigrateDownArgs, type MigrateUpArgs, sql } from "@payloadcms/db-postgres";

// The search index of the PostgreSQL search adapter (packages/search,
// ADR 0008): one row per listed topic, kept by the worker. It is a copy,
// rebuilt from the topics by the worker's hourly rebuild (and on its start,
// which fills it after this migration), so it has no foreign keys and
// Payload's schema does not describe it. Facets are arrays with GIN indexes;
// each sort has an index matching its order, ending with the id for paging.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE "search_topics" (
      "topic_id" uuid PRIMARY KEY NOT NULL,
      "slug" varchar NOT NULL,
      "title" varchar NOT NULL,
      "summary" varchar NOT NULL DEFAULT '',
      "state" varchar NOT NULL,
      "first_published_at" timestamp(3) with time zone NOT NULL,
      "last_published_at" timestamp(3) with time zone NOT NULL,
      "country_ids" uuid[] NOT NULL DEFAULT '{}',
      "category_id" uuid,
      "tag_ids" uuid[] NOT NULL DEFAULT '{}',
      "individual_ids" uuid[] NOT NULL DEFAULT '{}',
      "evidence_kinds" varchar[] NOT NULL DEFAULT '{}',
      "languages" varchar[] NOT NULL DEFAULT '{}',
      "reference_count" integer NOT NULL DEFAULT 0,
      "document" tsvector NOT NULL,
      "version" timestamp(3) with time zone NOT NULL,
      "indexed_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE INDEX "search_topics_document_idx" ON "search_topics" USING gin ("document");
    CREATE INDEX "search_topics_country_ids_idx" ON "search_topics" USING gin ("country_ids");
    CREATE INDEX "search_topics_tag_ids_idx" ON "search_topics" USING gin ("tag_ids");
    CREATE INDEX "search_topics_individual_ids_idx" ON "search_topics" USING gin ("individual_ids");
    CREATE INDEX "search_topics_evidence_kinds_idx" ON "search_topics" USING gin ("evidence_kinds");
    CREATE INDEX "search_topics_languages_idx" ON "search_topics" USING gin ("languages");
    CREATE INDEX "search_topics_category_idx" ON "search_topics" USING btree ("category_id");
    CREATE INDEX "search_topics_newest_idx" ON "search_topics" USING btree ("first_published_at" DESC, "topic_id" DESC);
    CREATE INDEX "search_topics_updated_idx" ON "search_topics" USING btree ("last_published_at" DESC, "topic_id" DESC);
    CREATE INDEX "search_topics_referenced_idx" ON "search_topics" USING btree ("reference_count" DESC, "first_published_at" DESC, "topic_id" DESC);
  `);
}

// The index holds nothing that is not in the topics; dropping it loses no data.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "search_topics";
  `);
}
