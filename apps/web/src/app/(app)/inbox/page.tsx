"use client";

import type { Paginated } from "@hub/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox } from "lucide-react";
import { useState } from "react";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, PLATFORM_LABELS, STATUS, statusOptions } from "@/lib/labels";

interface Item {
  id: string;
  fromAddress: string;
  subject: string;
  receivedAt: string;
  platform: string | null;
  classification: string;
  reason: string;
  platformAccountId: string | null;
  mailbox: { address: string; platformAccounts: Array<{ id: string; displayName: string; platform: string }> };
}

function Row({ item }: { item: Item }) {
  const client = useQueryClient();
  const accounts = item.mailbox.platformAccounts.filter((account) => !item.platform || account.platform === item.platform);
  const [accountId, setAccountId] = useState(item.platformAccountId ?? accounts[0]?.id ?? "");
  const [status, setStatus] = useState(item.classification === "unknown" ? "pending_review" : item.classification);
  const resolve = useMutation({
    mutationFn: (body: object) => api(`/api/inbox/${item.id}/resolve`, { method: "POST", body }),
    onSuccess: () => client.invalidateQueries(),
  });
  const statusValid = Boolean(STATUS.account![status]);
  return (
    <li className="border-b border-line px-5 py-3 last:border-0">
      <p className="text-sm font-medium break-words">{item.subject}</p>
      <p className="mt-0.5 text-xs break-words text-ink-2">
        {item.fromAddress} → {item.mailbox.address} · {formatDate(item.receivedAt)}
      </p>
      <p className="mt-0.5 text-xs text-ink-2">
        {item.platform ? `${PLATFORM_LABELS[item.platform]} · ` : ""}เหตุที่ต้องตรวจ: {item.reason}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select aria-label="บัญชี" className="field w-auto" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">— เลือกบัญชี —</option>
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.displayName}</option>)}
        </select>
        <select aria-label="สถานะ" className="field w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          {statusOptions("account").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <button
          className="btn btn-primary"
          disabled={!accountId || !statusValid || resolve.isPending}
          onClick={() => resolve.mutate({ action: "apply", platformAccountId: accountId, status })}
        >
          อัปเดตสถานะ
        </button>
        <button className="btn btn-sm" disabled={resolve.isPending} onClick={() => resolve.mutate({ action: "dismiss" })}>
          ไม่เกี่ยวข้อง
        </button>
      </div>
      {resolve.error ? <p role="alert" className="mt-2 text-sm text-critical-ink">{resolve.error.message}</p> : null}
    </li>
  );
}

export default function InboxPage() {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["inbox", page],
    queryFn: () => api<Paginated<Item>>(`/api/inbox?page=${page}`),
    placeholderData: (previous) => previous,
  });
  return (
    <div>
      <PageHeader title="อีเมลรอตรวจ" subtitle="อีเมลที่ระบบไม่มั่นใจจะมาอยู่ที่นี่ และยังไม่เปลี่ยนสถานะบัญชีจนกว่าคุณจะยืนยัน" />
      <div className="card">
        {query.isError ? <ErrorState message={query.error.message} /> : null}
        {query.isPending ? <Loading /> : null}
        {query.data?.items.length === 0 ? <EmptyState icon={Inbox} title="ไม่มีอีเมลรอตรวจ" /> : null}
        {query.data && query.data.items.length > 0 ? (
          <>
            <ul>{query.data.items.map((item) => <Row key={item.id} item={item} />)}</ul>
            <Pagination page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} onChange={setPage} />
          </>
        ) : null}
      </div>
    </div>
  );
}
