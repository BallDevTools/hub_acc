import type { Prisma, PrismaClient } from "@hub/db";
import { ONBOARDING_TEMPLATES, taskUpdateSchema } from "@hub/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { writeAudit } from "../audit";
import { currentUser } from "../auth";
import { notFound } from "../errors";

const DEFAULT_DUE_DAYS = 7;

export async function createOnboardingTasks(tx: Prisma.TransactionClient, ownerId: string): Promise<void> {
  const dueAt = new Date(Date.now() + DEFAULT_DUE_DAYS * 24 * 60 * 60 * 1000);
  await tx.onboardingTask.createMany({
    skipDuplicates: true,
    data: Object.entries(ONBOARDING_TEMPLATES).flatMap(([template, { steps }]) =>
      steps.map((step, position) => ({
        ownerId,
        template,
        stepKey: step.key,
        title: step.title,
        description: step.description,
        url: step.url,
        position,
        dueAt,
      })),
    ),
  });
}

const ownerParam = z.object({ ownerId: z.uuid() });
const idParam = z.object({ id: z.uuid() });

export function registerOnboardingRoutes(app: FastifyInstance, db: PrismaClient): void {
  app.get("/api/onboarding/:ownerId", async (request) => {
    const { ownerId } = ownerParam.parse(request.params);
    const owner = await db.owner.findUnique({
      where: { id: ownerId },
      select: {
        id: true,
        name: true,
        contactEmail: true,
        mailboxes: { select: { address: true }, orderBy: { createdAt: "asc" }, take: 1 },
      },
    });
    if (!owner) throw notFound();
    const tasks = await db.onboardingTask.findMany({
      where: { ownerId },
      orderBy: [{ template: "asc" }, { position: "asc" }],
    });
    return {
      owner: { id: owner.id, name: owner.name },
      copyValues: { name: owner.name, contactEmail: owner.contactEmail, mailbox: owner.mailboxes[0]?.address ?? null },
      tasks,
    };
  });

  app.post("/api/onboarding/:ownerId/generate", async (request) => {
    const { ownerId } = ownerParam.parse(request.params);
    if (!(await db.owner.findUnique({ where: { id: ownerId }, select: { id: true } }))) throw notFound();
    await db.$transaction((tx) => createOnboardingTasks(tx, ownerId));
    return { total: await db.onboardingTask.count({ where: { ownerId } }) };
  });

  app.patch("/api/onboarding/tasks/:id", async (request) => {
    const { id } = idParam.parse(request.params);
    const { status, assigneeId, dueAt } = taskUpdateSchema.parse(request.body);
    const actor = currentUser(request);
    return db.$transaction(async (tx) => {
      const before = await tx.onboardingTask.findUnique({ where: { id } });
      if (!before) throw notFound();
      const updated = await tx.onboardingTask.update({
        where: { id },
        data: {
          status,
          assigneeId,
          dueAt: dueAt === undefined ? undefined : dueAt === null ? null : new Date(dueAt),
          completedAt: status === undefined ? undefined : status === "done" ? new Date() : null,
        },
      });
      await writeAudit(tx, {
        actorId: actor.id,
        action: "update",
        entityType: "onboarding_task",
        entityId: id,
        before,
        after: updated,
      });
      return updated;
    });
  });
}
