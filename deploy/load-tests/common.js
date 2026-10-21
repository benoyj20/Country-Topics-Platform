// Shared by the k6 load tests (ADR 0013; make load-test). They run in the
// rehearsal's Compose network against its load balancer, as visitors.
import crypto from "k6/crypto";
import http from "k6/http";

export const BASE = __ENV.BASE_URL || "http://lb:8080";

/**
 * The headers that sign a request as the frontend does (ADR 0014;
 * packages/forwarding, which k6 cannot load): an HMAC over the method, the
 * path with its query, the visitor's address, and the time. Each visitor
 * gets an address of its own from the benchmarking range, so per-address
 * limits count them apart, as they would real visitors. The tests' queries
 * hold only letters, digits, "-", "_", "=", and "&" (cursors are base64url),
 * which Next.js's re-encoding of every query leaves as they are, so each
 * URL is signed as written.
 */
function signature(method, url) {
  const pathAndQuery = url.slice(BASE.length);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const address = `198.18.${Math.floor(__VU / 256) % 256}.${__VU % 256}`;
  const message = ["v1", method, pathAndQuery, address, timestamp].join("\n");
  return {
    "x-countrytopics-timestamp": timestamp,
    "x-countrytopics-client-address": address,
    "x-countrytopics-signature": crypto.hmac(
      "sha256",
      __ENV.FORWARDING_KEY,
      message,
      "base64rawurl",
    ),
  };
}

/**
 * A signed GET of `url`, which must start with BASE. Redirects are not
 * followed: each request needs its own signature, and the tests use
 * canonical addresses.
 */
export function get(url, params = {}) {
  return http.get(url, {
    ...params,
    redirects: 0,
    headers: { ...params.headers, ...signature("GET", url) },
  });
}

/**
 * Ramp up to `vus` visitors (or VUS from the environment), hold, and ramp
 * down.
 */
export function stages(vus) {
  const target = Number(__ENV.VUS || vus);
  return [
    { duration: "30s", target },
    { duration: "1m", target },
    { duration: "15s", target: 0 },
  ];
}

/**
 * Seconds each visitor waits between rounds: 1 by default, like a person
 * reading; PAUSE_S=0 sends requests back to back to find the ceiling.
 */
export const PAUSE_S = Number(__ENV.PAUSE_S ?? 1);

/** Topic slugs to visit, from the newest listed topics. */
export function topicSlugs() {
  const slugs = [];
  let url = `${BASE}/api/v1/topics`;
  for (let page = 0; page < 4 && url; page += 1) {
    const response = get(url);
    if (response.status !== 200) {
      throw new Error(`Listing topics failed: ${response.status}`);
    }
    const body = response.json();
    for (const topic of body.topics) slugs.push(topic.slug);
    url = body.nextCursor
      ? `${BASE}/api/v1/topics?cursor=${encodeURIComponent(body.nextCursor)}`
      : null;
  }
  if (slugs.length === 0)
    throw new Error("No topics listed; seed the rehearsal first");
  return slugs;
}

export const pick = (list) => list[Math.floor(Math.random() * list.length)];
