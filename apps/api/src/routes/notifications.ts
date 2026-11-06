import type { PrismaClient } from "@hub/db";
import { listQuerySchema } from "@hub/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { notFound } from "../errors";

export function registerNotificationRoutes(app: FastifyInstance, db: PrismaClient): void {
  app.get("/api/notifications", async (request) => {
    const { page, pageSize } = listQuerySchema.parse(request.query);
    const [items, total, unread] = await Promise.all([
      db.notification.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      db.notification.count(),
      db.notification.count({ where: { readAt: null } }),
    ]);
    return { items, total, unread, page, pageSize };
  });

  app.post("/api/notifications/:id/read", async (request) => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const { count } = await db.notification.updateMany({ where: { id, readAt: null }, data: { readAt: new Date() } });
    if (count === 0 && !(await db.notification.findUnique({ where: { id }, select: { id: true } }))) throw notFound();
    return { ok: true };
  });

  app.post("/api/notifications/read-all", async () => {
    const { count } = await db.notification.updateMany({ where: { readAt: null }, data: { readAt: new Date() } });
    return { count };
  });
}
