"use client";

import { ENTITY_TYPES, type Paginated } from "@hub/shared";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { useState } from "react";
import { ChangeList, type AuditEntry } from "@/components/history";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { ACTION_LABELS, ENTITY_LABELS, formatDate } from "@/lib/labels";

const entityName = (entry: AuditEntry) => {
  const data = entry.after ?? entry.before ?? {};
  return String(data.name ?? data.displayName ?? data.title ?? data.address ?? data.email ?? data.accountLabel ?? entry.entityId);
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
      <PageHeader title="ประวัติการแก้ไข" />
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
      <div className="card">
        {query.isError ? (
          <ErrorState message={query.error.message} />
        ) : query.isPending ? (
          <Loading />
        ) : query.data.items.length === 0 ? (
          <EmptyState icon={History} title="ยังไม่มีประวัติ" />
        ) : (
          <>
            <ol>
              {query.data.items.map((entry) => (
                <li key={entry.id} className="border-b border-line px-5 py-3 last:border-0">
                  <p className="text-sm">
                    <span className="font-medium">{ACTION_LABELS[entry.action] ?? entry.action}</span>{" "}
                    {ENTITY_LABELS[entry.entityType] ?? entry.entityType} “{entityName(entry)}”
                  </p>
                  <p className="text-xs text-ink-3">
                    {entry.actor ? (entry.actor.name ?? entry.actor.email) : "ระบบ"} · {formatDate(entry.createdAt)}
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
