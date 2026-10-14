import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  PayloadRequest,
} from "payload";
import { isDeepStrictEqual } from "node:util";

export type AuditEntry = {
  action: string;
  targetCollection: string;
  targetId: string;
  details?: Record<string, unknown>;
};

/**
 * Records an admin or system action (AGENTS.md: admin actions are audited). The
 * entry joins the request's transaction, so it is saved only if the change is.
 */
export async function recordAudit(
  req: PayloadRequest,
  entry: AuditEntry,
): Promise<void> {
  await req.payload.create({
    collection: "audit-log",
    data: { ...entry, actor: req.user?.id ?? null },
    overrideAccess: true,
    req,
  });
}

/** The listed fields whose values differ, as `{ field: { from, to } }`. */
export function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: readonly string[],
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of fields) {
    if (!isDeepStrictEqual(before[field] ?? null, after[field] ?? null)) {
      changes[field] = {
        from: before[field] ?? null,
        to: after[field] ?? null,
      };
    }
  }
  return changes;
}

/** A relationship value's id, whether or not the related document was loaded. */
export function relationId(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (value && typeof value === "object" && "id" in value)
    return String(value.id);
  return null;
}

type AuditedDoc = Record<string, unknown>;

/**
 * Hooks that audit every create, update, and delete in a collection. `snapshot`
 * picks the audited fields as plain values: creates and deletes record the
 * whole snapshot, so a deleted document keeps its trace, and updates record
 * only the fields that changed.
 */
export function auditHooks({
  collection,
  action,
  snapshot,
}: {
  collection: string;
  /** Prefix for the audit actions, such as `individual` for `individual.created`. */
  action: string;
  snapshot: (doc: AuditedDoc) => AuditedDoc;
}): {
  afterChange: CollectionAfterChangeHook[];
  afterDelete: CollectionAfterDeleteHook[];
} {
  return {
    afterChange: [
      async ({ doc, operation, previousDoc, req }) => {
        const after = snapshot(doc);
        if (operation === "create") {
          await recordAudit(req, {
            action: `${action}.created`,
            targetCollection: collection,
            targetId: String(doc.id),
            details: after,
          });
          return;
        }
        const changes = changedFields(
          snapshot(previousDoc),
          after,
          Object.keys(after),
        );
        if (Object.keys(changes).length > 0) {
          await recordAudit(req, {
            action: `${action}.updated`,
            targetCollection: collection,
            targetId: String(doc.id),
            details: { changes },
          });
        }
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        await recordAudit(req, {
          action: `${action}.deleted`,
          targetCollection: collection,
          targetId: String(doc.id),
          details: snapshot(doc),
        });
      },
    ],
  };
}
