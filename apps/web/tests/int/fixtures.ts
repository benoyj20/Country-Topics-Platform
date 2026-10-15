import {
  createContentStore,
  createRedisConnection,
  LINK_QUEUE_NAME,
  processReferenceCheck,
  REFERENCE_QUEUE_NAME,
  type ReferenceCheckers,
} from "@countrytopics/jobs";
import { Queue } from "bullmq";
import type { Payload, RequiredDataFromCollectionSlug } from "payload";
import pg from "pg";

import { serverEnv } from "@/env";

type TopicBody = RequiredDataFromCollectionSlug<"topics">["body"];

const textNode = (text: string) => ({
  type: "text",
  text,
  format: 0,
  detail: 0,
  mode: "normal",
  style: "",
  version: 1,
});

/** A Lexical document with one paragraph per string; nodes may be passed too. */
export function richText(
  ...paragraphs: (string | Record<string, unknown>)[]
): TopicBody {
  return {
    root: {
      type: "root",
      format: "",
      indent: 0,
      version: 1,
      direction: "ltr",
      children: paragraphs.map((content) => ({
        type: "paragraph",
        format: "",
        indent: 0,
        version: 1,
        direction: "ltr",
        textFormat: 0,
        children: [typeof content === "string" ? textNode(content) : content],
      })),
    },
  } as unknown as TopicBody;
}

/** A link node: to a web address, or to a document such as an individual. */
export function linkNode(
  target: string | { relationTo: string; value: string },
) {
  return {
    type: "link",
    fields:
      typeof target === "string"
        ? { linkType: "custom", url: target, newTab: false }
        : { linkType: "internal", doc: target, newTab: false },
    format: "",
    indent: 0,
    version: 3,
    direction: "ltr",
    children: [textNode("a link")],
  };
}

/** A 1×1 transparent PNG, the smallest valid image. */
export const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

/** A minimal synthetic PDF with one empty page. */
export const PDF_BYTES = Buffer.from(
  [
    "%PDF-1.4",
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] >> endobj",
    "xref",
    "0 4",
    "0000000000 65535 f ",
    "trailer << /Size 4 /Root 1 0 R >>",
    "startxref",
    "0",
    "%%EOF",
  ].join("\n"),
);

export function file(name: string, mimetype: string, data: Buffer) {
  return { name, mimetype, data, size: data.length };
}

/** Checkers that find every identifier, standing in for the live services. */
export const resolvingCheckers: ReferenceCheckers = {
  bibliography: {
    lookupDoi: async () => ({
      found: true,
      metadata: { source: "Crossref", authors: [] },
    }),
    lookupIsbn: async () => ({
      found: true,
      metadata: { source: "Open Library", authors: [] },
    }),
  },
  checkUrl: async () => ({
    outcome: "resolved",
    message: "The page answered (200).",
  }),
};

/**
 * The worker's database store on the test database, and the tests' own job
 * queues (emptied first, so counts belong to this run).
 */
export async function workerSide() {
  const env = serverEnv();
  const pool = new pg.Pool({ connectionString: env.databaseUrl, max: 2 });
  const connection = createRedisConnection(env.redisUrl, "worker");
  const queues = {
    references: new Queue(REFERENCE_QUEUE_NAME, {
      connection,
      prefix: env.queuePrefix,
    }),
    links: new Queue(LINK_QUEUE_NAME, { connection, prefix: env.queuePrefix }),
  };
  await Promise.all(
    Object.values(queues).map((queue) => queue.obliterate({ force: true })),
  );
  return {
    store: createContentStore(pool),
    queues,
    async close() {
      await Promise.all(Object.values(queues).map((queue) => queue.close()));
      await connection.quit();
      await pool.end();
    },
  };
}

/** Runs the worker's reference check on a reference as it is saved now. */
export async function runReferenceCheck(
  payload: Payload,
  store: ReturnType<typeof createContentStore>,
  referenceId: string,
  checkers: ReferenceCheckers = resolvingCheckers,
) {
  const reference = await payload.findByID({
    collection: "references",
    id: referenceId,
    depth: 0,
    overrideAccess: true,
  });
  return processReferenceCheck(
    {
      referenceId,
      doi: reference.doi ?? null,
      isbn: reference.isbn ?? null,
      url: reference.url ?? null,
    },
    { checkers, store },
    { isFinal: true },
  );
}
