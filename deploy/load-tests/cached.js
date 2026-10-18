// Visitors reading pages the shared cache serves (ADR 0013): the home page,
// the topics page, topic pages, and country pages. Every web container
// answers from Valkey after the first render.
//   make load-test TEST=cached
import { check, sleep } from "k6";
import http from "k6/http";

import { BASE, PAUSE_S, pick, stages, topicSlugs } from "./common.js";

const COUNTRIES = ["kenya", "ghana", "portugal", "tanzania", "malta"];

export const options = {
  stages: stages(100),
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<300"],
    // Listed so the summary shows each page's times.
    "http_req_duration{page:home}": ["p(95)<300"],
    "http_req_duration{page:topics}": ["p(95)<300"],
    "http_req_duration{page:countries}": ["p(95)<300"],
  },
};

export function setup() {
  return { slugs: topicSlugs() };
}

export default function ({ slugs }) {
  const pages = [
    "/",
    "/topics",
    `/topics/${pick(slugs)}`,
    `/countries/${pick(COUNTRIES)}`,
  ];
  for (const path of pages) {
    const response = http.get(`${BASE}${path}`, {
      tags: { page: path.split("/")[1] || "home" },
    });
    check(response, { "answered 200": (r) => r.status === 200 });
  }
  sleep(PAUSE_S);
}
