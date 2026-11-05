import type { PrismaClient } from "@hub/db";
import { auditQuerySchema } from "@hub/shared";
import type { FastifyInstance } from "fastify";

export function registerAuditRoutes(app: FastifyInstance, db: PrismaClient): void {
  app.get("/api/audit-logs", async (request) => {
    const { page, pageSize, entityType, entityId } = auditQuerySchema.parse(request.query);
    const where = { ...(entityType ? { entityType } : {}), ...(entityId ? { entityId } : {}) };
    const [items, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        include: { actor: { select: { email: true, name: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.auditLog.count({ where }),
    ]);
    return { items, total, page, pageSize };
  });
}
