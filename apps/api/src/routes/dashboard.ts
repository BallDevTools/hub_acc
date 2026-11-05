import type { PrismaClient } from "@hub/db";
import {
  ACCOUNT_STATUSES,
  MAILBOX_STATUSES,
  PAGE_STATUSES,
  PLATFORMS,
  type DashboardSummary,
} from "@hub/shared";
import type { FastifyInstance } from "fastify";

export const STALE_ACCOUNT_DAYS = 14;

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
}
