"use client";

import { ExternalLink, relationName } from "@/components/cells";
import { ResourcePage, type ResourceConfig, type Row } from "@/components/resource-page";
import { StatusBadge } from "@/components/status-badge";
import { notesField, ownerField } from "@/lib/field-presets";
import { statusOptions } from "@/lib/labels";

const config: ResourceConfig = {
  title: "Page",
  singular: "Page",
  endpoint: "/api/pages",
  searchPlaceholder: "ค้นหาชื่อ Page หรือลิงก์",
  filters: [{ param: "status", label: "สถานะ", options: statusOptions("page") }],
  columns: [
    { label: "ชื่อ Page", render: (row) => <span className="font-medium">{String(row.name)}</span> },
    { label: "เจ้าของบัญชี", render: (row) => relationName(row, "owner", "name") },
    { label: "บัญชี Facebook", render: (row) => relationName(row, "platformAccount", "displayName") },
    { label: "ลิงก์", render: (row) => <ExternalLink href={row.url}>เปิด Page</ExternalLink> },
    { label: "สถานะ", render: (row) => <StatusBadge group="page" value={String(row.status)} /> },
  ],
  fields: [
    ownerField,
    { name: "name", label: "ชื่อ Page", type: "text", required: true },
    {
      name: "platformAccountId",
      label: "บัญชี Facebook",
      type: "relation",
      relation: {
        endpoint: "/api/platform-accounts?platform=facebook",
        label: (row: Row) => String(row.displayName),
        scopedToOwner: true,
      },
    },
    { name: "url", label: "ลิงก์ Page", type: "url" },
    { name: "status", label: "สถานะ", type: "select", options: statusOptions("page"), defaultValue: "draft" },
    notesField,
  ],
};

export default function PagesPage() {
  return <ResourcePage config={config} />;
}
