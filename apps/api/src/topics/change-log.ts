import { isDeepStrictEqual } from "node:util";
import type { CollectionAfterChangeHook, PayloadRequest } from "payload";

import { rows } from "@/array-rows";
import { recordAudit, relationId } from "@/audit";
import { queueSearchIndex } from "@/content-jobs";
import { PUBLIC_TAGS, purgePublicPages } from "@/public-cache";

import { AUTOSAVE, NEW_TOPIC, pendingChanges } from "./pending";

// What follows a topic's save: its public change log entry, the purge and
// search update of a publish, and the audit log.

// Fields compared to say which ones a draft save changed, in the audit log.
const AUDITED_FIELDS = [
  "title",
  "summary",
  "body",
  "countries",
  "category",
  "tags",
  "people",
  "evidence",
  "references",
  "readyForReview",
  "archived",
  "slug",
] as const;

/** The version the current operation saved last. */
async function latestVersion(req: PayloadRequest, topic: string | number) {
  const { docs } = await req.payload.findVersions({
    collection: "topics",
    where: { parent: { equals: topic } },
    sort: "-updatedAt",
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  });
  return docs[0] ?? null;
}

/** A comparable form of a field: related documents reduced to their ids. */
function comparable(field: (typeof AUDITED_FIELDS)[number], value: unknown) {
  if (field === "countries" || field === "tags")
    return Array.isArray(value) ? value.map(relationId) : [];
  if (field === "category") return relationId(value);
  if (field === "people")
    return Array.isArray(value)
      ? value.map((row: { individual?: unknown; role?: unknown }) => ({
          individual: relationId(row?.individual),
          role: row?.role ?? null,
        }))
      : [];
  if (field === "evidence")
    return rows(value).map((row) => ({
      kind: row.kind ?? null,
      title: row.title ?? null,
      file: relationId(row.file),
      snippet: relationId(row.snippet),
      url: row.url ?? null,
      archiveUrl: row.archiveUrl ?? null,
      note: row.note ?? null,
    }));
  if (field === "references")
    return rows(value).map((row) => ({
      reference: relationId(row.reference),
      stance: row.stance ?? null,
      passage: row.passage ?? null,
      locator: row.locator ?? null,
    }));
  return value ?? null;
}

/**
 * Audits every save: creates, publishes (with a change log entry), draft saves
 * (which fields changed), and draft restores.
 */
export const recordChange: CollectionAfterChangeHook = async ({
  doc,
  operation,
  previousDoc,
  req,
}) => {
  const target = { targetCollection: "topics", targetId: String(doc.id) };
  if (operation === "create") {
    await recordAudit(req, {
      action: "topic.created",
      ...target,
      details: { title: doc.title },
    });
  }
  const key = operation === "create" ? NEW_TOPIC : String(doc.id);
  const pending = pendingChanges(req).get(key);
  pendingChanges(req).delete(key);
  const latest = await latestVersion(req, doc.id);
  const version = latest ? String(latest.id) : null;

  if (pending) {
    // Every publish has a change log entry, so this is where the live
    // version changes; draft saves leave visitors' pages and search alone.
    purgePublicPages([PUBLIC_TAGS.topics]);
    await queueSearchIndex(req, [String(doc.id)], {
      table: "topics",
      id: String(doc.id),
      updatedAt: doc.updatedAt,
    });
    await req.payload.create({
      collection: "topic-changes",
      data: {
        topic: doc.id,
        kind: pending.kind,
        note: pending.note,
        version,
        actor: req.user?.id ?? null,
      },
      overrideAccess: true,
      req,
    });
    await recordAudit(req, {
      action: `topic.${pending.kind}`,
      ...target,
      details: { title: doc.title, note: pending.note, version },
    });
    return;
  }
  if (operation !== "update") return;
  if (req.context.isRestoringVersion) {
    await recordAudit(req, {
      action: "topic.restored_as_draft",
      ...target,
      details: { title: doc.title, version },
    });
    return;
  }
  // Autosaves update one version in place (Payload keeps it as the newest
  // draft), each with what it changed: at most every
  // TOPIC_AUTOSAVE_INTERVAL_MS while an editor types.
  const autosave = req.context[AUTOSAVE] === true;
  const fields = AUDITED_FIELDS.filter(
    (field) =>
      !isDeepStrictEqual(
        comparable(field, previousDoc?.[field]),
        comparable(field, doc[field]),
      ),
  );
  await recordAudit(req, {
    action: "topic.draft_saved",
    ...target,
    details: {
      title: doc.title,
      fields,
      version,
      ...(autosave && { autosave }),
    },
  });
};
