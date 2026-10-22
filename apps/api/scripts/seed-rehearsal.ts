// Fills the scale rehearsal's database with made-up content for load tests
// (ADR 0013): published TEST topics in several countries, TEST members, and
// comments with replies. Every name and text says TEST; nothing is about a
// real person. Refuses any database whose name does not end in
// "_rehearsal", so development and pilot data cannot be touched. Run in a
// API container (make scale-seed):
//
//   node node_modules/payload/bin.js run scripts/seed-rehearsal.ts [topics]

import config from "@payload-config";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import { getPayload, type RequiredDataFromCollectionSlug } from "payload";

import type { Topic } from "../src/payload-types";
import { v7 as uuidv7 } from "uuid";

const TOPICS = Number(process.argv[2] ?? 1_000);
const MEMBERS = 50;
/** Comments per topic: up to this many threads, each with up to 3 replies. */
const MAX_THREADS = 8;
const PARALLEL = 4;
const COUNTRY_CODES = ["KE", "GH", "PT", "TZ", "MT", "CY", "IS", "NZ"];
const WORDS = [
  "water",
  "transport",
  "schools",
  "budget",
  "energy",
  "housing",
  "elections",
  "health",
  "farming",
  "fisheries",
  "roads",
  "tourism",
];

const databaseName = new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);
if (!databaseName.endsWith("_rehearsal")) {
  console.error(
    "Refusing to seed: DATABASE_URL must name a database ending in _rehearsal.",
  );
  process.exit(2);
}
if (!Number.isInteger(TOPICS) || TOPICS < 1 || TOPICS > 20_000) {
  console.error("Give a number of topics from 1 to 20000.");
  process.exit(2);
}

const pick = <T>(list: readonly T[], n: number): T =>
  list[n % list.length] as T;

function paragraph(text: string) {
  return {
    type: "paragraph",
    format: "",
    indent: 0,
    version: 1,
    direction: "ltr",
    textFormat: 0,
    children: [
      {
        type: "text",
        text,
        format: 0,
        detail: 0,
        mode: "normal",
        style: "",
        version: 1,
      },
    ],
  };
}

const payload = await getPayload({ config });
const admin = await payload.create({
  collection: "users",
  data: {
    email: `rehearsal-seed-${Date.now()}@example.test`,
    role: "admin",
    displayName: "TEST Seeder",
  },
  overrideAccess: true,
});
const { docs: countries } = await payload.find({
  collection: "countries",
  where: { code: { in: COUNTRY_CODES } },
  limit: COUNTRY_CODES.length,
  depth: 0,
  overrideAccess: true,
});

const topicIds: string[] = [];
async function seedTopic(n: number): Promise<void> {
  const subject = `${pick(WORDS, n)} and ${pick(WORDS, n * 7 + 3)}`;
  const draft = await payload.create({
    collection: "topics",
    data: {
      title: `TEST Rehearsal topic ${n}: ${subject}`,
      slug: "",
      summary: `TEST made-up summary about ${subject}, for load tests only.`,
      // A Lexical document as the editor saves it; Payload's generated type
      // is looser about node fields than these literals, as in the tests'
      // fixtures.
      body: {
        root: {
          type: "root",
          format: "",
          indent: 0,
          version: 1,
          direction: "ltr",
          children: [
            paragraph(`TEST made-up text about ${subject}.`),
            paragraph("TEST It exists only to give the load tests some size."),
          ],
        },
      } as unknown as Topic["body"],
      countries: [pick(countries, n).id],
    } as RequiredDataFromCollectionSlug<"topics">,
    draft: true,
    user: admin,
    overrideAccess: true,
  });
  await payload.update({
    collection: "topics",
    id: draft.id,
    data: { _status: "published" },
    user: admin,
    overrideAccess: true,
  });
  topicIds.push(draft.id);
}

console.log(`Seeding ${TOPICS} TEST topics into ${databaseName}…`);
for (let start = 1; start <= TOPICS; start += PARALLEL) {
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, TOPICS - start + 1) }, (_, i) =>
      seedTopic(start + i),
    ),
  );
  if ((start + PARALLEL - 1) % 100 < PARALLEL) {
    console.log(`  ${Math.min(start + PARALLEL - 1, TOPICS)} topics`);
  }
}

const members: string[] = [];
for (let n = 1; n <= MEMBERS; n += 1) {
  const member = await payload.create({
    collection: "users",
    data: {
      email: `rehearsal-seed-member-${n}-${Date.now()}@example.test`,
      role: "member",
      displayName: `TEST Member ${n}`,
    },
    overrideAccess: true,
  });
  members.push(member.id);
}

// Comments straight into the table, as the comment routes write them: many
// rows, and no hooks to run. Payload types its database as the generic
// adapter; this config always uses the PostgreSQL one, checked here before
// any comment is written (as src/write-pool.ts does).
const { pool } = payload.db as unknown as Partial<PostgresAdapter>;
if (!pool) throw new Error("The database adapter has no PostgreSQL pool.");
let comments = 0;
for (const [index, topicId] of topicIds.entries()) {
  const at = new Date(Date.now() - (topicIds.length - index) * 60_000);
  for (let t = 0; t < index % (MAX_THREADS + 1); t += 1) {
    const threadId = uuidv7();
    const stamp = new Date(at.getTime() + t * 1_000).toISOString();
    await pool.query(
      `INSERT INTO comments (id, topic_id, author_id, body, score, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6)`,
      [
        threadId,
        topicId,
        pick(members, index + t),
        `TEST comment ${t + 1} on a made-up topic.`,
        (index + t) % 7,
        stamp,
      ],
    );
    comments += 1;
    for (let r = 0; r < (index + t) % 4; r += 1) {
      await pool.query(
        `INSERT INTO comments (id, topic_id, parent_id, author_id, body, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $6)`,
        [
          uuidv7(),
          topicId,
          threadId,
          pick(members, index + t + r + 1),
          `TEST reply ${r + 1}.`,
          stamp,
        ],
      );
      comments += 1;
    }
  }
}

console.log(
  `Seeded ${topicIds.length} topics, ${members.length} members, and ${comments} comments. Restart the workers to rebuild the search index with the comment counts.`,
);
process.exit(0);
