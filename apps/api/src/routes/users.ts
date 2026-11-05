import type { PrismaClient } from "@hub/db";
import { userCreateSchema, userUpdateSchema } from "@hub/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { writeAudit } from "../audit";
import { currentUser, requireAdmin } from "../auth";
import { HttpError, notFound } from "../errors";

const select = { id: true, email: true, name: true, role: true, active: true, lastLoginAt: true } as const;

export function registerUserRoutes(app: FastifyInstance, db: PrismaClient): void {
  app.get("/api/users", async () => db.user.findMany({ select, orderBy: { email: "asc" } }));

  app.post("/api/users", async (request, reply) => {
    requireAdmin(request);
    const data = userCreateSchema.parse(request.body);
    const actor = currentUser(request);
    const created = await db.$transaction(async (tx) => {
      const user = await tx.user.create({ data, select });
      await writeAudit(tx, { actorId: actor.id, action: "create", entityType: "user", entityId: user.id, after: user });
      return user;
    });
    return reply.status(201).send(created);
  });

  app.patch("/api/users/:id", async (request) => {
    requireAdmin(request);
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const data = userUpdateSchema.parse(request.body);
    const actor = currentUser(request);
    // กันไม่ให้ระบบไม่เหลือ admin: admin เปลี่ยนสิทธิ์หรือปิดบัญชีตัวเองไม่ได้
    if (id === actor.id && (data.role !== undefined || data.active !== undefined)) {
      throw new HttpError(400, "self_change", "เปลี่ยนสิทธิ์หรือปิดบัญชีของตัวเองไม่ได้");
    }
    return db.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id }, select });
      if (!before) throw notFound();
      const updated = await tx.user.update({ where: { id }, data, select });
      if (data.active === false) await tx.session.deleteMany({ where: { userId: id } });
      await writeAudit(tx, { actorId: actor.id, action: "update", entityType: "user", entityId: id, before, after: updated });
      return updated;
    });
  });
}
