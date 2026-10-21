// Shows that the site keeps no state in its containers (ADR 0013), through
// the scale rehearsal's load balancer. Run by `make scale-check`, which
// invites the two addresses below on the rehearsal database first.
//
// It checks, alternating between web containers:
//   - a session made on one container works on every other;
//   - publishing a change on one purges the page on all;
//   - the page is then rendered once and the other containers serve that
//     copy from the shared cache;
//   - a member's comment limit counts across containers (Valkey).
//
// Only a topic whose title starts with "TEST" is changed. Node 22+ and the
// repository's signing package only. Usage: node check-stateless.mjs [topic slug]

import { createHmac } from "node:crypto";

import {
  signedPathAndQuery,
  signForwardedRequest,
} from "../../packages/forwarding/src/index.ts";

const SITE = process.env.SCALE_SITE ?? "http://localhost:8080";
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const ADMIN = "rehearsal-admin@example.test";
const MEMBER = "rehearsal-member@example.test";
const slug = process.argv[2] ?? "test-browse-check-topic";
// The rehearsal's own key, as compose.yaml gives its web containers.
const FORWARDING_KEY = "rehearsal-only-forwarding-key-not-a-secret";
// One visitor address for the whole check: its limits count per member.
const CLIENT_ADDRESS = "198.18.0.1";
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const failures = [];

function check(ok, message) {
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`);
  if (!ok) failures.push(message);
}

/**
 * A cookie jar per person, as a browser keeps one. Every request is signed
 * as the frontend signs it (ADR 0014), since the rehearsal has none, and
 * redirects are followed here so that each hop is signed too.
 */
class Browser {
  cookies = new Map();
  async fetch(path, { method = "GET", body, redirect = "follow" } = {}) {
    let url = new URL(path, SITE);
    for (let hop = 0; ; hop += 1) {
      const response = await this.send(url, method, body);
      const location = response.headers.get("location");
      if (
        redirect !== "follow" ||
        !REDIRECTS.has(response.status) ||
        !location ||
        hop === 5
      ) {
        return response;
      }
      url = new URL(location, url);
      // As fetch follows: 307 and 308 repeat the request; the others GET.
      if (response.status !== 307 && response.status !== 308) {
        method = "GET";
        body = undefined;
      }
    }
  }

  async send(url, method, body) {
    const headers = {
      origin: SITE,
      ...(await signForwardedRequest(
        FORWARDING_KEY,
        { method, pathAndQuery: signedPathAndQuery(url) },
        CLIENT_ADDRESS,
      )),
    };
    if (this.cookies.size > 0) {
      headers.cookie = [...this.cookies]
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
    }
    if (body !== undefined) headers["content-type"] = "application/json";
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const at = pair.indexOf("=");
      const name = pair.slice(0, at).trim();
      const value = pair.slice(at + 1).trim();
      if (!value || /max-age=0/i.test(line)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return response;
  }
}

const servedBy = (response) => response.headers.get("x-served-by") ?? "?";

async function mailsTo(address) {
  const query = encodeURIComponent(`to:"${address}"`);
  const found = await (
    await fetch(`${MAILPIT}/api/v1/search?query=${query}`)
  ).json();
  return found.messages.filter((m) => m.To.some((t) => t.Address === address));
}

async function signIn(address) {
  const browser = new Browser();
  const before = (await mailsTo(address)).length;
  const asked = await browser.fetch("/api/auth/sign-in/magic-link", {
    method: "POST",
    body: { email: address, callbackURL: "/account" },
  });
  if (!asked.ok) throw new Error(`Sign-in link refused: ${asked.status}`);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const mails = await mailsTo(address);
    if (mails.length > before) {
      const text = (
        await (await fetch(`${MAILPIT}/api/v1/message/${mails[0].ID}`)).json()
      ).Text;
      const link = /https?:\/\/\S+\/api\/auth\/magic-link\/verify\S+/.exec(
        text,
      );
      if (!link) throw new Error("The email has no sign-in link");
      const opened = await browser.fetch(
        new URL(link[0]).pathname + new URL(link[0]).search,
        {
          redirect: "manual",
        },
      );
      if (opened.status !== 302)
        throw new Error(`Link did not sign in: ${opened.status}`);
      return browser;
    }
    await sleep(500);
  }
  throw new Error(`No sign-in email reached ${address}`);
}

function base32(input) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of input.replace(/=+$/, "").toUpperCase()) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(key) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const hash = createHmac("sha1", key).update(counter).digest();
  const offset = hash[hash.length - 1] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1e6).padStart(
    6,
    "0",
  );
}

async function verifyStaff(browser) {
  const enabled = await (
    await browser.fetch("/api/auth/two-factor/enable", {
      method: "POST",
      body: { method: "totp" },
    })
  ).json();
  const key = base32(new URL(enabled.totpURI).searchParams.get("secret"));
  const confirmed = await browser.fetch("/api/auth/two-factor/verify-totp", {
    method: "POST",
    body: { code: totp(key) },
  });
  if (!confirmed.ok)
    throw new Error(`Authenticator setup failed: ${confirmed.status}`);
  const verified = await browser.fetch("/api/auth/admin-verification/verify", {
    method: "POST",
    body: { code: totp(key) },
  });
  if (!verified.ok)
    throw new Error(`Staff verification failed: ${verified.status}`);
}

// 1. A session made through one container works on every one.
const member = await signIn(MEMBER);
const sessionSeen = new Map();
for (let i = 0; i < 6; i += 1) {
  const response = await member.fetch("/api/v1/account/comments");
  const viewer = response.ok ? await response.json() : null;
  // Signed in only if the container answered and knew the account.
  sessionSeen.set(servedBy(response), Boolean(viewer?.account));
}
check(
  sessionSeen.size >= 2 && [...sessionSeen.values()].every(Boolean),
  `the member's session works on ${sessionSeen.size} containers (${[...sessionSeen.keys()].join(", ")})`,
);

// 2. A purge reaches every container, and the page is then rendered once
// and served by the others from the shared cache.
const page = `/topics/${slug}`;
const admin = await signIn(ADMIN);
await verifyStaff(admin);
const found = await (
  await admin.fetch(
    `/api/topics?where[slug][equals]=${encodeURIComponent(slug)}&depth=0`,
  )
).json();
const topic = found.docs?.[0];
if (!topic || !String(topic.title).startsWith("TEST")) {
  throw new Error(
    `Topic ${slug} is missing or not a TEST topic; nothing was changed`,
  );
}
const summary = `TEST summary changed by the scale rehearsal at ${new Date().toISOString()}.`;
const saved = await admin.fetch(`/api/topics/${topic.id}`, {
  method: "PATCH",
  body: {
    summary,
    changeNote: "TEST scale rehearsal check.",
    _status: "published",
  },
});
check(
  saved.ok,
  `the admin published a change through ${servedBy(saved)} (${saved.status})`,
);
const shows = new Map();
/** Each container's first answer after the purge. */
const firstAnswer = new Map();
for (let i = 0; i < 6; i += 1) {
  const response = await member.fetch(page);
  const container = servedBy(response);
  if (!firstAnswer.has(container)) {
    firstAnswer.set(container, response.headers.get("x-nextjs-cache"));
  }
  const changed = (await response.text()).includes(summary);
  shows.set(container, (shows.get(container) ?? true) && changed);
}
check(
  shows.size >= 2 && [...shows.values()].every(Boolean),
  `every container shows the change at once (${[...shows.keys()].join(", ")})`,
);
// Per-container caches would make each render its own copy (a MISS each);
// a shared cache renders once and the others' first answer is a HIT.
const firsts = [...firstAnswer.values()];
check(
  firsts.filter((answer) => answer !== "HIT").length <= 1 &&
    firsts.includes("HIT"),
  `the page was rendered once and served from the shared cache by the other containers (first answers: ${[...firstAnswer].map(([k, v]) => `${k} ${v}`).join(", ")})`,
);

// 3. A member's comment limit counts across containers.
await member.fetch("/api/v1/account/display-name", {
  method: "PUT",
  body: { displayName: "TEST Rehearsal" },
});
const statuses = [];
const instances = new Set();
for (let i = 0; i < 6; i += 1) {
  const response = await member.fetch(`/api/v1/topics/${slug}/comments`, {
    method: "POST",
    body: { body: `TEST rehearsal comment ${i + 1}.` },
  });
  statuses.push(response.status);
  instances.add(servedBy(response));
}
check(
  statuses.slice(0, 5).every((status) => status === 201) && statuses[5] === 429,
  `five comments were taken and the sixth refused (${statuses.join(", ")}) across ${instances.size} containers`,
);

console.log(
  failures.length === 0
    ? "\nAll checks passed."
    : `\n${failures.length} check(s) failed.`,
);
process.exitCode = failures.length === 0 ? 0 : 1;
