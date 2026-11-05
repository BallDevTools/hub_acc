"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bell, Info, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui";
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
  info: { icon: Info, className: "bg-surface-2 text-ink-2", label: "ข้อมูล" },
  warning: { icon: AlertTriangle, className: "bg-serious-soft text-serious-ink", label: "เตือน" },
  critical: { icon: X, className: "bg-critical-soft text-critical-ink", label: "สำคัญ" },
};

export default function NotificationsPage() {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["notifications", page],
    queryFn: () => api<{ items: Item[]; total: number; unread: number; page: number; pageSize: number }>(`/api/notifications?page=${page}`),
    placeholderData: (previous) => previous,
  });
  const refresh = () => client.invalidateQueries();
  const read = useMutation({ mutationFn: (id: string) => api(`/api/notifications/${id}/read`, { method: "POST" }), onSettled: refresh });
  const readAll = useMutation({ mutationFn: () => api("/api/notifications/read-all", { method: "POST" }), onSettled: refresh });
  return (
    <div>
      <PageHeader
        title="การแจ้งเตือน"
        actions={
          query.data && query.data.unread > 0 ? (
            <button className="btn btn-surface" disabled={readAll.isPending} onClick={() => readAll.mutate()}>อ่านทั้งหมด ({query.data.unread})</button>
          ) : null
        }
      />
      <div className="card">
        {query.isError ? <ErrorState message={query.error.message} /> : null}
        {query.isPending ? <Loading /> : null}
        {query.data?.items.length === 0 ? <EmptyState icon={Bell} title="ไม่มีการแจ้งเตือน" /> : null}
        {query.data && query.data.items.length > 0 ? (
          <>
            <ul>
              {query.data.items.map((item) => {
                const { icon: Icon, className, label } = ICON[item.severity];
                return (
                <li key={item.id} className={`flex items-start gap-3 border-b border-line px-5 py-3 last:border-0 ${item.readAt ? "opacity-70" : ""}`}>
                  <span title={label} className={`flex size-9 flex-none items-center justify-center rounded-full ${className}`}>
                    <Icon aria-hidden size={16} strokeWidth={2.2} />
                    <span className="sr-only">{label}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium break-words">{item.title}</p>
                    {item.body ? <p className="mt-0.5 text-xs break-words whitespace-pre-line text-ink-2">{item.body}</p> : null}
                    <p className="mt-0.5 text-xs text-ink-3">
                      {formatDate(item.createdAt)}
                      {item.link ? <> · <Link className="font-medium text-accent hover:underline" href={item.link}>ดูรายละเอียด</Link></> : null}
                    </p>
                  </div>
                  {item.readAt ? null : <button className="btn btn-sm" disabled={read.isPending} onClick={() => read.mutate(item.id)}>อ่านแล้ว</button>}
                </li>
                );
              })}
            </ul>
            <Pagination page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} onChange={setPage} />
          </>
        ) : null}
      </div>
    </div>
  );
}
