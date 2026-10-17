import { base32 } from "@better-auth/utils/base32";
import { createSmtpSender } from "@countrytopics/email";
import { createEmailWorker, createRedisConnection } from "@countrytopics/jobs";
import { createOTP } from "@better-auth/utils/otp";
import config from "@payload-config";
import { REST_GET, REST_PATCH, REST_POST } from "@payloadcms/next/routes";
import type { Payload } from "payload";
import * as z from "zod";

import { getAuth } from "@/auth/auth";
import { serverEnv } from "@/env";
import type { User } from "@/payload-types";

export const SITE_URL = "http://localhost:3000";
const MAILPIT_URL = process.env.TEST_MAILPIT_URL ?? "http://localhost:8025";
const MAIL_WAIT_MS = 15_000;
const MAIL_POLL_MS = 250;

export const UUID_V7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Runs the real worker code on the tests' own queue, sending through Mailpit.
 * Returns a function that stops it.
 */
export function startEmailWorker(): () => Promise<void> {
  const env = serverEnv();
  const connection = createRedisConnection(env.redisUrl, "worker");
  const worker = createEmailWorker({
    connection,
    prefix: env.queuePrefix,
    sender: createSmtpSender({
      smtpUrl: process.env.SMTP_URL ?? "smtp://localhost:1025",
      from: "Country Topics tests <no-reply@localhost>",
    }),
  });
  return async () => {
    await worker.close();
    await connection.quit();
  };
}

export function testEmail(name: string): string {
  return `${name}-${process.env.TEST_RUN_ID}@example.test`;
}

/** A browser-like cookie jar: keeps the latest value of each cookie. */
export class CookieJar {
  private readonly cookies = new Map<string, string>();

  store(response: Response): void {
    for (const header of response.headers.getSetCookie()) {
      const [pair = ""] = header.split(";");
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      const expired = /max-age=0/i.test(header) || value === "";
      if (expired) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  header(): string {
    return [...this.cookies]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}

/** Calls a Better Auth endpoint the way the browser would, from the site's origin. */
export async function authRequest(
  path: string,
  {
    method = "POST",
    body,
    jar,
  }: { method?: "GET" | "POST"; body?: unknown; jar?: CookieJar } = {},
): Promise<Response> {
  const headers = new Headers({ origin: SITE_URL });
  if (body !== undefined) headers.set("content-type", "application/json");
  if (jar) headers.set("cookie", jar.header());
  const url = path.startsWith("http") ? path : `${SITE_URL}/api/auth${path}`;
  const response = await getAuth().handler(
    new Request(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    }),
  );
  jar?.store(response);
  return response;
}

const mailpitSearch = z.object({
  messages: z.array(
    z.object({
      ID: z.string(),
      To: z.array(z.object({ Address: z.string() })),
    }),
  ),
});
const mailpitMessage = z.object({ Text: z.string() });

async function searchMailpit(to: string) {
  const query = encodeURIComponent(`to:"${to}"`);
  const response = await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`);
  // Mailpit matches part of an address (x-member@ for member@), so keep only
  // messages to exactly this one.
  return mailpitSearch
    .parse(await response.json())
    .messages.filter((message) =>
      message.To.some((recipient) => recipient.Address === to),
    );
}

/**
 * Waits until `to` has more than `alreadyReceived` emails in Mailpit and returns
 * the newest one's text body.
 */
export async function waitForEmail(
  to: string,
  alreadyReceived = 0,
): Promise<string> {
  const deadline = Date.now() + MAIL_WAIT_MS;
  while (Date.now() < deadline) {
    const messages = await searchMailpit(to);
    const [newest] = messages;
    if (newest && messages.length > alreadyReceived) {
      const response = await fetch(
        `${MAILPIT_URL}/api/v1/message/${newest.ID}`,
      );
      return mailpitMessage.parse(await response.json()).Text;
    }
    await new Promise((resolve) => setTimeout(resolve, MAIL_POLL_MS));
  }
  throw new Error(`No email to ${to} arrived within ${MAIL_WAIT_MS} ms`);
}

export async function emailCount(to: string): Promise<number> {
  return (await searchMailpit(to)).length;
}

export function linkFrom(emailText: string): string {
  const match = /https?:\/\/\S+\/api\/auth\/magic-link\/verify\S+/.exec(
    emailText,
  );
  if (!match) throw new Error("The email has no sign-in link");
  return match[0];
}

/** Where a redirect response points, as an absolute URL. */
export function redirectTarget(response: Response): string {
  return new URL(response.headers.get("location") ?? "", SITE_URL).toString();
}

export async function requestSignInLink(email: string): Promise<Response> {
  return authRequest("/sign-in/magic-link", {
    body: { email, callbackURL: "/account", errorCallbackURL: "/sign-in" },
  });
}

/** Signs in through the emailed link and returns the browser's cookies. */
export async function signInWithEmailLink(email: string): Promise<CookieJar> {
  const alreadyReceived = await emailCount(email);
  const requested = await requestSignInLink(email);
  if (!requested.ok)
    throw new Error(`Sign-in link request failed: ${requested.status}`);
  const jar = new CookieJar();
  const opened = await authRequest(
    linkFrom(await waitForEmail(email, alreadyReceived)),
    {
      method: "GET",
      jar,
    },
  );
  if (
    opened.status !== 302 ||
    redirectTarget(opened) !== `${SITE_URL}/account`
  ) {
    throw new Error(
      `Sign-in link did not sign in: ${opened.status} ${opened.headers.get("location")}`,
    );
  }
  return jar;
}

export function currentCode(secret: string): Promise<string> {
  return createOTP(secret, { digits: 6, period: 30 }).totp();
}

/** Sets up an authenticator for the signed-in user and returns its secret. */
export async function enableAuthenticator(jar: CookieJar): Promise<string> {
  const enabled = await authRequest("/two-factor/enable", {
    body: { method: "totp" },
    jar,
  });
  const { totpURI } = z
    .object({ totpURI: z.string() })
    .parse(await enabled.json());
  const encoded = new URL(totpURI).searchParams.get("secret");
  if (!encoded) throw new Error("No secret in the TOTP URI");
  // The URI carries the secret base32-encoded, as authenticator apps expect.
  const secret = new TextDecoder().decode(base32.decode(encoded));
  const confirmed = await authRequest("/two-factor/verify-totp", {
    body: { code: await currentCode(secret) },
    jar,
  });
  if (!confirmed.ok)
    throw new Error(`Authenticator setup failed: ${confirmed.status}`);
  return secret;
}

/**
 * Signs in an existing staff profile and confirms an authenticator code, as a
 * staff member does before using the admin panel.
 */
export async function signInAsVerifiedStaff(email: string): Promise<CookieJar> {
  const jar = await signInWithEmailLink(email);
  const secret = await enableAuthenticator(jar);
  const verified = await authRequest("/admin-verification/verify", {
    body: { code: await currentCode(secret) },
    jar,
  });
  if (!verified.ok)
    throw new Error(`Staff verification failed: ${verified.status}`);
  return jar;
}

const payloadGet = REST_GET(config);
const payloadPatch = REST_PATCH(config);
const payloadPost = REST_POST(config);
const restHandlers = {
  GET: payloadGet,
  PATCH: payloadPatch,
  POST: payloadPost,
};

/** Calls Payload's REST API (`/api/<slug...>`) with the browser's cookies. */
export async function payloadRest(
  method: "GET" | "PATCH" | "POST",
  slug: string[],
  jar: CookieJar,
  body?: unknown,
  origin: string = SITE_URL,
  search = "",
): Promise<Response> {
  const request = new Request(`${SITE_URL}/api/${slug.join("/")}${search}`, {
    method,
    headers: {
      cookie: jar.header(),
      origin,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const handler = restHandlers[method];
  return handler(request, { params: Promise.resolve({ slug }) });
}

export async function canAccessAdmin(jar: CookieJar): Promise<boolean> {
  const response = await payloadRest("GET", ["access"], jar);
  const body = z
    .object({ canAccessAdmin: z.boolean().optional() })
    .parse(await response.json());
  return body.canAccessAdmin === true;
}

/**
 * A staff or member profile as the sign-in strategy hands it to Payload, for
 * local API calls with `overrideAccess: false`. `verified` means an
 * authenticator code was confirmed for this session.
 */
export async function staffProfile(
  payload: Payload,
  name: string,
  role: User["role"],
  verified = true,
): Promise<User> {
  const created = await payload.create({
    collection: "users",
    data: { email: testEmail(name), role },
    overrideAccess: true,
  });
  return {
    ...created,
    collection: "users",
    twoFactorEnabled: verified,
    twoFactorVerifiedAt: verified ? new Date().toISOString() : null,
  };
}

/** The id of a seeded country, by its ISO 3166-1 alpha-2 code. */
export async function countryId(
  payload: Payload,
  code: string,
): Promise<string> {
  const { docs } = await payload.find({
    collection: "countries",
    where: { code: { equals: code } },
    overrideAccess: true,
  });
  if (!docs[0]) throw new Error(`Country ${code} is not seeded`);
  return docs[0].id;
}

/**
 * Forgets every member's rate-limit counters on the tests' queue prefix,
 * so tests that post a lot do not run into each other's limits.
 */
export async function clearRateLimits(): Promise<void> {
  const env = serverEnv();
  const connection = createRedisConnection(env.redisUrl, "worker");
  try {
    let cursor = "0";
    do {
      const [next, keys] = await connection.scan(
        cursor,
        "MATCH",
        `${env.queuePrefix}:rate:*`,
        "COUNT",
        500,
      );
      cursor = next;
      if (keys.length > 0) await connection.del(...keys);
    } while (cursor !== "0");
  } finally {
    await connection.quit();
  }
}
