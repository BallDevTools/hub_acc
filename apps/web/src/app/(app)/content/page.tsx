"use client";

import type { Paginated } from "@hub/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { EntityHistory } from "@/components/history";
import { Modal } from "@/components/modal";
import { Pagination } from "@/components/pagination";
import { useCurrentUser } from "@/components/shell";
import { StatusBadge } from "@/components/status-badge";
import { api, fetchAllOptions } from "@/lib/api";
import { formatDate, statusOptions } from "@/lib/labels";

interface Content {
  id: string;
  title: string;
  body: string;
  link: string | null;
  status: string;
  updatedAt: string;
  createdBy: { email: string; name: string | null };
  _count: { postJobs: number };
}
type Dialog = { kind: "edit"; item: Content | null } | { kind: "schedule"; item: Content } | { kind: "history"; item: Content } | null;

function EditForm({ item, onDone }: { item: Content | null; onDone: () => void }) {
  const client = useQueryClient();
  const [title, setTitle] = useState(item?.title ?? "");
  const [body, setBody] = useState(item?.body ?? "");
  const [link, setLink] = useState(item?.link ?? "");
  const save = useMutation({
    mutationFn: () =>
      item
        ? api(`/api/content/${item.id}`, { method: "PATCH", body: { title, body, link } })
        : api("/api/content", { method: "POST", body: { title, body, link } }),
    onSuccess: () => {
      void client.invalidateQueries();
      onDone();
    },
  });
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {item?.status === "approved" ? <p className="text-xs text-ink-2">ถ้าแก้ข้อความ คอนเทนต์จะกลับไปเป็นฉบับร่างและต้องอนุมัติใหม่</p> : null}
      <div>
        <label htmlFor="title" className="mb-1 block text-sm font-medium">หัวข้อ *</label>
        <input id="title" required className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <label htmlFor="body" className="mb-1 block text-sm font-medium">เนื้อหาโพสต์ *</label>
        <textarea id="body" required rows={6} className="field" value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <div>
        <label htmlFor="link" className="mb-1 block text-sm font-medium">ลิงก์</label>
        <input id="link" type="url" className="field" value={link} onChange={(e) => setLink(e.target.value)} />
      </div>
      {save.error ? <p role="alert" className="text-sm text-critical-ink">{save.error.message}</p> : null}
      <button className="btn btn-primary" type="submit" disabled={save.isPending}>บันทึก</button>
    </form>
  );
}

function ScheduleForm({ item, onDone }: { item: Content; onDone: () => void }) {
  const client = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [when, setWhen] = useState("");
  const pages = useQuery({
    queryKey: ["options", "/api/pages"],
    queryFn: () => fetchAllOptions<{ id: string; name: string; metaPageId: string | null }>("/api/pages"),
  });
  const connected = pages.data?.filter((page) => page.metaPageId) ?? [];
  const schedule = useMutation({
    mutationFn: () =>
      api("/api/post-jobs", {
        method: "POST",
        body: { contentItemId: item.id, pageIds: selected, scheduledAt: new Date(when).toISOString() },
      }),
    onSuccess: () => {
      void client.invalidateQueries();
      onDone();
    },
  });
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    schedule.mutate();
  };
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Page ที่จะโพสต์ *</legend>
        {pages.data && connected.length === 0 ? <p className="text-sm text-ink-2">ยังไม่มี Page ที่เชื่อมกับ Facebook</p> : null}
        {connected.map((page) => (
          <label key={page.id} className="flex items-center gap-2 py-1 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(page.id)}
              onChange={(e) => setSelected((current) => (e.target.checked ? [...current, page.id] : current.filter((id) => id !== page.id)))}
            />
            {page.name}
          </label>
        ))}
      </fieldset>
      <div>
        <label htmlFor="when" className="mb-1 block text-sm font-medium">เวลาโพสต์ *</label>
        <input id="when" type="datetime-local" required className="field" value={when} onChange={(e) => setWhen(e.target.value)} />
      </div>
      {schedule.error ? <p role="alert" className="text-sm text-critical-ink">{schedule.error.message}</p> : null}
      <button className="btn btn-primary" type="submit" disabled={schedule.isPending || selected.length === 0}>ตั้งเวลาโพสต์</button>
    </form>
  );
}

export default function ContentPage() {
  const user = useCurrentUser();
  const client = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const list = useQuery({
    queryKey: ["content", page, status],
    queryFn: () => api<Paginated<Content>>(`/api/content?page=${page}${status ? `&status=${status}` : ""}`),
    placeholderData: (previous) => previous,
  });
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "archive" }) => api(`/api/content/${id}/${action}`, { method: "POST" }),
    onSettled: () => client.invalidateQueries(),
  });
  const isAdmin = user.role === "admin";
  return (
    <div className="max-w-5xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">คอนเทนต์</h1>
        <button className="btn btn-primary" onClick={() => setDialog({ kind: "edit", item: null })}>เพิ่มคอนเทนต์</button>
      </div>
      <select aria-label="สถานะ" className="field mb-3 w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
        <option value="">สถานะ: ทั้งหมด</option>
        {statusOptions("content").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {act.error ? <p role="alert" className="mb-3 text-sm text-critical-ink">{act.error.message}</p> : null}
      <div className="rounded-lg border border-line bg-surface-1">
        {list.isError ? <p className="p-6 text-sm text-critical-ink">{list.error.message}</p> : null}
        {list.isPending ? <p className="p-6 text-sm text-ink-2">กำลังโหลด…</p> : null}
        {list.data?.items.length === 0 ? <p className="p-6 text-sm text-ink-2">ยังไม่มีคอนเทนต์</p> : null}
        {list.data && list.data.items.length > 0 ? (
          <>
            <ul>
              {list.data.items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3 last:border-0">
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="text-sm font-medium break-words">{item.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs break-words whitespace-pre-wrap text-ink-2">{item.body}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-ink-3">
                      <StatusBadge group="content" value={item.status} />
                      <span>{formatDate(item.updatedAt)}</span>
                      <span>ตั้งเวลาแล้ว {item._count.postJobs} Page</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {isAdmin && item.status === "draft" ? (
                      <button className="btn btn-primary" disabled={act.isPending} onClick={() => act.mutate({ id: item.id, action: "approve" })}>อนุมัติ</button>
                    ) : null}
                    {item.status === "approved" ? (
                      <button className="btn btn-primary" onClick={() => setDialog({ kind: "schedule", item })}>ตั้งเวลา</button>
                    ) : null}
                    <button className="btn" onClick={() => setDialog({ kind: "edit", item })}>แก้ไข</button>
                    <button className="btn" onClick={() => setDialog({ kind: "history", item })}>ประวัติ</button>
                    {isAdmin && item.status !== "archived" ? (
                      <button className="btn" disabled={act.isPending} onClick={() => act.mutate({ id: item.id, action: "archive" })}>เก็บถาวร</button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onChange={setPage} />
          </>
        ) : null}
      </div>
      {dialog?.kind === "edit" ? (
        <Modal title={dialog.item ? "แก้ไขคอนเทนต์" : "เพิ่มคอนเทนต์"} onClose={() => setDialog(null)}>
          <EditForm item={dialog.item} onDone={() => setDialog(null)} />
        </Modal>
      ) : null}
      {dialog?.kind === "schedule" ? (
        <Modal title={`ตั้งเวลา: ${dialog.item.title}`} onClose={() => setDialog(null)}>
          <ScheduleForm item={dialog.item} onDone={() => setDialog(null)} />
        </Modal>
      ) : null}
      {dialog?.kind === "history" ? (
        <Modal title="ประวัติการแก้ไข" onClose={() => setDialog(null)}>
          <EntityHistory entityId={dialog.item.id} />
        </Modal>
      ) : null}
    </div>
  );
}
