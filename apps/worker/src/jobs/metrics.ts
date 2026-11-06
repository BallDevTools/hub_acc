import type { PrismaClient } from "@hub/db";
import { decryptToken, MetaApiError, type MetaClient } from "@hub/integrations";
import { notify } from "../notify";

export interface MetricsDeps {
  meta: MetaClient;
  tokenKey: string | null;
  metrics: string[];
  now?: () => Date;
}

const LOOKBACK_DAYS = 3;

export async function runCollectMetrics(db: PrismaClient, deps: MetricsDeps): Promise<void> {
  if (!deps.tokenKey) return;
  const until = deps.now?.() ?? new Date();
  const since = new Date(until.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const pages = await db.page.findMany({
    where: { metaPageId: { not: null }, connection: { status: "active" } },
    include: { connection: true },
  });

  for (const page of pages) {
    const token = decryptToken(page.connection!.accessTokenEnc, deps.tokenKey);
    for (const metric of deps.metrics) {
      try {
        const values = await deps.meta.pageMetric(page.metaPageId!, token, metric, since, until);
        for (const { date, value } of values) {
          const key = { pageId: page.id, date: new Date(`${date}T00:00:00Z`), metric };
          await db.metricDaily.upsert({ where: { pageId_date_metric: key }, create: { ...key, value }, update: { value } });
        }
      } catch (error) {
        console.error(`[worker] metric ${metric} failed for ${page.id}`, error instanceof Error ? error.message : error);
        if (error instanceof MetaApiError && error.kind === "auth") {
          await db.oAuthConnection.update({
            where: { id: page.connection!.id },
            data: { status: "needs_reauth", lastError: "ต้องเชื่อม Facebook Page ใหม่" },
          });
          await notify(db, {
            severity: "warning",
            title: `ต้องเชื่อม Facebook Page ใหม่: ${page.name}`,
            link: "/connections",
            dedupeKey: `meta-reauth:${page.connection!.id}:${until.toISOString().slice(0, 10)}`,
          });
          break;
        }
        // เมตริกหนึ่งถูกยกเลิกต้องไม่ทำให้เมตริกอื่นหยุด
        await notify(db, {
          severity: "warning",
          title: `ดึงเมตริก ${metric} ไม่สำเร็จ`,
          body: "Meta อาจเปลี่ยนชื่อเมตริก ตรวจค่า META_INSIGHT_METRICS",
          link: "/connections",
          dedupeKey: `metric-failed:${metric}:${until.toISOString().slice(0, 10)}`,
        });
      }
    }
  }
}
