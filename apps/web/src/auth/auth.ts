import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { magicLink, twoFactor } from "better-auth/plugins";
import { Pool } from "pg";

import { serverEnv } from "@/env";
import { emailQueue } from "@/jobs";
import { loadPayload } from "@/payload-instance";

import { ensureUserProfile, maySignIn } from "./accounts";
import { adminVerification } from "./admin-verification";

export const MAGIC_LINK_EXPIRES_IN_MINUTES = 10;
const SESSION_EXPIRES_IN_S = 7 * 24 * 60 * 60;
const SESSION_UPDATE_AGE_S = 24 * 60 * 60;
const DATABASE_CONNECT_TIMEOUT_MS = 5_000;

export const NOT_INVITED_ERROR = "NOT_INVITED";

function createAuth() {
  const env = serverEnv();

  return betterAuth({
    appName: "Country Topics",
    baseURL: env.siteUrl,
    secret: env.betterAuthSecret,
    trustedOrigins: [env.siteUrl],
    database: new Pool({
      connectionString: env.databaseUrl,
      connectionTimeoutMillis: DATABASE_CONNECT_TIMEOUT_MS,
    }),
    advanced: {
      database: { generateId: "uuid" },
      useSecureCookies: env.siteUrl.startsWith("https://"),
    },
    // Prefixed so they sit apart from Payload's tables (`users` holds profiles).
    user: { modelName: "auth_user" },
    session: {
      modelName: "auth_session",
      expiresIn: SESSION_EXPIRES_IN_S,
      updateAge: SESSION_UPDATE_AGE_S,
    },
    account: {
      modelName: "auth_account",
      // The same person may use Google and an email link with one address.
      accountLinking: { enabled: true, trustedProviders: ["google"] },
    },
    verification: { modelName: "auth_verification" },
    emailAndPassword: { enabled: false },
    socialProviders: env.google
      ? { google: { ...env.google, prompt: "select_account" } }
      : {},
    // Stored in PostgreSQL so limits hold across several web containers.
    rateLimit: {
      enabled: process.env.NODE_ENV !== "test",
      storage: "database",
      modelName: "auth_rate_limit",
    },
    plugins: [
      magicLink({
        expiresIn: MAGIC_LINK_EXPIRES_IN_MINUTES * 60,
        sendMagicLink: async ({ email, url }) => {
          // Addresses that may not sign in get no email. The response is the
          // same either way, so it does not reveal who is invited.
          if (!(await maySignIn(await loadPayload(), email))) return;
          await emailQueue().enqueue({
            kind: "magic-link",
            to: email,
            url,
            expiresInMinutes: MAGIC_LINK_EXPIRES_IN_MINUTES,
          });
        },
      }),
      twoFactor({
        issuer: "Country Topics",
        allowPasswordless: true,
        twoFactorTable: "auth_two_factor",
      }),
      adminVerification(),
    ],
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!(await maySignIn(await loadPayload(), user.email))) {
              throw APIError.from("FORBIDDEN", {
                code: NOT_INVITED_ERROR,
                message: "This site is invite-only during the pilot.",
              });
            }
          },
          after: async (user) => {
            await ensureUserProfile(await loadPayload(), user);
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

declare global {
  // Reused across hot reloads in development so database pools do not pile up.
  var countryTopicsAuth: Auth | undefined;
}

/** The Better Auth instance, created on first use from the server configuration. */
export function getAuth(): Auth {
  globalThis.countryTopicsAuth ??= createAuth();
  return globalThis.countryTopicsAuth;
}
