"use client";

import { relationName } from "@/components/cells";
import { ResourcePage, type ResourceConfig, type Row } from "@/components/resource-page";
import { StatusBadge } from "@/components/status-badge";
import { notesField } from "@/lib/field-presets";
import { statusOptions } from "@/lib/labels";

const config: ResourceConfig = {
  title: "เจ้าของบัญชี",
  singular: "เจ้าของบัญชี",
  endpoint: "/api/owners",
  searchPlaceholder: "ค้นหาชื่อ ทีม หรืออีเมล",
  filters: [{ param: "status", label: "สถานะ", options: statusOptions("owner") }],
  columns: [
    { label: "ชื่อ", render: (row) => <span className="font-medium">{String(row.name)}</span> },
    { label: "ทีม", render: (row) => (row.team as string | null) ?? "—" },
    {
      label: "ผู้ดูแล",
      render: (row) => {
        const manager = row.manager as { name: string | null; email: string } | null;
        return manager ? (manager.name ?? manager.email) : relationName(row, "manager", "email");
      },
    },
    {
      label: "เมล / บัญชี / Page",
      render: (row) => {
        const count = row._count as { mailboxes: number; platformAccounts: number; pages: number };
        return <span className="tabular-nums">{`${count.mailboxes} / ${count.platformAccounts} / ${count.pages}`}</span>;
      },
    },
    { label: "สถานะ", render: (row) => <StatusBadge group="owner" value={String(row.status)} /> },
  ],
  fields: [
    { name: "name", label: "ชื่อ", type: "text", required: true },
    { name: "team", label: "ทีม", type: "text" },
    { name: "contactEmail", label: "อีเมลติดต่อ", type: "email" },
    {
      name: "managerId",
      label: "ผู้ดูแล",
      type: "relation",
      relation: { endpoint: "/api/users", label: (row: Row) => String(row.name ?? row.email) },
    },
    { name: "status", label: "สถานะ", type: "select", options: statusOptions("owner"), defaultValue: "active" },
    notesField,
  ],
};

export default function OwnersPage() {
  return <ResourcePage config={config} />;
}
