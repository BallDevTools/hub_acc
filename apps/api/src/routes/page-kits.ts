import type { PrismaClient } from "@hub/db";
import { QUEUES } from "@hub/integrations";
import { listQuerySchema, pageKitCreateSchema } from "@hub/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { JobQueue } from "../app";
import { writeAudit } from "../audit";
import { currentUser } from "../auth";
import { notFound } from "../errors";

export function registerPageKitRoutes(app: FastifyInstance, db: PrismaClient, jobs: JobQueue): void {
  const include = { owner: { select: { id: true, name: true } } };

  app.get("/api/page-kits", async (request) => {
    const { page, pageSize, ownerId } = listQuerySchema.parse(request.query);
    const where = ownerId ? { ownerId } : {};
    const [items, total] = await Promise.all([
      db.pageKit.findMany({ where, include, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      db.pageKit.count({ where }),
    ]);
    return { items, total, page, pageSize };
  });

  app.post("/api/page-kits", async (request, reply) => {
    const data = pageKitCreateSchema.parse(request.body);
    const actor = currentUser(request);
    const kit = await db.$transaction(async (tx) => {
      const created = await tx.pageKit.create({ data, include });
      await writeAudit(tx, { actorId: actor.id, action: "create", entityType: "page_kit", entityId: created.id, after: data });
      return created;
    });
    try {
      await jobs.send(QUEUES.generatePageKit, { pageKitId: kit.id });
    } catch (error) {
      request.log.error({ err: error }, "could not queue page kit");
      const failed = await db.pageKit.update({
        where: { id: kit.id },
        data: { status: "failed", error: "ส่งงานเข้าคิวไม่สำเร็จ" },
        include,
      });
      return reply.status(201).send(failed);
    }
    return reply.status(201).send(kit);
  });

  app.post("/api/page-kits/:id/retry", async (request) => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    if (!(await db.pageKit.findUnique({ where: { id }, select: { id: true } }))) throw notFound();
    const kit = await db.pageKit.update({ where: { id }, data: { status: "pending", error: null }, include });
    await jobs.send(QUEUES.generatePageKit, { pageKitId: id });
    return kit;
  });
}
