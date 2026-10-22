import {
  UPLOAD_MAX_BYTES,
  UPLOAD_TOO_LARGE_MESSAGE,
} from "@countrytopics/domain";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { s3Storage } from "@payloadcms/storage-s3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildConfig, type SanitizedConfig } from "payload";

import { verifiedStaffOnly } from "./access";

import { AuditLog } from "./collections/AuditLog";
import { Categories } from "./collections/Categories";
import { CommentReports } from "./collections/CommentReports";
import { Comments } from "./collections/Comments";
import { CommentVotes } from "./collections/CommentVotes";
import { Countries } from "./collections/Countries";
import { Feedback } from "./collections/Feedback";
import { Individuals } from "./collections/Individuals";
import { Invitations } from "./collections/Invitations";
import { LinkArchives } from "./collections/LinkArchives";
import { Media } from "./collections/Media";
import { Notifications } from "./collections/Notifications";
import { References } from "./collections/References";
import { Snippets } from "./collections/Snippets";
import { Tags } from "./collections/Tags";
import { TopicChanges } from "./collections/TopicChanges";
import { Topics } from "./collections/Topics";
import { Users } from "./collections/Users";
import { Videos } from "./collections/Videos";
import { editor } from "./editor";
import { reportPayloadError } from "./error-reporting/server";
import { serverEnv } from "./env";
import { withStaffWriteLimit } from "./staff-write-limit";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const env = serverEnv();
const DATABASE_CONNECT_TIMEOUT_MS = 5_000;

/** Payload's record of who has a document open, which it adds itself. */
const LOCKED_DOCUMENTS = "payload-locked-documents";

/**
 * Document locks are for verified staff only, and always name whoever took
 * them. Payload adds their collection as it builds the config, open to
 * anyone signed in, so a member could read who edits what, or lock a
 * record to block staff saves; nothing in the config reaches it before
 * then.
 */
function staffOnlyLocks(config: SanitizedConfig): SanitizedConfig {
  const locks = config.collections.find(
    (collection) => collection.slug === LOCKED_DOCUMENTS,
  );
  if (!locks) throw new Error("Payload no longer adds its document locks.");
  locks.access = {
    ...locks.access,
    create: verifiedStaffOnly,
    read: verifiedStaffOnly,
    update: verifiedStaffOnly,
    delete: verifiedStaffOnly,
  };
  locks.hooks.beforeChange.push(({ data, req }) =>
    req.user
      ? { ...data, user: { relationTo: "users", value: req.user.id } }
      : data,
  );
  return config;
}

export default buildConfig({
  // Payload's admin panel is gone (ADR 0014, phase 12): staff use the
  // frontend's admin, on this REST API. Payload still needs to know which
  // collection holds the accounts that sign in.
  admin: { user: Users.slug },
  collections: [
    Topics,
    TopicChanges,
    References,
    Snippets,
    Videos,
    Media,
    LinkArchives,
    Individuals,
    Countries,
    Categories,
    Tags,
    Comments,
    CommentReports,
    CommentVotes,
    Notifications,
    Users,
    Invitations,
    Feedback,
    AuditLog,
    // Payload's own collections (preferences, document locks), which the
    // admin writes as staff work, are left out.
  ].map(withStaffWriteLimit),
  editor,
  // Unexpected failures in the REST API reach error reporting.
  hooks: { afterError: [({ error }) => reportPayloadError(error)] },
  plugins: [
    // Uploads live in S3-compatible storage (AGENTS.md: stateless app
    // containers). Files are still served through Payload, so its access
    // control applies to them.
    s3Storage({
      collections: { media: true },
      bucket: env.storage.bucket,
      config: {
        endpoint: env.storage.endpoint,
        region: env.storage.region,
        credentials: {
          accessKeyId: env.storage.accessKeyId,
          secretAccessKey: env.storage.secretAccessKey,
        },
        // Non-AWS services (SeaweedFS locally, R2, MinIO) expect the bucket
        // in the path rather than the host name.
        forcePathStyle: Boolean(env.storage.endpoint),
      },
    }),
  ],
  upload: {
    // Refuse oversized files instead of storing them cut short.
    limits: { fileSize: UPLOAD_MAX_BYTES },
    abortOnLimit: true,
    responseOnLimit: UPLOAD_TOO_LARGE_MESSAGE,
  },
  // Browsers reach the API only through the frontend, same-origin.
  serverURL: env.siteUrl,
  cors: [env.siteUrl],
  csrf: [env.siteUrl],
  db: postgresAdapter({
    // Fail fast instead of waiting for the OS TCP timeout when the database is
    // unreachable.
    pool: {
      connectionString: env.databaseUrl,
      connectionTimeoutMillis: DATABASE_CONNECT_TIMEOUT_MS,
    },
    readReplicas: env.databaseReplicaUrl ? [env.databaseReplicaUrl] : undefined,
    // Time-ordered UUIDs keep primary key indexes compact (AGENTS.md: UUID keys).
    idType: "uuidv7",
    // Schema changes go through committed migrations, never automatic pushes, so
    // every environment gets the same schema.
    push: false,
    migrationDir: path.resolve(dirname, "migrations"),
  }),
  // The site uses REST and the local API; GraphQL would be unused attack surface.
  graphQL: { disable: true },
  secret: env.payloadSecret,
  telemetry: false,
  typescript: { outputFile: path.resolve(dirname, "payload-types.ts") },
}).then(staffOnlyLocks);
