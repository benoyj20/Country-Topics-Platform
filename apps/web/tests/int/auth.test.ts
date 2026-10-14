import { createSmtpSender } from "@countrytopics/email";
import { createEmailWorker, createRedisConnection } from "@countrytopics/jobs";
import config from "@payload-config";
import { getMigrations } from "better-auth/db/migration";
import { getPayload, type Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as z from "zod";

import { MAX_VERIFICATION_FAILURES } from "@/auth/admin-verification";
import { getAuth } from "@/auth/auth";
import { serverEnv } from "@/env";

import {
  authRequest,
  canAccessAdmin,
  CookieJar,
  currentCode,
  emailCount,
  enableAuthenticator,
  linkFrom,
  payloadRest,
  redirectTarget,
  requestSignInLink,
  SITE_URL,
  signInWithEmailLink,
  testEmail,
  waitForEmail,
} from "./helpers";

const UUID_V7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let payload: Payload;
let workerConnection: ReturnType<typeof createRedisConnection>;
let emailWorker: ReturnType<typeof createEmailWorker>;

beforeAll(async () => {
  payload = await getPayload({ config });
  // The real worker code, sending through Mailpit, on the tests' own queue.
  const env = serverEnv();
  workerConnection = createRedisConnection(env.redisUrl, "worker");
  emailWorker = createEmailWorker({
    connection: workerConnection,
    prefix: env.queuePrefix,
    sender: createSmtpSender({
      smtpUrl: process.env.SMTP_URL ?? "smtp://localhost:1025",
      from: "Country Topics tests <no-reply@localhost>",
    }),
  });
});

afterAll(async () => {
  await emailWorker?.close();
  await workerConnection?.quit();
  await payload?.destroy();
});

async function invite(email: string, role: "member" | "moderator" | "admin") {
  return payload.create({
    collection: "invitations",
    data: { email, role },
    overrideAccess: true,
  });
}

async function profileFor(email: string) {
  const result = await payload.find({
    collection: "users",
    where: { email: { equals: email } },
    overrideAccess: true,
  });
  return result.docs;
}

describe("Better Auth schema", () => {
  it("matches the committed migrations", async () => {
    const { toBeCreated, toBeAdded } = await getMigrations(getAuth().options);

    expect(toBeCreated.map((table) => table.table)).toEqual([]);
    expect(toBeAdded.map((table) => table.table)).toEqual([]);
  });
});

describe("email-link sign-in", () => {
  it("signs in an invited member through the queue and worker, and creates their profile", async () => {
    const stranger = testEmail("stranger");
    const member = testEmail("member");
    await invite(member, "member");

    // Same response for both, so the form does not reveal who is invited.
    expect((await requestSignInLink(stranger)).status).toBe(200);
    expect((await requestSignInLink(member)).status).toBe(200);

    const jar = new CookieJar();
    const link = linkFrom(await waitForEmail(member));
    const opened = await authRequest(link, { method: "GET", jar });
    expect(opened.status).toBe(302);
    expect(redirectTarget(opened)).toBe(`${SITE_URL}/account`);

    // The stranger's request was handled first; no email was queued for it.
    expect(await emailCount(stranger)).toBe(0);

    const session = await getAuth().api.getSession({
      headers: new Headers({ cookie: jar.header() }),
    });
    expect(session?.user.email).toBe(member);

    const [profile] = await profileFor(member);
    expect(profile).toMatchObject({
      role: "member",
      authUserId: session?.user.id,
    });
    expect(profile?.id).toMatch(UUID_V7_PATTERN);

    const invitation = await payload.find({
      collection: "invitations",
      where: { email: { equals: member } },
      overrideAccess: true,
    });
    expect(invitation.docs[0]?.acceptedAt).toBeTruthy();

    const audit = await payload.find({
      collection: "audit-log",
      where: {
        action: { equals: "user.created" },
        targetId: { equals: profile?.id },
      },
      overrideAccess: true,
    });
    expect(audit.totalDocs).toBe(1);

    // A link works once.
    const reused = await authRequest(link, { method: "GET" });
    expect(
      redirectTarget(reused).startsWith(`${SITE_URL}/sign-in?error=`),
    ).toBe(true);
  });

  it("links a profile made before Better Auth by its email, without an invitation", async () => {
    const legacy = testEmail("legacy");
    await payload.create({
      collection: "users",
      data: { email: legacy, role: "admin" },
      overrideAccess: true,
    });

    const jar = await signInWithEmailLink(legacy);
    const session = await getAuth().api.getSession({
      headers: new Headers({ cookie: jar.header() }),
    });

    const profiles = await profileFor(legacy);
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({
      role: "admin",
      authUserId: session?.user.id,
    });
  });
});

describe("Google sign-in", () => {
  it("sends people to Google with the registered redirect URL", async () => {
    const response = await authRequest("/sign-in/social", {
      body: { provider: "google", callbackURL: "/account" },
    });
    const { url } = z.object({ url: z.string() }).parse(await response.json());
    const google = new URL(url);

    expect(google.hostname).toBe("accounts.google.com");
    expect(google.searchParams.get("redirect_uri")).toBe(
      `${SITE_URL}/api/auth/callback/google`,
    );
    expect(google.searchParams.get("client_id")).toBe(
      "test-client.apps.googleusercontent.com",
    );
  });
});

describe("admin panel access", () => {
  it("requires an authenticator code from staff, on the API as well as the panel", async () => {
    const owner = serverEnv().adminEmails[0] ?? "";
    const jar = await signInWithEmailLink(owner);
    const [profile] = await profileFor(owner);
    expect(profile?.role).toBe("admin");

    // Signed in as an admin, but no authenticator yet: no panel and no admin API.
    expect(await canAccessAdmin(jar)).toBe(false);
    expect((await payloadRest("GET", ["invitations"], jar)).status).toBe(403);

    const secret = await enableAuthenticator(jar);
    // Setting up the app is not the same as confirming a code for this session.
    expect(await canAccessAdmin(jar)).toBe(false);

    const verified = await authRequest("/admin-verification/verify", {
      body: { code: await currentCode(secret) },
      jar,
    });
    expect(verified.status).toBe(200);
    expect(await canAccessAdmin(jar)).toBe(true);
    expect((await payloadRest("GET", ["invitations"], jar)).status).toBe(200);
  });

  it("keeps members out of the panel and away from other profiles", async () => {
    const member = testEmail("plain-member");
    await invite(member, "member");
    const jar = await signInWithEmailLink(member);

    expect(await canAccessAdmin(jar)).toBe(false);
    const users = z
      .object({ docs: z.array(z.object({ email: z.string() })) })
      .parse(await (await payloadRest("GET", ["users"], jar)).json());
    expect(users.docs.map((user) => user.email)).toEqual([member]);

    const [own] = await profileFor(member);
    const promoted = await payloadRest(
      "PATCH",
      ["users", String(own?.id)],
      jar,
      { role: "admin" },
    );
    expect(promoted.status).toBe(403);
    expect((await profileFor(member))[0]?.role).toBe("member");
  });

  it(`locks verification after ${MAX_VERIFICATION_FAILURES} wrong codes`, async () => {
    const moderator = testEmail("moderator");
    await invite(moderator, "moderator");
    const jar = await signInWithEmailLink(moderator);
    const secret = await enableAuthenticator(jar);

    const valid = await currentCode(secret);
    const wrong = valid === "000000" ? "111111" : "000000";
    for (let attempt = 0; attempt < MAX_VERIFICATION_FAILURES; attempt++) {
      const response = await authRequest("/admin-verification/verify", {
        body: { code: wrong },
        jar,
      });
      expect(response.status).toBe(401);
    }

    const locked = await authRequest("/admin-verification/verify", {
      body: { code: valid },
      jar,
    });
    expect(locked.status).toBe(429);
    expect(await canAccessAdmin(jar)).toBe(false);
  });
});
