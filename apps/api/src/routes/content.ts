import type { PrismaClient } from "@hub/db";
import {
  CONTENT_STATUSES,
  contentCreateSchema,
  contentUpdateSchema,
  POST_JOB_STATUSES,
  postJobCreateSchema,
  postJobListSchema,
  postJobRetrySchema,
} from "@hub/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { writeAudit } from "../audit";
import { currentUser, requireAdmin } from "../auth";
import { registerCrud } from "../crud";
import { HttpError, notFound } from "../errors";

const idParam = z.object({ id: z.uuid() });
const CONTENT_FIELDS = ["title", "body", "link"] as const;
const SCHEDULE_GRACE_MS = 60_000;

export function registerContentRoutes(app: FastifyInstance, db: PrismaClient): void {
  registerCrud(app, db, {
    path: "/api/content",
    entityType: "content_item",
    delegate: (client) => client.contentItem,
    createSchema: contentCreateSchema,
    updateSchema: contentUpdateSchema,
    searchFields: ["title", "body"],
    statuses: CONTENT_STATUSES,
    include: {
      createdBy: { select: { email: true, name: true } },
      approvedBy: { select: { email: true, name: true } },
      _count: { select: { postJobs: true } },
    },
    prepareCreate: (data, actorId) => ({ ...data, createdById: actorId }),
    // เนื้อหาที่อนุมัติแล้วถ้าถูกแก้ ต้องกลับไปอนุมัติใหม่
    beforeUpdate: (changes, current) =>
      CONTENT_FIELDS.some((field) => changes[field] !== undefined && changes[field] !== current[field])
        ? { ...changes, status: "draft", approvedById: null, approvedAt: null }
        : changes,
  });

  const setContentStatus = (status: "approved" | "archived") => async (request: Parameters<typeof requireAdmin>[0]) => {
    requireAdmin(request);
    const { id } = idParam.parse(request.params);
    const actor = currentUser(request);
    return db.$transaction(async (tx) => {
      const before = await tx.contentItem.findUnique({ where: { id } });
      if (!before) throw notFound();
      const updated = await tx.contentItem.update({
        where: { id },
        data: status === "approved" ? { status, approvedById: actor.id, approvedAt: new Date() } : { status },
      });
      await writeAudit(tx, { actorId: actor.id, action: "update", entityType: "content_item", entityId: id, before, after: updated });
      return updated;
    });
  };
  app.post("/api/content/:id/approve", setContentStatus("approved"));
  app.post("/api/content/:id/archive", setContentStatus("archived"));

  const jobInclude = {
    contentItem: { select: { id: true, title: true, status: true } },
    page: { select: { id: true, name: true } },
  };

  app.get("/api/post-jobs", async (request) => {
    const { page, pageSize, status, pageId } = postJobListSchema.parse(request.query);
    if (status && !(POST_JOB_STATUSES as readonly string[]).includes(status)) {
      throw new HttpError(400, "validation_error", "สถานะไม่ถูกต้อง");
    }
    const where = {
      ...(status ? { status: status as (typeof POST_JOB_STATUSES)[number] } : {}),
      ...(pageId ? { pageId } : {}),
    };
    const [items, total] = await Promise.all([
      db.postJob.findMany({
        where,
        include: jobInclude,
        orderBy: { scheduledAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.postJob.count({ where }),
    ]);
    return { items, total, page, pageSize };
  });

  app.post("/api/post-jobs", async (request, reply) => {
    const { contentItemId, pageIds, scheduledAt } = postJobCreateSchema.parse(request.body);
    const when = new Date(scheduledAt);
    if (when.getTime() < Date.now() - SCHEDULE_GRACE_MS) {
      throw new HttpError(400, "validation_error", "เวลาโพสต์ต้องไม่อยู่ในอดีต");
    }
    const actor = currentUser(request);
    const uniquePages = [...new Set(pageIds)];
    const created = await db.$transaction(async (tx) => {
      const content = await tx.contentItem.findUnique({ where: { id: contentItemId } });
      if (!content) throw notFound();
      if (content.status !== "approved") throw new HttpError(409, "not_approved", "ต้องอนุมัติคอนเทนต์ก่อนตั้งเวลาโพสต์");

      const pages = await tx.page.findMany({ where: { id: { in: uniquePages } }, select: { id: true, connection: { select: { id: true } } } });
      if (pages.length !== uniquePages.length) throw new HttpError(409, "invalid_relation", "พบ Page ที่ไม่มีอยู่ในระบบ");
      if (pages.some((page) => !page.connection)) throw new HttpError(409, "page_not_connected", "มี Page ที่ยังไม่ได้เชื่อมกับ Facebook");

      const jobs = [];
      for (const pageId of uniquePages) {
        const existing = await tx.postJob.findUnique({ where: { contentItemId_pageId: { contentItemId, pageId } } });
        if (existing && existing.status !== "cancelled") {
          throw new HttpError(409, "already_scheduled", "คอนเทนต์นี้เคยตั้งเวลาลง Page นี้แล้ว");
        }
        const data = { scheduledAt: when, status: "scheduled" as const, attempts: 0, nextAttemptAt: null, lastError: null };
        const job = existing
          ? await tx.postJob.update({ where: { id: existing.id }, data })
          : await tx.postJob.create({ data: { contentItemId, pageId, ...data } });
        await writeAudit(tx, { actorId: actor.id, action: "create", entityType: "post_job", entityId: job.id, after: job });
        jobs.push(job);
      }
      return jobs;
    });
    return reply.status(201).send({ items: created });
  });

  /** เปลี่ยนสถานะแบบมีเงื่อนไข เพื่อไม่ให้ทับงานที่ worker เพิ่งหยิบไปโพสต์ */
  async function transition(id: string, actorId: string, from: Array<(typeof POST_JOB_STATUSES)[number]>, data: object) {
    return db.$transaction(async (tx) => {
      const before = await tx.postJob.findUnique({ where: { id } });
      if (!before) throw notFound();
      const { count } = await tx.postJob.updateMany({ where: { id, status: { in: from } }, data });
      if (count === 0) throw new HttpError(409, "invalid_state", "สถานะของรายการนี้เปลี่ยนไปแล้ว กรุณารีเฟรช");
      const after = await tx.postJob.findUniqueOrThrow({ where: { id } });
      await writeAudit(tx, { actorId, action: "update", entityType: "post_job", entityId: id, before, after });
      return after;
    });
  }

  app.post("/api/post-jobs/:id/cancel", async (request) => {
    const { id } = idParam.parse(request.params);
    return transition(id, currentUser(request).id, ["scheduled"], { status: "cancelled" });
  });

  app.post("/api/post-jobs/:id/retry", async (request) => {
    const { id } = idParam.parse(request.params);
    const { confirmNotPosted } = postJobRetrySchema.parse(request.body ?? {});
    const from: Array<(typeof POST_JOB_STATUSES)[number]> = confirmNotPosted ? ["failed", "unknown"] : ["failed"];
    return transition(id, currentUser(request).id, from, {
      status: "scheduled",
      scheduledAt: new Date(),
      attempts: 0,
      nextAttemptAt: null,
      lastError: null,
    });
  });

  app.post("/api/post-jobs/:id/mark-published", async (request) => {
    const { id } = idParam.parse(request.params);
    return transition(id, currentUser(request).id, ["unknown"], { status: "published", publishedAt: new Date(), lastError: null });
  });
}
