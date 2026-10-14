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
