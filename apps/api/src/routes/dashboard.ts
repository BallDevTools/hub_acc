import { Prisma, type PrismaClient } from "@hub/db";
import {
  ACCOUNT_STATUSES,
  dashboardEarningsQuerySchema,
  MAILBOX_STATUSES,
  PAGE_STATUSES,
  PLATFORMS,
  type DashboardEarnings,
  type DashboardSummary,
} from "@hub/shared";
import type { FastifyInstance } from "fastify";

export const STALE_ACCOUNT_DAYS = 14;
export const CANCELLED = "cancel|ยกเลิก";

const DAY_MS = 24 * 60 * 60 * 1000;
const UPCOMING_POSTS = 4;
const TOP_PAGES = 4;

const bangkokDay = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

const zeroed = <T extends string>(keys: readonly T[]) =>
  Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;

export function registerDashboardRoutes(app: FastifyInstance, db: PrismaClient): void {
  app.get("/api/dashboard/summary", async (): Promise<DashboardSummary> => {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - STALE_ACCOUNT_DAYS * 24 * 60 * 60 * 1000);
    const [
      owners,
      mailboxes,
      platformAccounts,
      pages,
      accountGroups,
      mailboxGroups,
      pageGroups,
      without2fa,
      attention,
      overdueTasks,
      staleAccounts,
      inboxNeedsReview,
      postsNeedingAttention,
      connectionsNeedingReauth,
      ownersAddedThisMonth,
      pagesConnected,
      unreadNotifications,
      upcomingPosts,
    ] = await Promise.all([
        db.owner.count(),
        db.mailbox.count(),
        db.platformAccount.count(),
        db.page.count(),
        db.platformAccount.groupBy({ by: ["platform", "status"], _count: { _all: true } }),
        db.mailbox.groupBy({ by: ["status"], _count: { _all: true } }),
        db.page.groupBy({ by: ["status"], _count: { _all: true } }),
        db.mailbox.count({ where: { twoFactorEnabled: false, status: { not: "disabled" } } }),
        db.platformAccount.findMany({
          where: { status: { in: ["rejected", "suspended"] } },
          include: { owner: { select: { name: true } } },
          orderBy: { statusChangedAt: "desc" },
          take: 10,
        }),
        db.onboardingTask.count({ where: { status: "todo", dueAt: { lt: now } } }),
        db.platformAccount.count({
          where: { status: { in: ["in_progress", "pending_review"] }, statusChangedAt: { lt: staleBefore } },
        }),
        db.emailEvent.count({ where: { outcome: "needs_review" } }),
        db.postJob.count({ where: { status: { in: ["failed", "unknown"] } } }),
        db.oAuthConnection.count({ where: { status: "needs_reauth" } }),
        db.owner.count({ where: { createdAt: { gte: new Date(`${bangkokDay(now).slice(0, 7)}-01T00:00:00+07:00`) } } }),
        db.page.count({ where: { metaPageId: { not: null } } }),
        db.notification.count({ where: { readAt: null } }),
        db.postJob.findMany({
          where: { status: "scheduled", scheduledAt: { gte: now } },
          include: { contentItem: { select: { title: true } }, page: { select: { name: true } } },
          orderBy: { scheduledAt: "asc" },
          take: UPCOMING_POSTS,
        }),
      ]);

    const accountsByStatus = Object.fromEntries(
      PLATFORMS.map((platform) => [platform, zeroed(ACCOUNT_STATUSES)]),
    ) as DashboardSummary["accountsByStatus"];
    for (const group of accountGroups) accountsByStatus[group.platform][group.status] = group._count._all;

    const mailboxesByStatus = zeroed(MAILBOX_STATUSES);
    for (const group of mailboxGroups) mailboxesByStatus[group.status] = group._count._all;

    const pagesByStatus = zeroed(PAGE_STATUSES);
    for (const group of pageGroups) pagesByStatus[group.status] = group._count._all;

    return {
      totals: { owners, mailboxes, platformAccounts, pages },
      accountsByStatus,
      mailboxesByStatus,
      pagesByStatus,
      mailboxesWithout2fa: without2fa,
      ownersAddedThisMonth,
      pagesConnected,
      unreadNotifications,
      upcomingPosts: upcomingPosts.map((job) => ({
        id: job.id,
        scheduledAt: job.scheduledAt.toISOString(),
        title: job.contentItem.title,
        pageName: job.page.name,
      })),
      actions: { overdueTasks, staleAccounts, inboxNeedsReview, postsNeedingAttention, connectionsNeedingReauth },
      attention: attention.map((account) => ({
        id: account.id,
        displayName: account.displayName,
        platform: account.platform,
        status: account.status,
        statusReason: account.statusReason,
        statusChangedAt: account.statusChangedAt.toISOString(),
        ownerName: account.owner.name,
      })),
    };
  });

  app.get("/api/dashboard/earnings", async (request): Promise<DashboardEarnings> => {
    const { days } = dashboardEarningsQuerySchema.parse(request.query);
    const today = new Date(`${bangkokDay(new Date())}T00:00:00+07:00`);
    const start = new Date(today.getTime() - (days - 1) * DAY_MS);
    const previousStart = new Date(start.getTime() - days * DAY_MS);
    const end = new Date(today.getTime() + DAY_MS);

    const rows = await db.$queryRaw<Array<{ day: string; pageId: string | null; pageName: string | null; commission: string }>>`
      SELECT
        to_char(c.ordered_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') AS day,
        p.id::text AS "pageId",
        p.name AS "pageName",
        COALESCE(SUM(c.commission) FILTER (WHERE c.status !~* ${CANCELLED}), 0)::text AS commission
      FROM shopee_conversions c
      LEFT JOIN pages p ON p.sub_id = c.sub_id
      WHERE c.ordered_at >= (${previousStart}::timestamptz AT TIME ZONE 'UTC') AND c.ordered_at < (${end}::timestamptz AT TIME ZONE 'UTC')
      GROUP BY 1, p.id, p.name
    `;

    const firstDay = bangkokDay(start);
    const zero = new Prisma.Decimal(0);
    const byDay = new Map<string, Prisma.Decimal>();
    const byPage = new Map<string, { pageName: string; commission: Prisma.Decimal }>();
    let total = zero;
    let previousTotal = zero;
    let unmatched = zero;
    for (const row of rows) {
      const commission = new Prisma.Decimal(row.commission);
      if (row.day < firstDay) {
        previousTotal = previousTotal.plus(commission);
        continue;
      }
      total = total.plus(commission);
      byDay.set(row.day, (byDay.get(row.day) ?? zero).plus(commission));
      if (row.pageId && row.pageName) {
        const current = byPage.get(row.pageId)?.commission ?? zero;
        byPage.set(row.pageId, { pageName: row.pageName, commission: current.plus(commission) });
      } else {
        unmatched = unmatched.plus(commission);
      }
    }

    return {
      days,
      series: Array.from({ length: days }, (_, index) => {
        const date = bangkokDay(new Date(start.getTime() + index * DAY_MS));
        return { date, commission: (byDay.get(date) ?? zero).toFixed(2) };
      }),
      total: total.toFixed(2),
      previousTotal: previousTotal.toFixed(2),
      unmatched: unmatched.toFixed(2),
      topPages: [...byPage.entries()]
        .filter(([, page]) => page.commission.greaterThan(0))
        .sort(([, a], [, b]) => b.commission.comparedTo(a.commission))
        .slice(0, TOP_PAGES)
        .map(([pageId, page]) => ({ pageId, pageName: page.pageName, commission: page.commission.toFixed(2) })),
    };
  });
}
