import type { Payload } from "payload";

import { rows } from "@/array-rows";
import { relationId } from "@/audit";
import { internalLinkTarget, richTextLinkTargets } from "@/editor";
import { loadPayload } from "@/payload-instance";
import type { Topic } from "@/payload-types";

import { evidenceOf, referencesOf } from "./evidence";
import { byId, ids, linksOf, type Named, PUBLISHED } from "./read";
import { SUMMARY_FIELDS, type SummaryFields, summaries } from "./topic-lists";
import type { TopicChangeEntry, TopicPage, TopicSummary } from "./types";

// A topic's page, and its preview for staff (read.ts).

/** Page addresses for the body's links to public topics and individuals. */
type BodyNode = { fields?: unknown; children?: unknown };

/**
 * The body as visitors may see it. An internal link to a public page keeps
 * only that page's id; one to anything else, such as a draft or a private
 * profile, loses its target, as the page shows it as plain text. The
 * page's data then names nothing the page does not.
 */
function publicBody(
  body: Topic["body"],
  links: Record<string, string>,
): Topic["body"] {
  const visit = (node: BodyNode): BodyNode => {
    let shown = node;
    const fields = node.fields;
    if (
      fields &&
      typeof fields === "object" &&
      "linkType" in fields &&
      fields.linkType === "internal"
    ) {
      const target = internalLinkTarget(fields);
      const isPublic =
        target !== null &&
        links[`${target.relationTo}:${target.id}`] !== undefined;
      shown = {
        ...node,
        fields: {
          ...fields,
          doc: isPublic
            ? { relationTo: target.relationTo, value: target.id }
            : null,
        },
      };
    }
    return Array.isArray(shown.children)
      ? {
          ...shown,
          children: shown.children.map((child: BodyNode) => visit(child)),
        }
      : shown;
  };
  return { ...body, root: visit(body.root) as Topic["body"]["root"] };
}

async function bodyLinksOf(
  payload: Payload,
  body: Topic["body"],
): Promise<Record<string, string>> {
  const targets = richTextLinkTargets(body);
  const topicIds = targets
    .filter((target) => target.relationTo === "topics")
    .map((target) => target.id);
  const individualIds = targets
    .filter((target) => target.relationTo === "individuals")
    .map((target) => target.id);
  const links: Record<string, string> = {};
  if (topicIds.length > 0) {
    const { docs } = await payload.find({
      collection: "topics",
      draft: false,
      where: { and: [PUBLISHED, { id: { in: topicIds } }] },
      select: { slug: true },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    });
    for (const doc of docs) links[`topics:${doc.id}`] = `/topics/${doc.slug}`;
  }
  // A published topic that links an individual names them, which makes them
  // public.
  const individuals = await byId<Named>(payload, "individuals", individualIds, {
    slug: true,
    name: true,
  });
  for (const [id, individual] of individuals) {
    links[`individuals:${id}`] = `/individuals/${individual.slug}`;
  }
  return links;
}

async function changesOf(
  payload: Payload,
  topicId: string,
): Promise<TopicChangeEntry[]> {
  const { docs } = await payload.find({
    collection: "topic-changes",
    where: { topic: { equals: topicId } },
    // Not who made the change: staff accounts stay private.
    select: { kind: true, note: true, createdAt: true },
    sort: "-createdAt",
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  return docs.map((doc) => ({
    kind: doc.kind,
    note: doc.note,
    date: doc.createdAt,
  }));
}

const TOPIC_PAGE_FIELDS = {
  ...SUMMARY_FIELDS,
  body: true,
  category: true,
  tags: true,
  people: true,
  evidence: true,
  references: true,
} as const;

type TopicPageFields = SummaryFields &
  Pick<
    Topic,
    "body" | "category" | "tags" | "people" | "evidence" | "references"
  >;

/** A published topic's page, or null when no published topic has the slug. */
export async function loadTopicPage(slug: string): Promise<TopicPage | null> {
  const payload = await loadPayload();
  const { docs } = await payload.find({
    collection: "topics",
    draft: false,
    where: { and: [PUBLISHED, { slug: { equals: slug } }] },
    select: TOPIC_PAGE_FIELDS,
    limit: 1,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  });
  const topic = docs[0];
  return topic ? topicPageOf(payload, topic) : null;
}

/**
 * A topic's newest draft as its page will show it once published, for
 * staff previewing it (ADR 0014, live preview), or null when there is no
 * such topic. Its files are linked where Payload serves them to staff:
 * /files serves only what visitors may see, and a draft's new evidence is
 * not that yet. Never cached: each preview reads the draft as it is.
 */
export async function loadTopicPreview(id: string): Promise<TopicPage | null> {
  const payload = await loadPayload();
  const topic = await payload.findByID({
    collection: "topics",
    id,
    draft: true,
    select: { ...TOPIC_PAGE_FIELDS, archived: true },
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
  });
  if (!topic) return null;
  const page = await topicPageOf(payload, {
    ...topic,
    // Archiving takes effect when the draft is published.
    state: topic.archived ? "archived" : topic.state,
  });
  return {
    ...page,
    evidence: page.evidence.map((item) =>
      item.kind === "image" || item.kind === "document"
        ? {
            ...item,
            file: {
              ...item.file,
              url: `/api/media/file/${encodeURIComponent(item.file.filename)}`,
            },
          }
        : item,
    ),
  };
}

/** A topic's page, from the version of it given. */
async function topicPageOf(
  payload: Payload,
  topic: TopicPageFields,
): Promise<TopicPage> {
  // Independent reads, outside any transaction: run together, so the first
  // visit after a purge waits for the slowest rather than for all of them.
  const people = rows(topic.people);
  const named = { name: true, slug: true } as const;
  const [
    [summary],
    categories,
    tags,
    individuals,
    bodyLinks,
    evidence,
    references,
    changes,
  ] = await Promise.all([
    summaries(payload, [topic]),
    byId<Named>(payload, "categories", ids([topic.category]), named),
    byId<Named>(payload, "tags", ids(topic.tags ?? []), named),
    byId<Named>(
      payload,
      "individuals",
      ids(people.map((row) => row.individual)),
      named,
    ),
    bodyLinksOf(payload, topic.body),
    evidenceOf(payload, rows(topic.evidence)),
    referencesOf(payload, rows(topic.references)),
    changesOf(payload, String(topic.id)),
  ]);
  const category = categories.get(relationId(topic.category) ?? "");

  return {
    ...(summary as TopicSummary),
    category: category ? { name: category.name, slug: category.slug } : null,
    tags: linksOf(tags, ids(topic.tags ?? [])).map(({ name, slug }) => ({
      name,
      slug,
    })),
    people: people.flatMap((row) => {
      const individual = individuals.get(relationId(row.individual) ?? "");
      return individual
        ? [
            {
              individual: { name: individual.name, slug: individual.slug },
              role: row.role,
            },
          ]
        : [];
    }),
    body: publicBody(topic.body, bodyLinks),
    bodyLinks,
    evidence,
    references,
    changes,
  };
}
