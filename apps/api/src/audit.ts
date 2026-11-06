import type { Prisma } from "@hub/db";
import type { EntityType } from "@hub/shared";

type AuditAction = "create" | "update" | "delete";

const toJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export function writeAudit(
  tx: Prisma.TransactionClient,
  entry: {
    actorId: string | null;
    action: AuditAction;
    entityType: EntityType;
    entityId: string;
    before?: unknown;
    after?: unknown;
  },
) {
  return tx.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before === undefined ? undefined : toJson(entry.before),
      after: entry.after === undefined ? undefined : toJson(entry.after),
    },
  });
}
