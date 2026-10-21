// A stand-in for the backend's page-data endpoint, and a stand-in for
// Sentry, for the Workers spike (ADR 0014, phase 1). Throwaway.
//
//   GET  /api/v1/pages/topics/:slug   the topic's page data, from a fixture
//   POST /test/title?slug=..&title=.. changes a topic's title, to test purges
//   POST /api/:project/envelope/      counts error reports sent to "Sentry"
//   GET  /test/reports                how many reports and page requests
//                                     arrived, and what the last report held
//
// Usage: node backend.mjs [fixture.json ...]  (default: the TEST fixture).
// BACKEND_HOST sets the address it listens on (default 127.0.0.1).

import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const PORT = 3102;
const HOST = process.env.BACKEND_HOST ?? "127.0.0.1";
const files = process.argv.slice(2);
const topics = new Map(
  (files.length ? files : ["fixtures/test-topic.json"]).map((file) => {
    const topic = JSON.parse(readFileSync(file, "utf8"));
    return [topic.slug, topic];
  }),
);
let reports = 0;
let lastReport = null;
let pageRequests = 0;

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  const page = /^\/api\/v1\/pages\/topics\/([a-z0-9-]+)$/.exec(url.pathname);
  if (req.method === "GET" && page) {
    pageRequests += 1;
    const topic = topics.get(page[1]);
    return topic
      ? send(res, 200, topic)
      : send(res, 404, { error: "not found" });
  }
  if (req.method === "POST" && url.pathname === "/test/title") {
    const topic = topics.get(url.searchParams.get("slug") ?? "");
    if (!topic) return send(res, 404, { error: "not found" });
    topic.title = url.searchParams.get("title") ?? topic.title;
    return send(res, 200, { title: topic.title });
  }
  if (req.method === "POST" && /^\/api\/\d+\/envelope\/?$/.test(url.pathname)) {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      reports += 1;
      // An envelope: a header line, then an item header and its payload.
      const [, , payload = "{}"] = Buffer.concat(chunks)
        .toString("utf8")
        .split(String.fromCharCode(10));
      const event = JSON.parse(payload);
      const exception = event.exception?.values?.[0];
      lastReport = {
        type: exception?.type,
        value: exception?.value,
        environment: event.environment,
        hasUser: "user" in event,
        hasCookies: Boolean(
          event.request?.cookies || event.request?.headers?.cookie,
        ),
      };
      console.log(`error report ${reports} received: ${exception?.value}`);
      send(res, 200, {});
    });
    return;
  }
  if (req.method === "GET" && url.pathname === "/test/reports") {
    return send(res, 200, { reports, pageRequests, lastReport });
  }
  send(res, 404, { error: "not found" });
}).listen(PORT, HOST, () => {
  console.log(
    `spike backend on http://${HOST}:${PORT}: ${[...topics.keys()].join(", ")}`,
  );
});
