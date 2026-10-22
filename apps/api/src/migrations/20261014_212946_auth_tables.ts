import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_invitations_role" AS ENUM('member', 'moderator', 'admin');
  CREATE TABLE "invitations" (
  	"id" uuid PRIMARY KEY NOT NULL,
  	"email" varchar NOT NULL,
  	"role" "enum_invitations_role" DEFAULT 'member' NOT NULL,
  	"note" varchar,
  	"invited_by_id" uuid,
  	"accepted_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "audit_log" (
  	"id" uuid PRIMARY KEY NOT NULL,
  	"action" varchar NOT NULL,
  	"actor_id" uuid,
  	"target_collection" varchar NOT NULL,
  	"target_id" varchar NOT NULL,
  	"details" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "invitations_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "audit_log_id" uuid;
  ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_id_users_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "invitations_email_idx" ON "invitations" USING btree ("email");
  CREATE INDEX "invitations_invited_by_idx" ON "invitations" USING btree ("invited_by_id");
  CREATE INDEX "invitations_updated_at_idx" ON "invitations" USING btree ("updated_at");
  CREATE INDEX "invitations_created_at_idx" ON "invitations" USING btree ("created_at");
  CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action");
  CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id");
  CREATE INDEX "audit_log_target_id_idx" ON "audit_log" USING btree ("target_id");
  CREATE INDEX "audit_log_updated_at_idx" ON "audit_log" USING btree ("updated_at");
  CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_invitations_fk" FOREIGN KEY ("invitations_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_audit_log_fk" FOREIGN KEY ("audit_log_id") REFERENCES "public"."audit_log"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_invitations_id_idx" ON "payload_locked_documents_rels" USING btree ("invitations_id");
  CREATE INDEX "payload_locked_documents_rels_audit_log_id_idx" ON "payload_locked_documents_rels" USING btree ("audit_log_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // The lock table's constraints, indexes, and columns go first: dropping the
  // tables with CASCADE would remove the constraints and make these fail.
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_invitations_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_audit_log_fk";
  DROP INDEX "payload_locked_documents_rels_invitations_id_idx";
  DROP INDEX "payload_locked_documents_rels_audit_log_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "invitations_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "audit_log_id";
  ALTER TABLE "invitations" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "audit_log" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "invitations" CASCADE;
  DROP TABLE "audit_log" CASCADE;
  DROP TYPE "public"."enum_invitations_role";`)
}
