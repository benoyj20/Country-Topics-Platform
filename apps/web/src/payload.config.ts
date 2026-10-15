import { postgresAdapter } from "@payloadcms/db-postgres";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildConfig } from "payload";

import { AuditLog } from "./collections/AuditLog";
import { Categories } from "./collections/Categories";
import { Countries } from "./collections/Countries";
import { Individuals } from "./collections/Individuals";
import { Invitations } from "./collections/Invitations";
import { Tags } from "./collections/Tags";
import { TopicChanges } from "./collections/TopicChanges";
import { Topics } from "./collections/Topics";
import { Users } from "./collections/Users";
import { editor } from "./editor";
import { serverEnv } from "./env";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const env = serverEnv();
const DATABASE_CONNECT_TIMEOUT_MS = 5_000;

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: { baseDir: dirname },
    meta: { titleSuffix: " - Country Topics" },
    components: {
      // Payload's password login is off; staff sign in on the site instead.
      beforeLogin: ["/components/admin/RedirectToSignIn#RedirectToSignIn"],
      logout: { Button: "/components/admin/SignOutButton#SignOutButton" },
      // Keeps an admin's session alive while they work in the panel.
      afterNavLinks: ["/components/RefreshSession#RefreshSession"],
    },
  },
  collections: [
    Topics,
    TopicChanges,
    Individuals,
    Countries,
    Categories,
    Tags,
    Users,
    Invitations,
    AuditLog,
  ],
  editor,
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
});
