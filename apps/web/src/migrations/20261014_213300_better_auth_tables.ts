import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Better Auth's tables (accounts, sessions, authenticators, rate limits). The SQL
// comes from Better Auth's own schema generator (getMigrations) for the options in
// src/auth/auth.ts; tests/int/auth.test.ts fails if the two drift apart.

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    create table "auth_user" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "name" text not null, "email" text not null unique, "emailVerified" boolean not null, "image" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null, "twoFactorEnabled" boolean, "adminVerificationFailures" integer, "adminVerificationLockedUntil" timestamptz);
    create table "auth_session" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "expiresAt" timestamptz not null, "token" text not null unique, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null, "ipAddress" text, "userAgent" text, "userId" uuid not null references "auth_user" ("id") on delete cascade, "twoFactorVerifiedAt" timestamptz);
    create table "auth_account" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "accountId" text not null, "providerId" text not null, "userId" uuid not null references "auth_user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, "scope" text, "password" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null);
    create table "auth_verification" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "identifier" text not null, "value" text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);
    create table "auth_two_factor" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "secret" text not null, "backupCodes" text not null, "userId" uuid not null references "auth_user" ("id") on delete cascade, "verified" boolean, "failedVerificationCount" integer, "lockedUntil" timestamptz);
    create table "auth_rate_limit" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "key" text not null unique, "count" integer not null, "lastRequest" bigint not null);
    create index "auth_session_userId_idx" on "auth_session" ("userId");
    create index "auth_account_userId_idx" on "auth_account" ("userId");
    create index "auth_verification_identifier_idx" on "auth_verification" ("identifier");
    create index "auth_two_factor_secret_idx" on "auth_two_factor" ("secret");
    create index "auth_two_factor_userId_idx" on "auth_two_factor" ("userId");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE "auth_rate_limit";
    DROP TABLE "auth_two_factor";
    DROP TABLE "auth_verification";
    DROP TABLE "auth_account";
    DROP TABLE "auth_session";
    DROP TABLE "auth_user";
  `)
}
