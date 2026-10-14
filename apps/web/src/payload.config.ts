import { postgresAdapter } from "@payloadcms/db-postgres";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildConfig } from "payload";

import { Users } from "./collections/Users";
import { readServerEnv } from "./env";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const env = readServerEnv();
const DATABASE_CONNECT_TIMEOUT_MS = 5_000;

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: { baseDir: dirname },
    meta: { titleSuffix: " - Country Topics" },
  },
  collections: [Users],
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
