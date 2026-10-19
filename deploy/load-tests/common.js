// Shared by the k6 load tests (ADR 0013; make load-test). They run in the
// rehearsal's Compose network against its load balancer, as visitors.
import http from "k6/http";

export const BASE = __ENV.BASE_URL || "http://lb:8080";

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
    const response = http.get(url);
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
