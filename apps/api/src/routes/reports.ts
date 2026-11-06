import { Prisma, type PrismaClient } from "@hub/db";
import { csvImportSchema, csvPreviewSchema, listQuerySchema, reportQuerySchema } from "@hub/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { requireAdmin, currentUser } from "../auth";
import { HttpError } from "../errors";
import { csvCell, detectMapping, missingRequired, parseCsv, toConversions, type ConversionRow } from "../shopee-csv";
import { CANCELLED, STALE_ACCOUNT_DAYS } from "./dashboard";

const BODY_LIMIT = 16 * 1024 * 1024;
const CHUNK = 500;
const MAX_REPORTED_ERRORS = 50;

interface PerformanceRow {
  period: string;
  pageId: string | null;
  pageName: string | null;
  subId: string | null;
  orders: number;
  cancelledOrders: number;
  amount: string;
  commission: string;
}

function range(request: FastifyRequest) {
  const { from, to, granularity } = reportQuerySchema.parse(request.query);
  const start = new Date(`${from}T00:00:00+07:00`);
  const toDate = new Date(`${to}T00:00:00+07:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(toDate.getTime()) || start > toDate) {
    throw new HttpError(400, "validation_error", "ช่วงวันที่ไม่ถูกต้อง");
  }
  return { start, end: new Date(toDate.getTime() + 24 * 60 * 60 * 1000), granularity };
}

const performance = (db: PrismaClient, start: Date, end: Date, granularity: string) =>
  db.$queryRaw<PerformanceRow[]>`
    SELECT
      to_char(date_trunc(${granularity}, c.ordered_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Bangkok'), 'YYYY-MM-DD') AS period,
      p.id::text AS "pageId",
      p.name AS "pageName",
      c.sub_id AS "subId",
      (COUNT(DISTINCT c.order_id) FILTER (WHERE c.status !~* ${CANCELLED}))::int AS orders,
      (COUNT(DISTINCT c.order_id) FILTER (WHERE c.status ~* ${CANCELLED}))::int AS "cancelledOrders",
      COALESCE(SUM(c.amount) FILTER (WHERE c.status !~* ${CANCELLED}), 0)::text AS amount,
      COALESCE(SUM(c.commission) FILTER (WHERE c.status !~* ${CANCELLED}), 0)::text AS commission
    FROM shopee_conversions c
    LEFT JOIN pages p ON p.sub_id = c.sub_id
    WHERE c.ordered_at >= (${start}::timestamptz AT TIME ZONE 'UTC') AND c.ordered_at < (${end}::timestamptz AT TIME ZONE 'UTC')
    GROUP BY 1, p.id, p.name, c.sub_id
    ORDER BY 1 DESC, p.name NULLS LAST, c.sub_id NULLS LAST
  `;

const sameRow = (existing: { subId: string | null; orderedAt: Date; status: string; amount: Prisma.Decimal; commission: Prisma.Decimal }, row: ConversionRow) =>
  existing.subId === row.subId &&
  existing.orderedAt.getTime() === row.orderedAt.getTime() &&
  existing.status === row.status &&
  existing.amount.equals(new Prisma.Decimal(row.amount.toFixed(2))) &&
  existing.commission.equals(new Prisma.Decimal(row.commission.toFixed(2)));

export function registerReportRoutes(app: FastifyInstance, db: PrismaClient): void {
  app.post("/api/reports/shopee/preview", { bodyLimit: BODY_LIMIT }, async (request) => {
    const { csv } = csvPreviewSchema.parse(request.body);
    const parsed = safeParse(csv);
    return { headers: parsed.headers, rowCount: parsed.rows.length, mapping: detectMapping(parsed.headers), sample: parsed.rows.slice(0, 5) };
  });

  app.post("/api/reports/shopee/import", { bodyLimit: BODY_LIMIT }, async (request) => {
    requireAdmin(request);
    const { csv, fileName, mapping } = csvImportSchema.parse(request.body);
    const parsed = safeParse(csv);
    const missing = missingRequired(mapping, parsed.headers);
    if (missing.length > 0) throw new HttpError(400, "missing_columns", `ยังไม่ได้เลือกคอลัมน์: ${missing.join(", ")}`);

    const { conversions, errors, duplicates } = toConversions(parsed.rows, mapping);
    const actor = currentUser(request);
    const counts = await db.$transaction(
      async (tx) => {
        let inserted = 0;
        let updated = 0;
        let unchanged = 0;
        for (let start = 0; start < conversions.length; start += CHUNK) {
          const chunk = conversions.slice(start, start + CHUNK);
          const existing = await tx.shopeeConversion.findMany({
            where: { orderId: { in: chunk.map((row) => row.orderId) } },
          });
          const byKey = new Map(existing.map((row) => [`${row.orderId}\u0000${row.itemKey}`, row]));
          const fresh: ConversionRow[] = [];
          for (const row of chunk) {
            const current = byKey.get(`${row.orderId}\u0000${row.itemKey}`);
            if (!current) fresh.push(row);
            else if (sameRow(current, row)) unchanged += 1;
            else {
              await tx.shopeeConversion.update({
                where: { orderId_itemKey: { orderId: row.orderId, itemKey: row.itemKey } },
                data: { subId: row.subId, orderedAt: row.orderedAt, status: row.status, amount: row.amount, commission: row.commission },
              });
              updated += 1;
            }
          }
          if (fresh.length > 0) await tx.shopeeConversion.createMany({ data: fresh });
          inserted += fresh.length;
        }
        await tx.shopeeImport.create({
          data: {
            fileName,
            rowCount: parsed.rows.length,
            insertedCount: inserted,
            updatedCount: updated,
            unchangedCount: unchanged,
            invalidCount: errors.length,
            duplicateCount: duplicates,
            importedById: actor.id,
          },
        });
        return { inserted, updated, unchanged };
      },
      { timeout: 120_000 },
    );
    return {
      ...counts,
      rowCount: parsed.rows.length,
      invalid: errors.length,
      duplicates,
      errors: errors.slice(0, MAX_REPORTED_ERRORS),
    };
  });

  app.get("/api/reports/shopee/imports", async (request) => {
    const { page, pageSize } = listQuerySchema.parse(request.query);
    const [items, total] = await Promise.all([
      db.shopeeImport.findMany({
        include: { importedBy: { select: { email: true, name: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.shopeeImport.count(),
    ]);
    return { items, total, page, pageSize };
  });

  app.get("/api/reports/performance", async (request) => {
    const { start, end, granularity } = range(request);
    const rows = await performance(db, start, end, granularity);
    const [totals] = await db.$queryRaw<Array<{ orders: number; amount: string; commission: string; unmatchedCommission: string }>>`
      SELECT
        (COUNT(DISTINCT c.order_id) FILTER (WHERE c.status !~* ${CANCELLED}))::int AS orders,
        COALESCE(SUM(c.amount) FILTER (WHERE c.status !~* ${CANCELLED}), 0)::text AS amount,
        COALESCE(SUM(c.commission) FILTER (WHERE c.status !~* ${CANCELLED}), 0)::text AS commission,
        COALESCE(SUM(c.commission) FILTER (WHERE c.status !~* ${CANCELLED} AND p.id IS NULL), 0)::text AS "unmatchedCommission"
      FROM shopee_conversions c
      LEFT JOIN pages p ON p.sub_id = c.sub_id
      WHERE c.ordered_at >= (${start}::timestamptz AT TIME ZONE 'UTC') AND c.ordered_at < (${end}::timestamptz AT TIME ZONE 'UTC')
    `;
    return { rows, totals };
  });

  app.get("/api/reports/performance.csv", async (request, reply) => {
    const { start, end, granularity } = range(request);
    const rows = await performance(db, start, end, granularity);
    const header = ["ช่วงเวลา", "Page", "Sub ID", "คำสั่งซื้อ", "คำสั่งซื้อที่ยกเลิก", "ยอดสั่งซื้อ", "ค่าคอมมิชชัน"];
    const lines = rows.map((row) =>
      [row.period, row.pageName ?? "จับคู่ไม่ได้", row.subId, row.orders, row.cancelledOrders, Number(row.amount), Number(row.commission)]
        .map(csvCell)
        .join(","),
    );
    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", 'attachment; filename="hub-report.csv"')
      .send(`\uFEFF${[header.map(csvCell).join(","), ...lines].join("\r\n")}\r\n`);
  });

  app.get("/api/reports/metrics", async (request) => {
    const { start, end } = range(request);
    return db.$queryRaw<Array<{ pageId: string; pageName: string; metric: string; total: number; latest: number; latestDate: string }>>`
      SELECT
        p.id::text AS "pageId",
        p.name AS "pageName",
        m.metric,
        SUM(m.value)::float8 AS total,
        (ARRAY_AGG(m.value ORDER BY m.date DESC))[1]::float8 AS latest,
        to_char(MAX(m.date), 'YYYY-MM-DD') AS "latestDate"
      FROM metrics_daily m
      JOIN pages p ON p.id = m.page_id
      WHERE m.date >= (${start}::timestamptz AT TIME ZONE 'Asia/Bangkok')::date
        AND m.date < (${end}::timestamptz AT TIME ZONE 'Asia/Bangkok')::date
      GROUP BY p.id, p.name, m.metric
      ORDER BY p.name, m.metric
    `;
  });

  app.get("/api/reports/overdue", async () => {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - STALE_ACCOUNT_DAYS * 24 * 60 * 60 * 1000);
    const [tasks, accounts] = await Promise.all([
      db.onboardingTask.findMany({
        where: { status: "todo", dueAt: { lt: now } },
        include: { owner: { select: { name: true } } },
        orderBy: { dueAt: "asc" },
        take: 100,
      }),
      db.platformAccount.findMany({
        where: { status: { in: ["in_progress", "pending_review"] }, statusChangedAt: { lt: staleBefore } },
        include: { owner: { select: { name: true } } },
        orderBy: { statusChangedAt: "asc" },
        take: 100,
      }),
    ]);
    return { tasks, accounts };
  });
}

function safeParse(csv: string) {
  try {
    const parsed = parseCsv(csv);
    if (parsed.headers.length === 0) throw new Error("empty");
    return parsed;
  } catch {
    throw new HttpError(400, "invalid_csv", "อ่านไฟล์ CSV ไม่ได้");
  }
}
