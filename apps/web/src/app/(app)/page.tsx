"use client";

import { ACCOUNT_STATUSES, PLATFORMS, type DashboardSummary } from "@hub/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/status-badge";
import { api } from "@/lib/api";
import { formatDate, PLATFORM_LABELS, STATUS } from "@/lib/labels";

function Tile({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="rounded-lg border border-line bg-surface-1 p-4 hover:border-line-strong">
      <p className="text-sm text-ink-2">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value.toLocaleString("th-TH")}</p>
    </Link>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-surface-1">
      <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function StatusList({ group, counts, href }: { group: string; counts: Record<string, number>; href: string }) {
  return (
    <ul>
      {Object.keys(STATUS[group]!).map((status) => (
        <li key={status} className="border-b border-line last:border-0">
          <Link
            href={`${href}?status=${status}`}
            className="flex items-center justify-between px-4 py-2 hover:bg-surface-2"
          >
            <StatusBadge group={group} value={status} />
            <span className="text-sm font-medium tabular-nums">{counts[status] ?? 0}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ActionList({ actions }: { actions: DashboardSummary["actions"] }) {
  const items = [
    { count: actions.connectionsNeedingReauth, label: "การเชื่อมต่อที่ต้องเชื่อมใหม่", href: "/connections" },
    { count: actions.postsNeedingAttention, label: "โพสต์ที่ล้มเหลวหรือต้องตรวจ", href: "/schedule" },
    { count: actions.inboxNeedsReview, label: "อีเมลรอตรวจ", href: "/inbox" },
    { count: actions.overdueTasks, label: "งาน Checklist ที่เกินกำหนด", href: "/onboarding" },
    { count: actions.staleAccounts, label: "บัญชีที่ค้างเกิน 14 วัน", href: "/accounts?status=pending_review" },
  ].filter((item) => item.count > 0);
  if (items.length === 0) return null;
  return (
    <Panel title="สิ่งที่ต้องจัดการ">
      <ul>
        {items.map((item) => (
          <li key={item.href} className="border-b border-line last:border-0">
            <Link href={item.href} className="flex items-center justify-between px-4 py-2 text-sm hover:bg-surface-2">
              <span>
                <span aria-hidden className="mr-2 font-bold text-serious">!</span>
                {item.label}
              </span>
              <span className="font-medium tabular-nums">{item.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export default function DashboardPage() {
  const query = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<DashboardSummary>("/api/dashboard/summary"),
    refetchInterval: 60_000,
  });

  if (query.isPending) return <p className="text-sm text-ink-2">กำลังโหลด…</p>;
  if (query.isError) {
    return (
      <div className="text-sm">
        <p className="text-critical-ink">{query.error.message}</p>
        <button className="btn mt-3" onClick={() => query.refetch()}>
          ลองอีกครั้ง
        </button>
      </div>
    );
  }
  const data = query.data;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">ภาพรวม</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="เจ้าของบัญชี" value={data.totals.owners} href="/owners" />
        <Tile label="เมล" value={data.totals.mailboxes} href="/mailboxes" />
        <Tile label="บัญชีแพลตฟอร์ม" value={data.totals.platformAccounts} href="/accounts" />
        <Tile label="Page" value={data.totals.pages} href="/pages" />
      </div>

      {data.totals.owners === 0 ? (
        <div className="rounded-lg border border-line bg-surface-1 p-5 text-sm">
          <p className="font-medium">ยังไม่มีข้อมูล</p>
          <p className="mt-1 text-ink-2">เริ่มจากเพิ่มเจ้าของบัญชี แล้วเพิ่มเมล บัญชีแพลตฟอร์ม และ Page ตามลำดับ</p>
          <Link href="/owners" className="btn btn-primary mt-3">
            ไปหน้าเจ้าของบัญชี
          </Link>
        </div>
      ) : null}

      <ActionList actions={data.actions} />

      {data.mailboxesWithout2fa > 0 ? (
        <p role="status" className="rounded-lg border border-line bg-surface-1 px-4 py-3 text-sm">
          <span aria-hidden className="mr-2 font-bold text-serious">
            !
          </span>
          มีเมล {data.mailboxesWithout2fa} บัญชีที่ยังไม่เปิด 2FA{" "}
          <Link href="/mailboxes" className="underline">
            ดูรายการเมล
          </Link>
        </p>
      ) : null}

      <Panel title="บัญชีแพลตฟอร์มตามสถานะ">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs text-ink-2">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  สถานะ
                </th>
                {PLATFORMS.map((platform) => (
                  <th key={platform} scope="col" className="px-4 py-2 text-right font-medium whitespace-nowrap">
                    {PLATFORM_LABELS[platform]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ACCOUNT_STATUSES.map((status) => (
                <tr key={status} className="border-b border-line last:border-0">
                  <th scope="row" className="px-4 py-2 font-normal">
                    <StatusBadge group="account" value={status} />
                  </th>
                  {PLATFORMS.map((platform) => (
                    <td key={platform} className="px-4 py-2 text-right font-medium tabular-nums">
                      <Link
                        href={`/accounts?platform=${platform}&status=${status}`}
                        aria-label={`${PLATFORM_LABELS[platform]} ${STATUS.account![status]!.label}`}
                        className="hover:underline"
                      >
                        {data.accountsByStatus[platform][status]}
                      </Link>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-6 md:grid-cols-2">
        <Panel title="เมลตามสถานะ">
          <StatusList group="mailbox" counts={data.mailboxesByStatus} href="/mailboxes" />
        </Panel>
        <Panel title="Page ตามสถานะ">
          <StatusList group="page" counts={data.pagesByStatus} href="/pages" />
        </Panel>
      </div>

      <Panel title="บัญชีที่ถูกปฏิเสธหรือระงับ">
        {data.attention.length === 0 ? (
          <p className="px-4 py-4 text-sm text-ink-2">ไม่มีบัญชีที่ถูกปฏิเสธหรือระงับ</p>
        ) : (
          <ul>
            {data.attention.map((account) => (
              <li key={account.id} className="border-b border-line px-4 py-3 last:border-0">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <p className="text-sm font-medium">
                    {account.displayName}
                    <span className="font-normal text-ink-2">
                      {" "}
                      · {PLATFORM_LABELS[account.platform]} · {account.ownerName}
                    </span>
                  </p>
                  <StatusBadge group="account" value={account.status} />
                </div>
                <p className="mt-0.5 text-xs text-ink-2">
                  {account.statusReason ?? "ยังไม่ระบุเหตุผล"} · {formatDate(account.statusChangedAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
