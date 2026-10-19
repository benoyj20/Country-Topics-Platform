// Requests that reach the database every time (ADR 0013): search and
// filtered browsing through /api/v1/topics, and topic discussions through
// /api/v1/topics/[slug]/comments. Without a CDN in front, nothing caches
// them, so they show what the queries cost.
//   make load-test TEST=uncached
import { check, sleep } from "k6";
import http from "k6/http";

import { BASE, PAUSE_S, pick, stages, topicSlugs } from "./common.js";

const WORDS = ["water", "transport", "schools", "budget", "energy", "housing"];
const COUNTRIES = ["kenya", "ghana", "portugal", "tanzania", "malta"];
const SORTS = ["", "&sort=updated", "&sort=referenced", "&sort=discussed"];

export const options = {
  stages: stages(50),
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<800"],
    // Listed so the summary shows each request's times.
    "http_req_duration{request:search}": ["p(95)<800"],
    "http_req_duration{request:browse}": ["p(95)<800"],
    "http_req_duration{request:comments}": ["p(95)<800"],
  },
};

export function setup() {
  return { slugs: topicSlugs() };
}

export default function ({ slugs }) {
  const search = http.get(`${BASE}/api/v1/topics?q=${pick(WORDS)}`, {
    tags: { request: "search" },
  });
  const browse = http.get(
    `${BASE}/api/v1/topics?country=${pick(COUNTRIES)}${pick(SORTS)}`,
    { tags: { request: "browse" } },
  );
  const comments = http.get(`${BASE}/api/v1/topics/${pick(slugs)}/comments`, {
    tags: { request: "comments" },
  });
  for (const response of [search, browse, comments]) {
    check(response, { "answered 200": (r) => r.status === 200 });
  }
  sleep(PAUSE_S);
}
