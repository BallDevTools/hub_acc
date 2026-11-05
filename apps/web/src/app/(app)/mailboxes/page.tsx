"use client";

import { ExternalLink, relationName } from "@/components/cells";
import { ResourcePage, type ResourceConfig } from "@/components/resource-page";
import { StatusBadge } from "@/components/status-badge";
import { notesField, ownerField, vaultField } from "@/lib/field-presets";
import { PROVIDER_OPTIONS, statusOptions } from "@/lib/labels";

const config: ResourceConfig = {
  title: "เมล",
  singular: "เมล",
  endpoint: "/api/mailboxes",
  searchPlaceholder: "ค้นหาเมลหรือหมายเหตุ",
  filters: [{ param: "status", label: "สถานะ", options: statusOptions("mailbox") }],
  columns: [
    { label: "ที่อยู่เมล", render: (row) => <span className="font-medium">{String(row.address)}</span> },
    { label: "เจ้าของบัญชี", render: (row) => relationName(row, "owner", "name") },
    { label: "2FA", render: (row) => (row.twoFactorEnabled ? "✓ เปิดแล้ว" : "! ยังไม่เปิด") },
    { label: "รหัสผ่าน", render: (row) => <ExternalLink href={row.vaultUrl}>เปิดรายการ</ExternalLink> },
    { label: "สถานะ", render: (row) => <StatusBadge group="mailbox" value={String(row.status)} /> },
  ],
  fields: [
    ownerField,
    { name: "address", label: "ที่อยู่เมล", type: "email", required: true },
    { name: "provider", label: "ผู้ให้บริการ", type: "select", options: PROVIDER_OPTIONS, defaultValue: "gmail" },
    { name: "status", label: "สถานะ", type: "select", options: statusOptions("mailbox"), defaultValue: "pending" },
    { name: "twoFactorEnabled", label: "เปิด 2FA แล้ว", type: "checkbox" },
    vaultField,
    notesField,
  ],
};

export default function MailboxesPage() {
  return <ResourcePage config={config} />;
}
