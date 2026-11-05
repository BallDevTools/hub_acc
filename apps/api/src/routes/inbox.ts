import type { PrismaClient } from "@hub/db";
import { inboxResolveSchema, listQuerySchema } from "@hub/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { writeAudit } from "../audit";
import { currentUser } from "../auth";
import { HttpError, notFound } from "../errors";

export function registerInboxRoutes(app: FastifyInstance, db: PrismaClient): void {
  app.get("/api/inbox", async (request) => {
    const { page, pageSize } = listQuerySchema.parse(request.query);
    const where = { outcome: "needs_review" as const };
    const [items, total] = await Promise.all([
      db.emailEvent.findMany({
        where,
        include: {
          mailbox: {
            select: {
              address: true,
              platformAccounts: { select: { id: true, displayName: true, platform: true } },
            },
          },
        },
        orderBy: { receivedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.emailEvent.count({ where }),
    ]);
    return { items, total, page, pageSize };
  });

  app.post("/api/inbox/:id/resolve", async (request) => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const input = inboxResolveSchema.parse(request.body);
    const actor = currentUser(request);
    return db.$transaction(async (tx) => {
      const event = await tx.emailEvent.findUnique({ where: { id } });
      if (!event) throw notFound();
      if (event.outcome !== "needs_review") throw new HttpError(409, "already_resolved", "รายการนี้จัดการไปแล้ว");
      if (input.action === "dismiss") {
        return tx.emailEvent.update({ where: { id }, data: { outcome: "dismissed", resolvedAt: new Date() } });
      }
      const account = await tx.platformAccount.findUnique({ where: { id: input.platformAccountId } });
      if (!account || account.mailboxId !== event.mailboxId) {
        throw new HttpError(409, "invalid_relation", "บัญชีนี้ไม่ได้ใช้เมลฉบับนี้");
      }
      const updated = await tx.platformAccount.update({
        where: { id: account.id },
        data: {
          status: input.status,
          statusChangedAt: new Date(),
          statusReason: `จากอีเมล: ${event.subject}`.slice(0, 1000),
        },
      });
      await writeAudit(tx, {
        actorId: actor.id,
        action: "update",
        entityType: "platform_account",
        entityId: account.id,
        before: account,
        after: updated,
      });
      return tx.emailEvent.update({
        where: { id },
        data: { outcome: "applied", platformAccountId: account.id, resolvedAt: new Date() },
      });
    });
  });
}
