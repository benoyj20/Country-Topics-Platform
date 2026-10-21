import config from "@payload-config";
import { getMigrations } from "better-auth/db/migration";
import { getPayload, type Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as z from "zod";

import { MAX_VERIFICATION_FAILURES } from "@/auth/admin-verification";
import { ensureUserProfile, maySignIn } from "@/auth/accounts";
import { EMAIL_NOT_VERIFIED_ERROR, getAuth } from "@/auth/auth";
import { serverEnv } from "@/env";
import { RATE_LIMITS } from "@/rate-limit";

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
  startEmailWorker,
  testEmail,
  UUID_V7_PATTERN,
  waitForEmail,
} from "./helpers";

let payload: Payload;
let stopEmailWorker: (() => Promise<void>) | undefined;

beforeAll(async () => {
  payload = await getPayload({ config });
  stopEmailWorker = startEmailWorker();
});

afterAll(async () => {
  await stopEmailWorker?.();
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
    // Every cookie is __Host- (ADR 0014): Secure, for the whole site, and
    // naming no Domain, so no other host can set or read it.
    const cookies = opened.headers.getSetCookie();
    expect(cookies.length).toBeGreaterThan(0);
    for (const cookie of cookies) {
      expect(cookie).toMatch(/^__Host-countrytopics\./);
      expect(cookie).toMatch(/;\s*Secure/i);
      expect(cookie).toMatch(/;\s*Path=\/(;|$)/i);
      expect(cookie).not.toMatch(/;\s*Domain=/i);
    }

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

  it(`locks verification on the ${MAX_VERIFICATION_FAILURES}th wrong code, even for parallel guesses`, async () => {
    const moderator = testEmail("moderator");
    await invite(moderator, "moderator");
    const jar = await signInWithEmailLink(moderator);
    const secret = await enableAuthenticator(jar);

    const valid = await currentCode(secret);
    const wrong = valid === "000000" ? "111111" : "000000";
    const guesses = await Promise.all(
      Array.from({ length: MAX_VERIFICATION_FAILURES * 2 }, () =>
        authRequest("/admin-verification/verify", {
          body: { code: wrong },
          jar,
        }),
      ),
    );
    expect(guesses.map((response) => response.status)).toContain(429);

    const locked = await authRequest("/admin-verification/verify", {
      body: { code: valid },
      jar,
    });
    expect(locked.status).toBe(429);
    expect(await canAccessAdmin(jar)).toBe(false);
  });

  it("closes the authenticator endpoints once it is set up", async () => {
    const moderator = testEmail("closed-2fa");
    await invite(moderator, "moderator");
    const jar = await signInWithEmailLink(moderator);
    const secret = await enableAuthenticator(jar);

    // Nobody holding only the session may read the secret, switch it off,
    // replace it, or use the plugin's unlocked code check.
    for (const [path, body] of [
      ["/two-factor/get-totp-uri", {}],
      ["/two-factor/disable", {}],
      ["/two-factor/enable", { method: "totp" }],
      ["/two-factor/verify-totp", { code: await currentCode(secret) }],
      ["/two-factor/generate-backup-codes", {}],
    ] as const) {
      const response = await authRequest(path, { body, jar });
      expect(response.status, path).toBe(403);
    }
  });

  it("refuses staff writes that come from another site", async () => {
    // A fully verified admin, so only the request's origin differs below.
    const admin = testEmail("csrf-admin");
    await payload.create({
      collection: "users",
      data: { email: admin, role: "admin" },
      overrideAccess: true,
    });
    const jar = await signInWithEmailLink(admin);
    const secret = await enableAuthenticator(jar);
    await authRequest("/admin-verification/verify", {
      body: { code: await currentCode(secret) },
      jar,
    });
    const [profile] = await profileFor(admin);
    const path = ["users", String(profile?.id)];

    const forged = await payloadRest(
      "PATCH",
      path,
      jar,
      { name: "Forged" },
      "https://evil.example",
    );
    expect(forged.status).toBe(403);
    expect((await profileFor(admin))[0]?.name).not.toBe("Forged");

    const genuine = await payloadRest("PATCH", path, jar, { name: "Genuine" });
    expect(genuine.status).toBe(200);
    expect((await profileFor(admin))[0]?.name).toBe("Genuine");

    const audit = await payload.find({
      collection: "audit-log",
      where: {
        action: { equals: "user.updated" },
        targetId: { equals: String(profile?.id) },
      },
      overrideAccess: true,
    });
    expect(audit.docs[0]?.details).toMatchObject({
      changes: { name: { to: "Genuine" } },
    });
  });
});

describe("staff writes through the REST API", () => {
  it("are held to a person's pace", async () => {
    const admin = testEmail("write-limit-admin");
    await payload.create({
      collection: "users",
      data: { email: admin, role: "admin" },
      overrideAccess: true,
    });
    const jar = await signInWithEmailLink(admin);
    const secret = await enableAuthenticator(jar);
    await authRequest("/admin-verification/verify", {
      body: { code: await currentCode(secret) },
      jar,
    });
    const [profile] = await profileFor(admin);
    const path = ["users", String(profile?.id)];
    const [{ max }] = RATE_LIMITS["staff-write"];

    for (let save = 1; save <= max; save += 1) {
      const saved = await payloadRest("PATCH", path, jar, {
        name: `TEST save ${save}`,
      });
      expect(saved.status).toBe(200);
    }
    const refused = await payloadRest("PATCH", path, jar, {
      name: "TEST one save too many",
    });
    expect(refused.status).toBe(429);
    expect(JSON.stringify(await refused.json())).toMatch(
      /Too many saves in a short time/,
    );
    expect((await profileFor(admin))[0]?.name).toBe(`TEST save ${max}`);

    // A write by filter may change many records, so it has its own,
    // smaller allowance.
    const [{ max: bulkMax }] = RATE_LIMITS["staff-bulk-write"];
    const filter = `?where[id][equals]=${profile?.id}`;
    for (let save = 1; save <= bulkMax; save += 1) {
      const saved = await payloadRest(
        "PATCH",
        ["users"],
        jar,
        { name: `TEST bulk save ${save}` },
        SITE_URL,
        filter,
      );
      expect(saved.status).toBe(200);
    }
    const bulkRefused = await payloadRest(
      "PATCH",
      ["users"],
      jar,
      { name: "TEST one bulk save too many" },
      SITE_URL,
      filter,
    );
    expect(bulkRefused.status).toBe(429);
  });
});

describe("account removal and address checks", () => {
  it("ends a deleted person's sessions and does not let their old invitation back in", async () => {
    const member = testEmail("removed");
    await invite(member, "member");
    const jar = await signInWithEmailLink(member);
    const [profile] = await profileFor(member);

    await payload.delete({
      collection: "users",
      id: String(profile?.id),
      overrideAccess: true,
    });

    expect(
      await getAuth().api.getSession({
        headers: new Headers({ cookie: jar.header() }),
      }),
    ).toBeNull();
    expect(await maySignIn(payload, member)).toBe(false);
    const audit = await payload.find({
      collection: "audit-log",
      where: {
        action: { equals: "user.deleted" },
        targetId: { equals: String(profile?.id) },
      },
      overrideAccess: true,
    });
    expect(audit.totalDocs).toBe(1);
  });

  it("refuses accounts whose email address is not verified", async () => {
    const invited = testEmail("unverified");
    await invite(invited, "member");
    const context = await getAuth().$context;

    await expect(
      // What a Google sign-in does when Google has not verified the address.
      context.internalAdapter.createUser(
        { email: invited, name: "Unverified", emailVerified: false },
        { method: "oauth", oauth: { providerId: "google", profile: {} } },
      ),
    ).rejects.toMatchObject({ body: { code: EMAIL_NOT_VERIFIED_ERROR } });
    expect(
      await ensureUserProfile(payload, {
        id: "unverified-id",
        email: invited,
        emailVerified: false,
      }),
    ).toBeNull();
  });
});
