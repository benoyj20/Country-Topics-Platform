import { createOTP } from "@better-auth/utils/otp";
import type { BetterAuthPlugin } from "better-auth";
import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  getSessionFromCtx,
  sessionMiddleware,
} from "better-auth/api";
import { symmetricDecrypt } from "better-auth/crypto";
import * as z from "zod";

// Better Auth's two-factor plugin only challenges password sign-ins, and this
// site has none: people sign in with Google or an email link. Staff therefore
// confirm a code from their authenticator app after signing in, and the session
// records when they did (`twoFactorVerifiedAt`). The admin panel requires a
// recent confirmation; see canEnterAdminPanel in @countrytopics/domain.
//
// The authenticator must protect against someone who has only the person's
// email or Google account (or session cookie). So once an authenticator is set
// up, the two-factor plugin's other endpoints are closed: nobody can read the
// secret back, switch it off, or set up a different app from a session. Losing
// the app is handled on the host with `make reset-2fa`.

/** Wrong codes allowed before the account's verification is locked. */
export const MAX_VERIFICATION_FAILURES = 5;
export const VERIFICATION_LOCK_MS = 15 * 60 * 1000;

// Must match the two-factor plugin's TOTP settings (its defaults).
const TOTP_DIGITS = 6;
const TOTP_PERIOD_S = 30;

/** Two-factor plugin endpoints used to set up a first authenticator. */
const SETUP_PATHS = new Set(["/two-factor/enable", "/two-factor/verify-totp"]);

type VerificationState = {
  twoFactorEnabled: boolean | null;
  adminVerificationFailures: number | null;
  adminVerificationLockedUntil: Date | null;
};

type TwoFactorRecord = { secret: string; verified: boolean | null };

export const adminVerification = () =>
  ({
    id: "admin-verification",
    schema: {
      session: {
        fields: {
          twoFactorVerifiedAt: { type: "date", required: false, input: false },
        },
      },
      user: {
        fields: {
          adminVerificationFailures: {
            type: "number",
            required: false,
            defaultValue: 0,
            input: false,
            returned: false,
          },
          adminVerificationLockedUntil: {
            type: "date",
            required: false,
            input: false,
            returned: false,
          },
        },
      },
    },
    hooks: {
      before: [
        {
          matcher: (context) =>
            context.path?.startsWith("/two-factor/") ?? false,
          handler: createAuthMiddleware(async (ctx) => {
            const closed = () =>
              APIError.from("FORBIDDEN", {
                code: "TWO_FACTOR_CHANGE_NOT_ALLOWED",
                message:
                  "Your authenticator app is already set up. Ask the site owner to reset it if you lost it.",
              });
            if (!SETUP_PATHS.has(ctx.path)) throw closed();

            const session = await getSessionFromCtx(ctx);
            if (!session) {
              throw APIError.from("UNAUTHORIZED", {
                code: "SIGN_IN_REQUIRED",
                message: "Sign in first.",
              });
            }
            const state = await ctx.context.adapter.findOne<VerificationState>({
              model: "user",
              where: [{ field: "id", value: session.user.id }],
            });
            if (state?.twoFactorEnabled) throw closed();
          }),
        },
      ],
    },
    endpoints: {
      verifyAdminCode: createAuthEndpoint(
        "/admin-verification/verify",
        {
          method: "POST",
          body: z.object({ code: z.string().regex(/^\d{6}$/) }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const { session, user } = ctx.context.session;
          const now = new Date();
          const locked = APIError.from("TOO_MANY_REQUESTS", {
            code: "VERIFICATION_LOCKED",
            message: "Too many wrong codes. Try again in 15 minutes.",
          });

          const state = await ctx.context.adapter.findOne<VerificationState>({
            model: "user",
            where: [{ field: "id", value: user.id }],
          });
          if (
            state?.adminVerificationLockedUntil &&
            state.adminVerificationLockedUntil > now
          ) {
            throw locked;
          }

          const twoFactor = await ctx.context.adapter.findOne<TwoFactorRecord>({
            model: "twoFactor",
            where: [{ field: "userId", value: user.id }],
          });
          if (
            !state?.twoFactorEnabled ||
            !twoFactor ||
            twoFactor.verified === false
          ) {
            throw APIError.from("BAD_REQUEST", {
              code: "TWO_FACTOR_NOT_ENABLED",
              message: "Set up an authenticator app first.",
            });
          }

          const secret = await symmetricDecrypt({
            key: ctx.context.secretConfig,
            data: twoFactor.secret,
          });
          const valid = await createOTP(secret, {
            digits: TOTP_DIGITS,
            period: TOTP_PERIOD_S,
          }).verify(ctx.body.code);

          if (!valid) {
            // Atomic, so parallel guesses cannot all read the same count.
            const counted =
              await ctx.context.adapter.incrementOne<VerificationState>({
                model: "user",
                where: [{ field: "id", value: user.id }],
                increment: { adminVerificationFailures: 1 },
              });
            if (
              (counted?.adminVerificationFailures ?? 0) >=
              MAX_VERIFICATION_FAILURES
            ) {
              await ctx.context.internalAdapter.updateUser(user.id, {
                adminVerificationFailures: 0,
                adminVerificationLockedUntil: new Date(
                  now.getTime() + VERIFICATION_LOCK_MS,
                ),
              });
              throw locked;
            }
            throw APIError.from("UNAUTHORIZED", {
              code: "INVALID_CODE",
              message:
                "That code is not right. Check your authenticator app and try again.",
            });
          }

          await ctx.context.internalAdapter.updateUser(user.id, {
            adminVerificationFailures: 0,
            adminVerificationLockedUntil: null,
          });
          await ctx.context.internalAdapter.updateSession(session.token, {
            twoFactorVerifiedAt: now,
          });
          return ctx.json({ verified: true });
        },
      ),
    },
    rateLimit: [
      {
        pathMatcher: (path: string) => path.startsWith("/admin-verification/"),
        window: 60,
        max: 10,
      },
    ],
  }) satisfies BetterAuthPlugin;
