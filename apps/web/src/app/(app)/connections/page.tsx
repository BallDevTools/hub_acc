"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useCurrentUser } from "@/components/shell";
import { api, fetchAllOptions } from "@/lib/api";
import { formatDate } from "@/lib/labels";

interface Connection {
  id: string;
  provider: string;
  accountLabel: string;
  status: string;
  lastSyncAt: string | null;
  lastError: string | null;
}

const ERRORS: Record<string, string> = {
  google_denied: "ไม่ได้รับสิทธิ์จาก Google หรือคำขอหมดอายุ",
  mailbox_missing: "ไม่พบเมลนี้ในระบบ",
  wrong_account: "บัญชี Google ที่เลือกไม่ตรงกับเมลนี้",
  no_refresh_token: "Google ไม่ได้ส่งสิทธิ์ระยะยาวมา กรุณาลองเชื่อมใหม่",
  google_failed: "เชื่อม Gmail ไม่สำเร็จ",
  google_not_configured: "ระบบยังไม่ได้ตั้งค่า Google OAuth หรือ TOKEN_ENCRYPTION_KEY",
  meta_not_configured: "ระบบยังไม่ได้ตั้งค่า Meta App หรือ TOKEN_ENCRYPTION_KEY",
  meta_denied: "ไม่ได้รับสิทธิ์จาก Meta หรือคำขอหมดอายุ",
  meta_failed: "เชื่อมบัญชี Meta ไม่สำเร็จ",
};
const PROVIDERS: Record<string, string> = { google_gmail: "Gmail", meta_user: "บัญชี Meta", meta_page: "Facebook Page" };

function MetaSection() {
  const client = useQueryClient();
  const [hubPageId, setHubPageId] = useState("");
  const [metaPageId, setMetaPageId] = useState("");
  const hubPages = useQuery({
    queryKey: ["options", "/api/pages"],
    queryFn: () => fetchAllOptions<{ id: string; name: string; metaPageId: string | null }>("/api/pages"),
  });
  const metaPages = useQuery({
    queryKey: ["meta-pages"],
    queryFn: () => api<Array<{ id: string; name: string }>>("/api/connections/meta/pages"),
    retry: false,
  });
  const connect = useMutation({
    mutationFn: () => api(`/api/pages/${hubPageId}/connect-meta`, { method: "POST", body: { metaPageId } }),
    onSuccess: () => {
      setHubPageId("");
      setMetaPageId("");
      void client.invalidateQueries();
    },
  });
  return (
    <section className="mb-6 rounded-lg border border-line bg-surface-1 p-4">
      <h2 className="text-sm font-semibold">เชื่อม Facebook Page</h2>
      <p className="mt-1 mb-3 text-xs text-ink-2">เชื่อมบัญชี Meta ของผู้ดูแล Page จากนั้นจับคู่กับ Page ในระบบเพื่อโพสต์และดึงสถิติ</p>
      <a className="btn" href="/api/connections/meta/start">เชื่อมบัญชี Meta</a>
      {metaPages.isError ? <p className="mt-2 text-xs text-ink-2">{metaPages.error.message}</p> : null}
      {metaPages.data ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <select aria-label="Page ในระบบ" className="field w-auto" value={hubPageId} onChange={(e) => setHubPageId(e.target.value)}>
            <option value="">— Page ในระบบ —</option>
            {hubPages.data?.map((page) => <option key={page.id} value={page.id}>{page.name}{page.metaPageId ? " (เชื่อมแล้ว)" : ""}</option>)}
          </select>
          <select aria-label="Page บน Facebook" className="field w-auto" value={metaPageId} onChange={(e) => setMetaPageId(e.target.value)}>
            <option value="">— Page บน Facebook —</option>
            {metaPages.data.map((page) => <option key={page.id} value={page.id}>{page.name}</option>)}
          </select>
          <button className="btn btn-primary" disabled={!hubPageId || !metaPageId || connect.isPending} onClick={() => connect.mutate()}>จับคู่</button>
        </div>
      ) : null}
      {connect.error ? <p role="alert" className="mt-2 text-sm text-critical-ink">{connect.error.message}</p> : null}
    </section>
  );
}

function Content() {
  const params = useSearchParams();
  const user = useCurrentUser();
  const client = useQueryClient();
  const [mailboxId, setMailboxId] = useState("");
  const connections = useQuery({ queryKey: ["connections"], queryFn: () => api<Connection[]>("/api/connections") });
  const mailboxes = useQuery({
    queryKey: ["options", "/api/mailboxes"],
    queryFn: () => fetchAllOptions<{ id: string; address: string }>("/api/mailboxes"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/connections/${id}`, { method: "DELETE" }),
    onSettled: () => client.invalidateQueries({ queryKey: ["connections"] }),
  });
  const error = params.get("error");
  return (
    <div className="max-w-3xl">
      <h1 className="mb-4 text-xl font-semibold">การเชื่อมต่อ</h1>
      {error ? <p role="alert" className="mb-3 text-sm text-critical-ink">{ERRORS[error] ?? "เชื่อมต่อไม่สำเร็จ"}</p> : null}
      {params.get("connected") ? <p role="status" className="mb-3 text-sm">เชื่อมต่อสำเร็จ</p> : null}

      <section className="mb-6 rounded-lg border border-line bg-surface-1 p-4">
        <h2 className="text-sm font-semibold">เชื่อม Gmail</h2>
        <p className="mt-1 mb-3 text-xs text-ink-2">ขอสิทธิ์อ่านอย่างเดียว ระบบเก็บเฉพาะผู้ส่ง หัวข้อ และวันที่ของอีเมลจาก Shopee และ Facebook</p>
        <div className="flex flex-wrap gap-2">
          <select aria-label="เมล" className="field w-auto" value={mailboxId} onChange={(e) => setMailboxId(e.target.value)}>
            <option value="">— เลือกเมล —</option>
            {mailboxes.data?.map((mailbox) => <option key={mailbox.id} value={mailbox.id}>{mailbox.address}</option>)}
          </select>
          {mailboxId ? (
            <a className="btn btn-primary" href={`/api/connections/google/start?mailboxId=${mailboxId}`}>เชื่อม Gmail</a>
          ) : (
            <button className="btn btn-primary" disabled>เชื่อม Gmail</button>
          )}
        </div>
      </section>

      {user.role === "admin" ? <MetaSection /> : null}

      <div className="rounded-lg border border-line bg-surface-1">
        {connections.isError ? <p className="p-6 text-sm text-critical-ink">{connections.error.message}</p> : null}
        {connections.data?.length === 0 ? <p className="p-6 text-sm text-ink-2">ยังไม่มีการเชื่อมต่อ</p> : null}
        <ul>
          {connections.data?.map((connection) => (
            <li key={connection.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-0">
              <div className="min-w-0">
                <p className="text-sm font-medium break-words">{connection.accountLabel}</p>
                <p className="text-xs text-ink-2">
                  {PROVIDERS[connection.provider] ?? connection.provider} ·{" "}
                  {connection.status === "active" ? "✓ ใช้งานได้" : "! ต้องเชื่อมใหม่"} · ล่าสุด {formatDate(connection.lastSyncAt)}
                </p>
                {connection.lastError ? <p className="text-xs text-critical-ink">{connection.lastError}</p> : null}
              </div>
              {user.role === "admin" ? (
                <button className="btn btn-danger" disabled={remove.isPending} onClick={() => remove.mutate(connection.id)}>ยกเลิกการเชื่อม</button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function ConnectionsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-ink-2">กำลังโหลด…</p>}>
      <Content />
    </Suspense>
  );
}
