import type { PayloadRequest } from "payload";

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
    if (before[field] !== after[field]) {
      changes[field] = {
        from: before[field] ?? null,
        to: after[field] ?? null,
      };
    }
  }
  return changes;
}
