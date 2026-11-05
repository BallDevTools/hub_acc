"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Pagination } from "@/components/pagination";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/labels";

interface Item {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}
const ICON = {
  info: { glyph: "•", className: "text-ink-3", label: "ข้อมูล" },
  warning: { glyph: "!", className: "text-serious", label: "เตือน" },
  critical: { glyph: "✕", className: "text-critical", label: "สำคัญ" },
};

export default function NotificationsPage() {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["notifications", page],
    queryFn: () => api<{ items: Item[]; total: number; unread: number; page: number; pageSize: number }>(`/api/notifications?page=${page}`),
    placeholderData: (previous) => previous,
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["notifications"] });
  const read = useMutation({ mutationFn: (id: string) => api(`/api/notifications/${id}/read`, { method: "POST" }), onSettled: refresh });
  const readAll = useMutation({ mutationFn: () => api("/api/notifications/read-all", { method: "POST" }), onSettled: refresh });
  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">การแจ้งเตือน</h1>
        {query.data && query.data.unread > 0 ? (
          <button className="btn" disabled={readAll.isPending} onClick={() => readAll.mutate()}>อ่านทั้งหมด ({query.data.unread})</button>
        ) : null}
      </div>
      <div className="rounded-lg border border-line bg-surface-1">
        {query.isError ? <p className="p-6 text-sm text-critical-ink">{query.error.message}</p> : null}
        {query.isPending ? <p className="p-6 text-sm text-ink-2">กำลังโหลด…</p> : null}
        {query.data?.items.length === 0 ? <p className="p-6 text-sm text-ink-2">ไม่มีการแจ้งเตือน</p> : null}
        {query.data && query.data.items.length > 0 ? (
          <>
            <ul>
              {query.data.items.map((item) => (
                <li key={item.id} className={`flex items-start justify-between gap-3 border-b border-line px-4 py-3 last:border-0 ${item.readAt ? "opacity-70" : ""}`}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-words">
                      <span className={`mr-2 font-bold ${ICON[item.severity].className}`} title={ICON[item.severity].label}>{ICON[item.severity].glyph}</span>
                      {item.title}
                    </p>
                    {item.body ? <p className="mt-0.5 text-xs break-words whitespace-pre-line text-ink-2">{item.body}</p> : null}
                    <p className="mt-0.5 text-xs text-ink-3">
                      {formatDate(item.createdAt)}
                      {item.link ? <> · <Link className="underline" href={item.link}>ดูรายละเอียด</Link></> : null}
                    </p>
                  </div>
                  {item.readAt ? null : <button className="btn" disabled={read.isPending} onClick={() => read.mutate(item.id)}>อ่านแล้ว</button>}
                </li>
              ))}
            </ul>
            <Pagination page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} onChange={setPage} />
          </>
        ) : null}
      </div>
    </div>
  );
}
