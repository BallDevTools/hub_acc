import type { Prisma, PrismaClient } from "@hub/db";
import { listQuerySchema, type EntityType, type ListQuery } from "@hub/shared";
import type { FastifyInstance } from "fastify";
import { z, type ZodType } from "zod";
import { writeAudit } from "./audit";
import { currentUser, requireAdmin } from "./auth";
import { HttpError, notFound } from "./errors";

export type Row = Record<string, unknown> & { id: string };

interface Delegate {
  findMany(args: object): Promise<Row[]>;
  count(args: object): Promise<number>;
  findUnique(args: object): Promise<Row | null>;
  create(args: object): Promise<Row>;
  update(args: object): Promise<Row>;
  delete(args: object): Promise<Row>;
}

type Data = Record<string, unknown>;

export interface CrudOptions {
  path: string;
  entityType: EntityType;
  delegate: (client: Prisma.TransactionClient) => unknown;
  createSchema: ZodType<Data>;
  updateSchema: ZodType<Data>;
  searchFields: string[];
  statuses: readonly string[];
  include?: object;
  extraFilters?: (query: ListQuery) => object;
  /** ตรวจกฎข้ามตาราง `next` คือค่าหลังแก้ไขทั้งแถว ส่วน `current` เป็น null ตอนสร้าง */
  validate?: (tx: Prisma.TransactionClient, next: Data, current: Row | null) => Promise<void>;
  /** ปรับข้อมูลก่อนบันทึก ใช้กับค่าที่ระบบคำนวณเอง */
  beforeUpdate?: (changes: Data, current: Row) => Data;
  /** เติมค่าที่ระบบกำหนดตอนสร้าง เช่น ผู้สร้าง */
  prepareCreate?: (data: Data, actorId: string) => Data;
  afterCreate?: (tx: Prisma.TransactionClient, created: Row) => Promise<void>;
}

const idParam = z.object({ id: z.uuid() });

function isChanged(current: Row, changes: Data): boolean {
  return Object.entries(changes).some(([key, value]) => current[key] !== (value === undefined ? current[key] : value));
}

export function registerCrud(app: FastifyInstance, db: PrismaClient, options: CrudOptions): void {
  const delegateOf = (client: Prisma.TransactionClient) => options.delegate(client) as Delegate;
  const { path, entityType, include } = options;

  app.get(path, async (request) => {
    const query = listQuerySchema.parse(request.query);
    if (query.status && !options.statuses.includes(query.status)) {
      throw new HttpError(400, "validation_error", "สถานะไม่ถูกต้อง");
    }
    const where: object = {
      ...(query.status ? { status: query.status } : {}),
      ...options.extraFilters?.(query),
      ...(query.q
        ? {
            OR: options.searchFields.map((field) => ({
              [field]: { contains: query.q, mode: "insensitive" },
            })),
          }
        : {}),
    };
    const delegate = delegateOf(db);
    const [items, total] = await Promise.all([
      delegate.findMany({
        where,
        include,
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      delegate.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  });

  app.get(`${path}/:id`, async (request) => {
    const { id } = idParam.parse(request.params);
    const row = await delegateOf(db).findUnique({ where: { id }, include });
    if (!row) throw notFound();
    return row;
  });

  app.post(`${path}`, async (request, reply) => {
    const data = options.createSchema.parse(request.body);
    const actor = currentUser(request);
    const id = await db.$transaction(async (tx) => {
      await options.validate?.(tx, data, null);
      const created = await delegateOf(tx).create({ data: options.prepareCreate?.(data, actor.id) ?? data });
      await options.afterCreate?.(tx, created);
      await writeAudit(tx, {
        actorId: actor.id,
        action: "create",
        entityType,
        entityId: created.id,
        after: created,
      });
      return created.id;
    });
    const row = await delegateOf(db).findUnique({ where: { id }, include });
    return reply.status(201).send(row);
  });

  app.patch(`${path}/:id`, async (request) => {
    const { id } = idParam.parse(request.params);
    const parsed = options.updateSchema.parse(request.body);
    const actor = currentUser(request);
    await db.$transaction(async (tx) => {
      const delegate = delegateOf(tx);
      const current = await delegate.findUnique({ where: { id } });
      if (!current) throw notFound();
      if (!isChanged(current, parsed)) return;
      const changes = options.beforeUpdate?.(parsed, current) ?? parsed;
      await options.validate?.(tx, { ...current, ...changes }, current);
      const updated = await delegate.update({ where: { id }, data: changes });
      await writeAudit(tx, {
        actorId: actor.id,
        action: "update",
        entityType,
        entityId: id,
        before: current,
        after: updated,
      });
    });
    return delegateOf(db).findUnique({ where: { id }, include });
  });

  app.delete(`${path}/:id`, async (request, reply) => {
    requireAdmin(request);
    const { id } = idParam.parse(request.params);
    const actor = currentUser(request);
    await db.$transaction(async (tx) => {
      const delegate = delegateOf(tx);
      const current = await delegate.findUnique({ where: { id } });
      if (!current) throw notFound();
      await delegate.delete({ where: { id } });
      await writeAudit(tx, {
        actorId: actor.id,
        action: "delete",
        entityType,
        entityId: id,
        before: current,
      });
    });
    return reply.status(204).send();
  });
}
