import type { Field, Row } from "@/components/resource-page";
import { FIELD_LABELS } from "@/lib/labels";

export const ownerField: Field = {
  name: "ownerId",
  label: FIELD_LABELS.ownerId!,
  type: "relation",
  required: true,
  relation: { endpoint: "/api/owners", label: (row: Row) => String(row.name) },
};

export const vaultField: Field = {
  name: "vaultUrl",
  label: FIELD_LABELS.vaultUrl!,
  type: "url",
  help: "ใส่เฉพาะลิงก์ https ไปยังรายการใน password manager ห้ามใส่รหัสผ่าน",
};

export const notesField: Field = {
  name: "notes",
  label: FIELD_LABELS.notes!,
  type: "textarea",
  help: "ห้ามใส่รหัสผ่านหรือรหัส 2FA",
};
