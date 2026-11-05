import type { PrismaClient } from "@hub/db";
import {
  ACCOUNT_STATUSES,
  MAILBOX_STATUSES,
  PAGE_STATUSES,
  PLATFORMS,
  type DashboardSummary,
} from "@hub/shared";
import type { FastifyInstance } from "fastify";

const zeroed = <T extends string>(keys: readonly T[]) =>
  Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;

export function registerDashboardRoutes(app: FastifyInstance, db: PrismaClient): void {
  app.get("/api/dashboard/summary", async (): Promise<DashboardSummary> => {
    const [owners, mailboxes, platformAccounts, pages, accountGroups, mailboxGroups, pageGroups, without2fa, attention] =
      await Promise.all([
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
