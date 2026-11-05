"use client";

import type { Paginated } from "@hub/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { api, fetchAllOptions } from "@/lib/api";
import { formatDate, statusOptions } from "@/lib/labels";

interface Job {
  id: string;
  status: string;
  scheduledAt: string;
  publishedAt: string | null;
  lastError: string | null;
  contentItem: { title: string };
  page: { name: string };
}

const WEEKDAYS = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."];
const bangkokDay = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const bangkokTime = (iso: string) =>
  new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const pad = (value: number) => String(value).padStart(2, "0");

function Calendar({ pageId }: { pageId: string }) {
  const [month, setMonth] = useState(() => {
    const [year, current] = bangkokDay(new Date().toISOString()).split("-").map(Number);
    return { year: year!, month: current! };
  });
  const next = month.month === 12 ? { year: month.year + 1, month: 1 } : { year: month.year, month: month.month + 1 };
  const previous = month.month === 1 ? { year: month.year - 1, month: 12 } : { year: month.year, month: month.month - 1 };
  const boundary = (value: { year: number; month: number }) => `${value.year}-${pad(value.month)}-01T00:00:00+07:00`;
  const query = useQuery({
    queryKey: ["post-jobs", "calendar", month, pageId],
    queryFn: () =>
      api<Paginated<Job>>(
        `/api/post-jobs?pageSize=100&from=${encodeURIComponent(boundary(month))}&to=${encodeURIComponent(boundary(next))}${pageId ? `&pageId=${pageId}` : ""}`,
      ),
    placeholderData: (data) => data,
  });
  const daysInMonth = new Date(Date.UTC(month.year, month.month, 0)).getUTCDate();
  // getUTCDay: อาทิตย์ = 0 แต่ปฏิทินเริ่มวันจันทร์
  const leadingBlanks = (new Date(Date.UTC(month.year, month.month - 1, 1)).getUTCDay() + 6) % 7;
  const title = new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(month.year, month.month - 1, 1)),
  );
  const today = bangkokDay(new Date().toISOString());
  const items = query.data?.items ?? [];
  return (
    <div className="rounded-lg border border-line bg-surface-1">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <button className="btn" onClick={() => setMonth(previous)}>ก่อนหน้า</button>
        <h2 className="text-sm font-semibold">{title}</h2>
        <button className="btn" onClick={() => setMonth(next)}>ถัดไป</button>
      </div>
      {query.isError ? <p className="p-4 text-sm text-critical-ink">{query.error.message}</p> : null}
      {query.data && items.length === 0 ? <p className="p-4 text-sm text-ink-2 md:hidden">ไม่มีโพสต์ในเดือนนี้</p> : null}
      {query.data && query.data.total > items.length ? (
        <p className="border-b border-line px-4 py-2 text-xs text-ink-2">แสดง {items.length} จาก {query.data.total} โพสต์ เลือก Page เพื่อดูให้ครบ</p>
      ) : null}
      <div className="hidden grid-cols-7 border-b border-line text-center text-xs text-ink-2 md:grid">
        {WEEKDAYS.map((day) => <div key={day} className="py-1">{day}</div>)}
      </div>
      <div className="md:grid md:grid-cols-7">
        {Array.from({ length: leadingBlanks }, (_, index) => <div key={index} className="hidden border-r border-b border-line md:block" />)}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const date = `${month.year}-${pad(month.month)}-${pad(index + 1)}`;
          const jobs = items.filter((job) => bangkokDay(job.scheduledAt) === date);
          return (
            // บนมือถือแสดงเฉพาะวันที่มีโพสต์ เพื่อไม่ให้ต้องเลื่อนผ่านวันว่าง
            <div key={date} data-date={date} className={`min-w-0 border-b border-line p-2 md:min-h-24 md:border-r ${jobs.length === 0 ? "hidden md:block" : ""}`}>
              <p className={`mb-1 text-xs tabular-nums ${date === today ? "font-bold" : "text-ink-2"}`}>
                <span className="md:hidden">{date}</span>
                <span className="hidden md:inline">{index + 1}</span>
              </p>
              <ul className="space-y-1">
                {jobs.map((job) => (
                  <li key={job.id} className="rounded border border-line p-1 text-xs break-words">
                    <p className="text-ink-2 tabular-nums">{bangkokTime(job.scheduledAt)}</p>
                    <p className="font-medium">{job.contentItem.title}</p>
                    <p className="text-ink-2">{job.page.name}</p>
                    <StatusBadge group="post" value={job.status} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Content() {
  const router = useRouter();
  const params = useSearchParams();
  const client = useQueryClient();
  const status = params.get("status") ?? "";
  const [page, setPage] = useState(1);
  const [pageId, setPageId] = useState("");
  const [view, setView] = useState<"list" | "calendar">("list");
  const pages = useQuery({
    queryKey: ["options", "/api/pages"],
    queryFn: () => fetchAllOptions<{ id: string; name: string }>("/api/pages"),
  });
  const list = useQuery({
    queryKey: ["post-jobs", page, status, pageId],
    queryFn: () =>
      api<Paginated<Job>>(`/api/post-jobs?page=${page}${status ? `&status=${status}` : ""}${pageId ? `&pageId=${pageId}` : ""}`),
    enabled: view === "list",
    placeholderData: (previous) => previous,
    refetchInterval: 30_000,
  });
  const act = useMutation({
    mutationFn: ({ id, action, body }: { id: string; action: string; body?: object }) =>
      api(`/api/post-jobs/${id}/${action}`, { method: "POST", body }),
    onSettled: () => client.invalidateQueries(),
  });
  return (
    <div className="max-w-5xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">คิวโพสต์</h1>
        <div className="flex gap-1" role="group" aria-label="มุมมอง">
          <button className={`btn ${view === "list" ? "btn-primary" : ""}`} aria-pressed={view === "list"} onClick={() => setView("list")}>รายการ</button>
          <button className={`btn ${view === "calendar" ? "btn-primary" : ""}`} aria-pressed={view === "calendar"} onClick={() => setView("calendar")}>ปฏิทิน</button>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
      <select
        aria-label="Page"
        className="field w-auto"
        value={pageId}
        onChange={(e) => {
          setPageId(e.target.value);
          setPage(1);
        }}
      >
        <option value="">Page: ทั้งหมด</option>
        {pages.data?.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select>
      {view === "list" ? (
      <select
        aria-label="สถานะ"
        className="field w-auto"
        value={status}
        onChange={(e) => {
          setPage(1);
          router.replace(e.target.value ? `/schedule?status=${e.target.value}` : "/schedule", { scroll: false });
        }}
      >
        <option value="">สถานะ: ทั้งหมด</option>
        {statusOptions("post").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      ) : null}
      </div>
      {view === "calendar" ? <Calendar pageId={pageId} /> : null}
      {act.error ? <p role="alert" className="mb-3 text-sm text-critical-ink">{act.error.message}</p> : null}
      {view === "list" ? (
      <div className="rounded-lg border border-line bg-surface-1">
        {list.isError ? <p className="p-6 text-sm text-critical-ink">{list.error.message}</p> : null}
        {list.isPending ? <p className="p-6 text-sm text-ink-2">กำลังโหลด…</p> : null}
        {list.data?.items.length === 0 ? <p className="p-6 text-sm text-ink-2">ไม่มีรายการ</p> : null}
        {list.data && list.data.items.length > 0 ? (
          <>
            <ul>
              {list.data.items.map((job) => (
                <li key={job.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3 last:border-0">
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="text-sm font-medium break-words">{job.contentItem.title} → {job.page.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-ink-2">
                      <StatusBadge group="post" value={job.status} />
                      <span>{formatDate(job.publishedAt ?? job.scheduledAt)}</span>
                    </p>
                    {job.lastError ? <p className="mt-0.5 text-xs break-words text-critical-ink">{job.lastError}</p> : null}
                    {job.status === "unknown" ? (
                      <p className="mt-0.5 text-xs text-ink-2">เปิดดูที่ Page ก่อน ถ้าโพสต์ขึ้นแล้วให้กด “ขึ้นแล้ว” เพื่อไม่ให้โพสต์ซ้ำ</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {job.status === "scheduled" ? (
                      <button className="btn" disabled={act.isPending} onClick={() => act.mutate({ id: job.id, action: "cancel" })}>ยกเลิก</button>
                    ) : null}
                    {job.status === "failed" ? (
                      <button className="btn" disabled={act.isPending} onClick={() => act.mutate({ id: job.id, action: "retry", body: {} })}>ลองใหม่</button>
                    ) : null}
                    {job.status === "unknown" ? (
                      <>
                        <button className="btn" disabled={act.isPending} onClick={() => act.mutate({ id: job.id, action: "mark-published" })}>ขึ้นแล้ว</button>
                        <button className="btn" disabled={act.isPending} onClick={() => act.mutate({ id: job.id, action: "retry", body: { confirmNotPosted: true } })}>ยังไม่ขึ้น โพสต์ใหม่</button>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onChange={setPage} />
          </>
        ) : null}
      </div>
      ) : null}
    </div>
  );
}

export default function SchedulePage() {
  return (
    <Suspense fallback={<p className="text-sm text-ink-2">กำลังโหลด…</p>}>
      <Content />
    </Suspense>
  );
}
