"use client";

import type { Paginated } from "@hub/shared";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ACTION_LABELS, auditStatusLabel, FIELD_LABELS, formatDate } from "@/lib/labels";

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
  actor: { email: string; name: string | null } | null;
}

const HIDDEN = new Set(["id", "createdAt", "updatedAt", "statusChangedAt", "lastLoginAt"]);
const display = (value: unknown) => (value === null || value === undefined || value === "" ? "—" : String(value));

export function ChangeList({ entry }: { entry: AuditEntry }) {
  const before = entry.before ?? {};
  const after = entry.after ?? {};
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (key) => !HIDDEN.has(key) && JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
  if (changed.length === 0) return null;
  const show = (key: string, value: unknown) =>
    (key === "status" ? auditStatusLabel(entry.entityType, value) : null) ?? display(value);
  return (
    <dl className="mt-1 space-y-0.5 text-xs text-ink-2">
      {changed.map((key) => (
        <div key={key} className="break-words">
          <dt className="inline font-medium">{FIELD_LABELS[key] ?? key}: </dt>
          <dd className="inline">
            {entry.action === "update"
              ? `${show(key, before[key])} → ${show(key, after[key])}`
              : show(key, entry.action === "delete" ? before[key] : after[key])}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function EntityHistory({ entityId }: { entityId: string }) {
  const query = useQuery({
    queryKey: ["audit", entityId],
    queryFn: () => api<Paginated<AuditEntry>>(`/api/audit-logs?entityId=${entityId}&pageSize=50`),
  });
  if (query.isPending) return <p className="text-sm text-ink-2">กำลังโหลด…</p>;
  if (query.isError) return <p className="text-sm text-critical-ink">{query.error.message}</p>;
  return (
    <ol className="space-y-3">
      {query.data.items.map((entry) => (
        <li key={entry.id} className="border-b border-line pb-3 last:border-0">
          <p className="text-sm">
            <span className="font-medium">{ACTION_LABELS[entry.action] ?? entry.action}</span> โดย{" "}
            {entry.actor ? (entry.actor.name ?? entry.actor.email) : "ระบบ"}
          </p>
          <p className="text-xs text-ink-3">{formatDate(entry.createdAt)}</p>
          <ChangeList entry={entry} />
        </li>
      ))}
    </ol>
  );
}
