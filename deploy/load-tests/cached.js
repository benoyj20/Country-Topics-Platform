// The site's page data, which the shared cache serves (ADR 0013, ADR
// 0014): the home page's, topic pages', and country pages', as the
// frontend reads it on a miss of its own cache. Every API container
// answers from Valkey after the first load.
//   make load-test TEST=cached
import { check, sleep } from "k6";

import { BASE, get, PAUSE_S, pick, stages, topicSlugs } from "./common.js";

const COUNTRIES = ["kenya", "ghana", "portugal", "tanzania", "malta"];

export const options = {
  stages: stages(100),
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<300"],
    // Listed so the summary shows each page's times.
    "http_req_duration{page:home}": ["p(95)<300"],
    "http_req_duration{page:topic}": ["p(95)<300"],
    "http_req_duration{page:countries}": ["p(95)<300"],
  },
};

export function setup() {
  return { slugs: topicSlugs() };
}

export default function ({ slugs }) {
  const pages = [
    ["home", "/api/v1/pages/home"],
    ["topic", `/api/v1/pages/topics/${pick(slugs)}`],
    ["countries", `/api/v1/pages/countries/${pick(COUNTRIES)}`],
  ];
  for (const [page, path] of pages) {
    const response = get(`${BASE}${path}`, { tags: { page } });
    check(response, { "answered 200": (r) => r.status === 200 });
  }
  sleep(PAUSE_S);
}
