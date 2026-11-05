"use client";

import type { Paginated } from "@hub/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { api } from "@/lib/api";
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

function Content() {
  const router = useRouter();
  const params = useSearchParams();
  const client = useQueryClient();
  const status = params.get("status") ?? "";
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ["post-jobs", page, status],
    queryFn: () => api<Paginated<Job>>(`/api/post-jobs?page=${page}${status ? `&status=${status}` : ""}`),
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
      <h1 className="mb-4 text-xl font-semibold">คิวโพสต์</h1>
      <select
        aria-label="สถานะ"
        className="field mb-3 w-auto"
        value={status}
        onChange={(e) => {
          setPage(1);
          router.replace(e.target.value ? `/schedule?status=${e.target.value}` : "/schedule", { scroll: false });
        }}
      >
        <option value="">สถานะ: ทั้งหมด</option>
        {statusOptions("post").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {act.error ? <p role="alert" className="mb-3 text-sm text-critical-ink">{act.error.message}</p> : null}
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
