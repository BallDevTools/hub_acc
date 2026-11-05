"use client";

import { ACCOUNT_STATUSES, PLATFORMS, type DashboardEarnings, type DashboardSummary } from "@hub/shared";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Inbox,
  KeyRound,
  Link2Off,
  Plus,
  ShieldAlert,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { dashboardQuery } from "@/lib/dashboard";
import { formatDate, PLATFORM_LABELS, STATUS, type Tone } from "@/lib/labels";

const baht = (value: string | number) =>
  `฿${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () =>
  new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "full" }).format(new Date());
const shortDay = (date: string) =>
  new Intl.DateTimeFormat("th-TH", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(`${date}T00:00:00Z`));
const postTime = (iso: string) =>
  new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const postDay = (iso: string) =>
  new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short" }).format(new Date(iso));

const TODO_TONES: Partial<Record<Tone, string>> = {
  critical: "bg-critical-soft text-critical-ink",
  serious: "bg-serious-soft text-serious-ink",
  warning: "bg-warning-soft text-warning-ink",
};

function todos(data: DashboardSummary) {
  const { actions } = data;
  const items: Array<{ count: number; tone: Tone; icon: LucideIcon; title: string; detail: string; action: string; href: string }> = [
    { count: actions.connectionsNeedingReauth, tone: "critical", icon: Link2Off, title: `การเชื่อมต่อที่ต้องเชื่อมใหม่ ${actions.connectionsNeedingReauth} รายการ`, detail: "โพสต์และดึงข้อมูลไม่ได้จนกว่าจะเชื่อมใหม่", action: "เชื่อมใหม่", href: "/connections" },
    { count: actions.postsNeedingAttention, tone: "critical", icon: AlertTriangle, title: `โพสต์ที่ล้มเหลวหรือต้องตรวจ ${actions.postsNeedingAttention} รายการ`, detail: "ดูสาเหตุก่อนลองใหม่ เพื่อไม่ให้โพสต์ซ้ำ", action: "ดูคิวโพสต์", href: "/schedule" },
    { count: actions.inboxNeedsReview, tone: "warning", icon: Inbox, title: `อีเมลรอตรวจ ${actions.inboxNeedsReview} ฉบับ`, detail: "ระบบไม่มั่นใจผลการสมัคร", action: "ตรวจอีเมล", href: "/inbox" },
    { count: actions.overdueTasks, tone: "warning", icon: Clock3, title: `งาน Checklist ที่เกินกำหนด ${actions.overdueTasks} งาน`, detail: "งานสมัครที่เลยกำหนดส่งแล้ว", action: "ดูงาน", href: "/onboarding" },
    { count: actions.staleAccounts, tone: "warning", icon: ShieldAlert, title: `บัญชีที่ค้างเกิน 14 วัน ${actions.staleAccounts} บัญชี`, detail: "สถานะไม่เปลี่ยนมานานแล้ว", action: "ดูบัญชี", href: "/accounts?status=pending_review" },
    { count: data.mailboxesWithout2fa, tone: "serious", icon: KeyRound, title: `เมลที่ยังไม่เปิด 2FA ${data.mailboxesWithout2fa} บัญชี`, detail: "ควรเปิดเพื่อความปลอดภัยของบัญชี", action: "ดูเมล", href: "/mailboxes" },
  ];
  return items.filter((item) => item.count > 0);
}

function EarningsCard({ data, days, onDays }: { data: DashboardEarnings | undefined; days: number; onDays: (days: number) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const values = data?.series.map((point) => Number(point.commission)) ?? [];
  const peak = Math.max(0, ...values);
  const average = data ? Number(data.total) / data.days : 0;
  const previous = Number(data?.previousTotal ?? 0);
  const change = previous > 0 ? ((Number(data?.total ?? 0) - previous) / previous) * 100 : null;
  const point = hover === null ? null : data?.series[hover];

  return (
    <section aria-labelledby="earn-title" className="card col-span-12 flex min-h-[410px] flex-col gap-2 bg-hero px-6 pt-6 pb-5 text-hero-ink xl:col-span-7">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 id="earn-title" className="text-sm font-medium text-hero-ink-2">ค่าคอมมิชชัน</h2>
        <div role="group" aria-label="ช่วงเวลา" className="segmented segmented-hero">
          {[7, 30].map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={days === value}
              onClick={() => {
                setHover(null);
                onDays(value);
              }}
            >
              {value} วัน
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[clamp(38px,5vw,60px)] leading-[1.05] font-semibold tracking-tight tabular-nums">
          {data ? baht(data.total) : "—"}
        </p>
        {change !== null ? (
          <span className={`rounded-full px-2.5 py-1 text-[13px] font-semibold tabular-nums ${change >= 0 ? "bg-lime text-lime-ink" : "bg-hero-line text-hero-ink"}`}>
            {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}%
          </span>
        ) : null}
      </div>
      <p className="min-h-5 text-[13px] text-hero-ink-2">
        {point
          ? `${shortDay(point.date)} · ${baht(point.commission)}`
          : `เฉลี่ย ${baht(average)} ต่อวัน · ไม่รวมคำสั่งซื้อที่ยกเลิก${change !== null ? " · เทียบกับช่วงก่อนหน้า" : ""}`}
      </p>
      {data && peak === 0 ? (
        <div className="mt-2 flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-hero-line p-6 text-center">
          <p className="text-sm text-hero-ink-2">ยังไม่มียอดในช่วงนี้ นำเข้าไฟล์ CSV จาก Shopee Affiliate เพื่อดูกราฟ</p>
          <Link href="/reports" className="btn btn-sm bg-lime text-lime-ink hover:bg-lime!">ไปหน้านำเข้ายอด</Link>
        </div>
      ) : (
        <div className="mt-2 flex min-h-[180px] flex-1 flex-col">
          <div className="flex min-h-40 flex-1" style={{ gap: days === 7 ? 12 : 4 }} onMouseLeave={() => setHover(null)}>
            {data?.series.map((day, index) => (
              <button
                key={day.date}
                type="button"
                aria-label={`${shortDay(day.date)} ค่าคอมมิชชัน ${baht(day.commission)}`}
                className="flex h-full min-w-0 flex-1 cursor-pointer items-end"
                onMouseEnter={() => setHover(index)}
                onFocus={() => setHover(index)}
                onBlur={() => setHover(null)}
              >
                <span
                  className="mx-auto block w-full max-w-[52px] rounded-full bg-lime transition-opacity duration-100"
                  style={{
                    height: `${peak > 0 ? (values[index]! / peak) * 100 : 0}%`,
                    minHeight: 4,
                    opacity: hover === null ? (index === values.length - 1 ? 1 : 0.5) : hover === index ? 1 : 0.28,
                  }}
                />
              </button>
            ))}
          </div>
          {data ? (
            <div className="flex justify-between gap-2 pt-2.5 text-xs text-hero-ink-2">
              <span>{shortDay(data.series[0]!.date)}</span>
              <span className="tabular-nums">สูงสุด {baht(peak)} ต่อวัน</span>
              <span>{shortDay(data.series.at(-1)!.date)}</span>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function TodoCard({ data }: { data: DashboardSummary }) {
  const items = todos(data);
  const total = items.reduce((sum, item) => sum + item.count, 0);
  return (
    <section aria-labelledby="todo-title" className="card col-span-12 flex flex-col px-3 pt-5 pb-3 xl:col-span-5">
      <div className="flex items-center justify-between gap-3 px-3 pb-3">
        <h2 id="todo-title" className="text-lg font-semibold">ต้องจัดการวันนี้</h2>
        {total > 0 ? (
          <span className="min-w-7 rounded-full bg-primary px-2.5 py-0.5 text-center text-[13px] font-semibold text-primary-ink tabular-nums">{total}</span>
        ) : null}
      </div>
      {data.totals.owners === 0 ? (
        <EmptyState
          icon={Users}
          title="ยังไม่มีข้อมูล"
          hint="เริ่มจากเพิ่มเจ้าของบัญชี แล้วเพิ่มเมล บัญชีแพลตฟอร์ม และ Page ตามลำดับ"
          action={<Link href="/owners?new=1" className="btn btn-primary">เพิ่มเจ้าของบัญชี</Link>}
        />
      ) : items.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="ไม่มีงานค้าง" hint="ถ้ามีเรื่องที่ต้องจัดการ จะแสดงที่นี่ทันที" />
      ) : (
        <ul className="flex flex-col gap-0.5">
          {items.map((item) => (
            <li key={item.href} className="row flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-surface-2">
              <span aria-hidden className={`flex size-10 flex-none items-center justify-center rounded-full ${TODO_TONES[item.tone]}`}>
                <item.icon size={17} strokeWidth={2.2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{item.title}</span>
                <span className="block text-xs text-ink-3">{item.detail}</span>
              </span>
              <Link href={item.href} className="btn btn-sm row-action flex-none">{item.action}</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Tile({ label, value, note, href }: { label: string; value: number; note: string; href: string }) {
  return (
    <Link href={href} className="card col-span-6 block px-5 py-[18px] transition-transform duration-150 hover:-translate-y-0.5 xl:col-span-3">
      <span className="block text-[13px] text-ink-2">{label}</span>
      <span className="mt-1 block text-[38px] leading-[1.1] font-semibold tracking-tight tabular-nums">{value.toLocaleString("th-TH")}</span>
      <span className="mt-1.5 block text-xs text-ink-3">{note}</span>
    </Link>
  );
}

const SEGMENTS: Array<{ tone: Tone; className: string; label: string }> = [
  { tone: "good", className: "bg-good", label: "อนุมัติแล้ว" },
  { tone: "warning", className: "bg-warning", label: "กำลังดำเนินการ" },
  { tone: "critical", className: "bg-critical", label: "ปฏิเสธหรือระงับ" },
  { tone: "neutral", className: "bg-neutral-mark", label: "ยังไม่เริ่ม" },
];

function StatusCard({ data }: { data: DashboardSummary }) {
  const countsByStatus = ACCOUNT_STATUSES.map((status) => ({
    status,
    count: PLATFORMS.reduce((sum, platform) => sum + data.accountsByStatus[platform][status], 0),
  }));
  return (
    <section aria-labelledby="status-title" className="card col-span-12 flex flex-col gap-4 px-6 py-5.5 lg:col-span-4">
      <h2 id="status-title" className="text-base font-semibold">สถานะบัญชี</h2>
      {PLATFORMS.map((platform) => {
        const counts = data.accountsByStatus[platform];
        const total = ACCOUNT_STATUSES.reduce((sum, status) => sum + counts[status], 0);
        const segments = SEGMENTS.map((segment) => ({
          ...segment,
          count: ACCOUNT_STATUSES.filter((status) => STATUS.account![status]!.tone === segment.tone).reduce((sum, status) => sum + counts[status], 0),
        })).filter((segment) => segment.count > 0);
        return (
          <div key={platform}>
            <div className="mb-1.5 flex justify-between gap-2 text-[13px]">
              <Link href={`/accounts?platform=${platform}`} className="font-medium hover:underline">{PLATFORM_LABELS[platform]}</Link>
              <span className="text-ink-3 tabular-nums">{total} บัญชี</span>
            </div>
            <div
              role="img"
              aria-label={`${PLATFORM_LABELS[platform]} ${segments.map((segment) => `${segment.label} ${segment.count}`).join(" ") || "ยังไม่มีบัญชี"}`}
              className="flex h-3.5 gap-[3px] overflow-hidden rounded-full bg-surface-2"
            >
              {segments.map((segment) => (
                <span key={segment.tone} className={`rounded-full ${segment.className}`} style={{ flex: `${segment.count} 1 0` }} />
              ))}
            </div>
          </div>
        );
      })}
      <ul className="mt-auto grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
        {countsByStatus.map(({ status, count }) => (
          <li key={status}>
            <Link href={`/accounts?status=${status}`} className="flex min-h-8 items-center justify-between gap-2 rounded-lg px-1 hover:bg-surface-2">
              <StatusBadge group="account" value={status} />
              <span className="text-sm font-semibold tabular-nums">{count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function UpcomingCard({ posts }: { posts: DashboardSummary["upcomingPosts"] }) {
  return (
    <section aria-labelledby="next-title" className="card col-span-12 flex flex-col px-6 pt-5.5 pb-3 lg:col-span-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id="next-title" className="text-base font-semibold">โพสต์ถัดไป</h2>
        <Link href="/schedule" className="text-[13px] font-medium text-accent hover:underline">ดูคิวโพสต์</Link>
      </div>
      {posts.length === 0 ? (
        <EmptyState icon={CalendarDays} title="ยังไม่มีโพสต์ที่ตั้งเวลาไว้" action={<Link href="/content" className="btn btn-sm">ไปหน้าคอนเทนต์</Link>} />
      ) : (
        <ol>
          {posts.map((post) => (
            <li key={post.id} className="flex items-center gap-3 py-2">
              <span className="flex-none rounded-[10px] bg-surface-2 px-2 py-1 text-center text-[13px] leading-tight font-semibold tabular-nums">
                {postTime(post.scheduledAt)}
                <span className="block text-[11px] font-normal text-ink-2">{postDay(post.scheduledAt)}</span>
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">{post.title}</span>
                <span className="block truncate text-xs text-ink-3">{post.pageName}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function TopPagesCard({ data, days }: { data: DashboardEarnings | undefined; days: number }) {
  const top = Number(data?.topPages[0]?.commission ?? 0);
  return (
    <section aria-labelledby="top-title" className="card col-span-12 flex flex-col gap-3.5 px-6 py-5.5 lg:col-span-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="top-title" className="text-base font-semibold">Page ทำเงินสูงสุด <span className="text-xs font-normal text-ink-3">{days} วัน</span></h2>
        <Link href="/reports" className="text-[13px] font-medium text-accent hover:underline">ดู Report</Link>
      </div>
      {data && data.topPages.length === 0 ? <EmptyState icon={Trophy} title="ยังไม่มียอดที่จับคู่กับ Page ได้" /> : null}
      {data?.topPages.map((page) => (
        <div key={page.pageId}>
          <div className="mb-1 flex justify-between gap-2 text-[13px]">
            <span className="min-w-0 truncate">{page.pageName}</span>
            <span className="flex-none font-semibold tabular-nums">{baht(page.commission)}</span>
          </div>
          <div aria-hidden className="h-2 rounded-full bg-surface-2">
            <div className="h-2 rounded-full bg-primary" style={{ width: `${(Number(page.commission) / top) * 100}%` }} />
          </div>
        </div>
      ))}
      {data && Number(data.unmatched) > 0 ? (
        <p className="mt-auto text-xs text-ink-3">
          จับคู่ Page ไม่ได้ <span className="tabular-nums">{baht(data.unmatched)}</span> ·{" "}
          <Link href="/pages" className="font-medium text-accent hover:underline">ตรวจ Sub ID</Link>
        </p>
      ) : null}
    </section>
  );
}

function StatusList({ title, group, counts, href }: { title: string; group: string; counts: Record<string, number>; href: string }) {
  return (
    <section className="card col-span-12 px-6 py-5 sm:col-span-6 lg:col-span-3">
      <h2 className="mb-2 text-base font-semibold">{title}</h2>
      <ul>
        {Object.keys(STATUS[group]!).map((status) => (
          <li key={status}>
            <Link href={`${href}?status=${status}`} className="flex min-h-9 items-center justify-between gap-2 rounded-lg px-1 hover:bg-surface-2">
              <StatusBadge group={group} value={status} />
              <span className="text-sm font-semibold tabular-nums">{counts[status] ?? 0}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AttentionCard({ accounts }: { accounts: DashboardSummary["attention"] }) {
  return (
    <section className="card col-span-12 px-6 py-5 lg:col-span-6">
      <h2 className="mb-2 text-base font-semibold">บัญชีที่ถูกปฏิเสธหรือระงับ</h2>
      {accounts.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="ไม่มีบัญชีที่ถูกปฏิเสธหรือระงับ" />
      ) : (
        <ul>
          {accounts.map((account) => (
            <li key={account.id} className="border-b border-line py-2.5 last:border-0">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <p className="text-sm font-medium">
                  {account.displayName}
                  <span className="font-normal text-ink-2"> · {PLATFORM_LABELS[account.platform]} · {account.ownerName}</span>
                </p>
                <StatusBadge group="account" value={account.status} />
              </div>
              <p className="mt-0.5 text-xs text-ink-3">{account.statusReason ?? "ยังไม่ระบุเหตุผล"} · {formatDate(account.statusChangedAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function DashboardPage() {
  const [days, setDays] = useState(30);
  const query = useQuery(dashboardQuery);
  const earnings = useQuery({
    queryKey: ["dashboard-earnings", days],
    queryFn: () => api<DashboardEarnings>(`/api/dashboard/earnings?days=${days}`),
    placeholderData: (previous) => previous,
    refetchInterval: 60_000,
  });

  const header = (
    <PageHeader
      title="ภาพรวม"
      subtitle={today()}
      actions={
        <Link href="/owners?new=1" className="btn btn-primary">
          <Plus aria-hidden size={15} strokeWidth={2.4} />
          เพิ่มเจ้าของบัญชี
        </Link>
      }
    />
  );

  if (query.isPending) return <>{header}<div className="card"><Loading rows={6} /></div></>;
  if (query.isError) return <>{header}<div className="card"><ErrorState message={query.error.message} onRetry={() => query.refetch()} /></div></>;
  const data = query.data;
  const pendingReview = PLATFORMS.reduce((sum, platform) => sum + data.accountsByStatus[platform].pending_review, 0);

  return (
    <>
      {header}
      {earnings.isError ? (
        <p role="alert" className="mb-3 text-sm text-critical-ink">โหลดข้อมูลค่าคอมมิชชันไม่สำเร็จ: {earnings.error.message}</p>
      ) : null}
      <div className="grid grid-cols-12 gap-3.5">
        <EarningsCard data={earnings.data} days={days} onDays={setDays} />
        <TodoCard data={data} />
        <Tile label="เจ้าของบัญชี" value={data.totals.owners} note={`เพิ่มใหม่ ${data.ownersAddedThisMonth} คนในเดือนนี้`} href="/owners" />
        <Tile label="เมล" value={data.totals.mailboxes} note={data.mailboxesWithout2fa > 0 ? `ยังไม่เปิด 2FA ${data.mailboxesWithout2fa} บัญชี` : "เปิด 2FA ครบแล้ว"} href="/mailboxes" />
        <Tile label="บัญชีแพลตฟอร์ม" value={data.totals.platformAccounts} note={`รออนุมัติ ${pendingReview} บัญชี`} href="/accounts" />
        <Tile label="Page" value={data.totals.pages} note={`เชื่อม Facebook แล้ว ${data.pagesConnected} Page`} href="/pages" />
        <StatusCard data={data} />
        <UpcomingCard posts={data.upcomingPosts} />
        <TopPagesCard data={earnings.data} days={days} />
        <StatusList title="เมลตามสถานะ" group="mailbox" counts={data.mailboxesByStatus} href="/mailboxes" />
        <StatusList title="Page ตามสถานะ" group="page" counts={data.pagesByStatus} href="/pages" />
        <AttentionCard accounts={data.attention} />
      </div>
    </>
  );
}
