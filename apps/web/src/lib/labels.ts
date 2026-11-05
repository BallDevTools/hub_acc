export type Tone = "good" | "warning" | "serious" | "critical" | "neutral";

export const STATUS: Record<string, Record<string, { label: string; tone: Tone }>> = {
  owner: {
    active: { label: "ใช้งาน", tone: "good" },
    inactive: { label: "ไม่ใช้งาน", tone: "neutral" },
  },
  mailbox: {
    pending: { label: "รอตั้งค่า", tone: "warning" },
    active: { label: "ใช้งาน", tone: "good" },
    issue: { label: "มีปัญหา", tone: "serious" },
    disabled: { label: "ปิดใช้งาน", tone: "neutral" },
  },
  account: {
    not_started: { label: "ยังไม่เริ่ม", tone: "neutral" },
    in_progress: { label: "กำลังสมัคร", tone: "warning" },
    pending_review: { label: "รออนุมัติ", tone: "warning" },
    approved: { label: "อนุมัติแล้ว", tone: "good" },
    rejected: { label: "ถูกปฏิเสธ", tone: "critical" },
    suspended: { label: "ถูกระงับ", tone: "critical" },
  },
  page: {
    draft: { label: "เตรียมข้อมูล", tone: "neutral" },
    active: { label: "เปิดใช้งาน", tone: "good" },
    restricted: { label: "ถูกจำกัด", tone: "critical" },
    archived: { label: "เก็บถาวร", tone: "neutral" },
  },
};

export const statusOptions = (group: keyof typeof STATUS) =>
  Object.entries(STATUS[group]!).map(([value, { label }]) => ({ value, label }));

export const PLATFORM_LABELS: Record<string, string> = { shopee: "Shopee Affiliate", facebook: "Facebook" };
export const PLATFORM_OPTIONS = Object.entries(PLATFORM_LABELS).map(([value, label]) => ({ value, label }));
export const PROVIDER_OPTIONS = [
  { value: "gmail", label: "Gmail" },
  { value: "workspace", label: "Google Workspace" },
  { value: "other", label: "อื่น ๆ" },
];
export const ROLE_LABELS: Record<string, string> = { admin: "Admin", member: "สมาชิก" };
export const ENTITY_LABELS: Record<string, string> = {
  user: "ผู้ใช้",
  owner: "เจ้าของบัญชี",
  mailbox: "เมล",
  platform_account: "บัญชีแพลตฟอร์ม",
  page: "Page",
};
export const ACTION_LABELS: Record<string, string> = { create: "สร้าง", update: "แก้ไข", delete: "ลบ" };
export const FIELD_LABELS: Record<string, string> = {
  name: "ชื่อ",
  team: "ทีม",
  contactEmail: "อีเมลติดต่อ",
  managerId: "ผู้ดูแล",
  status: "สถานะ",
  notes: "หมายเหตุ",
  ownerId: "เจ้าของบัญชี",
  address: "ที่อยู่เมล",
  provider: "ผู้ให้บริการ",
  twoFactorEnabled: "2FA",
  vaultUrl: "ลิงก์ password manager",
  mailboxId: "เมล",
  platform: "แพลตฟอร์ม",
  displayName: "ชื่อบัญชี",
  statusReason: "เหตุผลของสถานะ",
  platformAccountId: "บัญชี Facebook",
  url: "ลิงก์ Page",
  email: "อีเมล",
  role: "สิทธิ์",
  active: "เปิดใช้งาน",
};

const dateFormat = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" });
export const formatDate = (value: string | null | undefined) => (value ? dateFormat.format(new Date(value)) : "—");
