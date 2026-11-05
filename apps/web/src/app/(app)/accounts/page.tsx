"use client";

import { ExternalLink, relationName } from "@/components/cells";
import { ResourcePage, type ResourceConfig, type Row } from "@/components/resource-page";
import { StatusBadge } from "@/components/status-badge";
import { notesField, ownerField, vaultField } from "@/lib/field-presets";
import { formatDate, PLATFORM_LABELS, PLATFORM_OPTIONS, statusOptions } from "@/lib/labels";

const config: ResourceConfig = {
  title: "บัญชีแพลตฟอร์ม",
  singular: "บัญชีแพลตฟอร์ม",
  endpoint: "/api/platform-accounts",
  searchPlaceholder: "ค้นหาชื่อบัญชีหรือเหตุผล",
  filters: [
    { param: "platform", label: "แพลตฟอร์ม", options: PLATFORM_OPTIONS },
    { param: "status", label: "สถานะ", options: statusOptions("account") },
  ],
  columns: [
    { label: "ชื่อบัญชี", render: (row) => <span className="font-medium">{String(row.displayName)}</span> },
    { label: "แพลตฟอร์ม", render: (row) => PLATFORM_LABELS[String(row.platform)] },
    { label: "เจ้าของบัญชี", render: (row) => relationName(row, "owner", "name") },
    { label: "เมล", render: (row) => relationName(row, "mailbox", "address") },
    {
      label: "สถานะ",
      render: (row) => (
        <div>
          <StatusBadge group="account" value={String(row.status)} />
          {row.statusReason ? <p className="mt-0.5 text-xs text-ink-2">{String(row.statusReason)}</p> : null}
        </div>
      ),
    },
    { label: "เปลี่ยนสถานะล่าสุด", render: (row) => formatDate(row.statusChangedAt as string) },
    { label: "รหัสผ่าน", render: (row) => <ExternalLink href={row.vaultUrl}>เปิดรายการ</ExternalLink> },
  ],
  fields: [
    ownerField,
    { name: "platform", label: "แพลตฟอร์ม", type: "select", options: PLATFORM_OPTIONS, defaultValue: "shopee" },
    { name: "displayName", label: "ชื่อบัญชี", type: "text", required: true },
    {
      name: "mailboxId",
      label: "เมลที่ใช้",
      type: "relation",
      relation: { endpoint: "/api/mailboxes", label: (row: Row) => String(row.address), scopedToOwner: true },
    },
    { name: "status", label: "สถานะ", type: "select", options: statusOptions("account"), defaultValue: "not_started" },
    { name: "statusReason", label: "เหตุผลของสถานะ", type: "text", help: "เช่น สาเหตุที่ถูกปฏิเสธหรือถูกระงับ" },
    vaultField,
    notesField,
  ],
};

export default function AccountsPage() {
  return <ResourcePage config={config} />;
}
