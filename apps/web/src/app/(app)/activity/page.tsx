"use client";

import { ENTITY_TYPES, type Paginated } from "@hub/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ChangeList, type AuditEntry } from "@/components/history";
import { Pagination } from "@/components/pagination";
import { api } from "@/lib/api";
import { ACTION_LABELS, ENTITY_LABELS, formatDate } from "@/lib/labels";

const entityName = (entry: AuditEntry) => {
  const data = entry.after ?? entry.before ?? {};
  return String(data.name ?? data.displayName ?? data.address ?? data.email ?? entry.entityId);
};

export default function ActivityPage() {
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState("");
  const query = useQuery({
    queryKey: ["audit-list", page, entityType],
    queryFn: () =>
      api<Paginated<AuditEntry>>(`/api/audit-logs?page=${page}${entityType ? `&entityType=${entityType}` : ""}`),
    placeholderData: (previous) => previous,
  });

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">ประวัติการแก้ไข</h1>
      <select
        aria-label="ประเภทข้อมูล"
        className="field mb-3 w-auto"
        value={entityType}
        onChange={(event) => {
          setEntityType(event.target.value);
          setPage(1);
        }}
      >
        <option value="">ประเภท: ทั้งหมด</option>
        {ENTITY_TYPES.map((type) => (
          <option key={type} value={type}>
            {ENTITY_LABELS[type]}
          </option>
        ))}
      </select>
      <div className="rounded-lg border border-line bg-surface-1">
        {query.isError ? (
          <p className="p-6 text-sm text-critical-ink">{query.error.message}</p>
        ) : query.isPending ? (
          <p className="p-6 text-sm text-ink-2">กำลังโหลด…</p>
        ) : query.data.items.length === 0 ? (
          <p className="p-6 text-sm text-ink-2">ยังไม่มีประวัติ</p>
        ) : (
          <>
            <ol>
              {query.data.items.map((entry) => (
                <li key={entry.id} className="border-b border-line px-4 py-3 last:border-0">
                  <p className="text-sm">
                    <span className="font-medium">{ACTION_LABELS[entry.action] ?? entry.action}</span>{" "}
                    {ENTITY_LABELS[entry.entityType] ?? entry.entityType} “{entityName(entry)}”
                  </p>
                  <p className="text-xs text-ink-3">
                    {entry.actor.name ?? entry.actor.email} · {formatDate(entry.createdAt)}
                  </p>
                  <ChangeList entry={entry} />
                </li>
              ))}
            </ol>
            <Pagination page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} onChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
