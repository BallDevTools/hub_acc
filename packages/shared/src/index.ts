import { z } from "zod";

export const USER_ROLES = ["admin", "member"] as const;
export const OWNER_STATUSES = ["active", "inactive"] as const;
export const MAILBOX_PROVIDERS = ["gmail", "workspace", "other"] as const;
export const MAILBOX_STATUSES = ["pending", "active", "issue", "disabled"] as const;
export const PLATFORMS = ["shopee", "facebook"] as const;
export const ACCOUNT_STATUSES = [
  "not_started",
  "in_progress",
  "pending_review",
  "approved",
  "rejected",
  "suspended",
] as const;
export const PAGE_STATUSES = ["draft", "active", "restricted", "archived"] as const;
export const CONTENT_STATUSES = ["draft", "approved", "archived"] as const;
export const POST_JOB_STATUSES = ["scheduled", "publishing", "published", "failed", "unknown", "cancelled"] as const;
export const TASK_STATUSES = ["todo", "done", "skipped"] as const;
export const ENTITY_TYPES = [
  "user",
  "owner",
  "mailbox",
  "platform_account",
  "page",
  "onboarding_task",
  "page_kit",
  "connection",
  "content_item",
  "post_job",
] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type EntityType = (typeof ENTITY_TYPES)[number];

const trimmed = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional();

const emailAddress = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254));

const httpsUrl = z
  .string()
  .trim()
  .max(2048)
  .pipe(z.url({ protocol: /^https$/ }));

const optionalHttpsUrl = z
  .union([z.literal("").transform(() => null), httpsUrl])
  .nullable()
  .optional();

const id = z.uuid();

export const ownerCreateSchema = z.strictObject({
  name: trimmed(200),
  team: optionalText(120),
  contactEmail: z
    .union([z.literal("").transform(() => null), emailAddress])
    .nullable()
    .optional(),
  managerId: id.nullable().optional(),
  status: z.enum(OWNER_STATUSES).optional(),
  notes: optionalText(5000),
});
export const ownerUpdateSchema = ownerCreateSchema.partial();

export const mailboxCreateSchema = z.strictObject({
  ownerId: id,
  address: emailAddress,
  provider: z.enum(MAILBOX_PROVIDERS).optional(),
  status: z.enum(MAILBOX_STATUSES).optional(),
  twoFactorEnabled: z.boolean().optional(),
  vaultUrl: optionalHttpsUrl,
  notes: optionalText(5000),
});
export const mailboxUpdateSchema = mailboxCreateSchema.partial();

export const platformAccountCreateSchema = z.strictObject({
  ownerId: id,
  mailboxId: id.nullable().optional(),
  platform: z.enum(PLATFORMS),
  displayName: trimmed(200),
  status: z.enum(ACCOUNT_STATUSES).optional(),
  statusReason: optionalText(1000),
  vaultUrl: optionalHttpsUrl,
  notes: optionalText(5000),
});
export const platformAccountUpdateSchema = platformAccountCreateSchema.partial();

export const pageCreateSchema = z.strictObject({
  ownerId: id,
  platformAccountId: id.nullable().optional(),
  name: trimmed(200),
  url: optionalHttpsUrl,
  subId: z
    .union([z.literal("").transform(() => null), z.string().trim().regex(/^[A-Za-z0-9_-]{1,64}$/)])
    .nullable()
    .optional(),
  status: z.enum(PAGE_STATUSES).optional(),
  notes: optionalText(5000),
});
export const pageUpdateSchema = pageCreateSchema.partial();

export const userCreateSchema = z.strictObject({
  email: emailAddress,
  name: optionalText(200),
  role: z.enum(USER_ROLES).optional(),
});
export const userUpdateSchema = z.strictObject({
  name: optionalText(200),
  role: z.enum(USER_ROLES).optional(),
  active: z.boolean().optional(),
});

export const listQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.string().trim().max(40).optional(),
  platform: z.enum(PLATFORMS).optional(),
  ownerId: id.optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  entityType: z.enum(ENTITY_TYPES).optional(),
  entityId: id.optional(),
});

export const taskUpdateSchema = z.strictObject({
  status: z.enum(TASK_STATUSES).optional(),
  assigneeId: id.nullable().optional(),
  dueAt: z.iso.datetime().nullable().optional(),
});

export const pageKitCreateSchema = z.strictObject({
  ownerId: id,
  category: trimmed(200),
  audience: optionalText(500),
  tone: optionalText(200),
});

export const pageKitDraftsSchema = z.object({
  names: z.array(z.string()),
  description: z.string(),
  firstPosts: z.array(z.string()),
});
export type PageKitDrafts = z.infer<typeof pageKitDraftsSchema>;

export const inboxResolveSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("dismiss") }),
  z.strictObject({
    action: z.literal("apply"),
    platformAccountId: id,
    status: z.enum(ACCOUNT_STATUSES),
  }),
]);

export const contentCreateSchema = z.strictObject({
  title: trimmed(200),
  body: trimmed(10000),
  link: optionalHttpsUrl,
});
export const contentUpdateSchema = contentCreateSchema.partial();

export const postJobCreateSchema = z.strictObject({
  contentItemId: id,
  pageIds: z.array(id).min(1).max(200),
  scheduledAt: z.iso.datetime(),
});

export const postJobListSchema = listQuerySchema.extend({ pageId: id.optional() });

export const postJobRetrySchema = z.strictObject({
  /** ใช้กับสถานะ unknown ซึ่งโพสต์อาจขึ้นไปแล้ว ผู้ใช้ต้องยืนยันว่าตรวจ Page แล้ว */
  confirmNotPosted: z.boolean().optional(),
});

export const connectMetaPageSchema = z.strictObject({ metaPageId: z.string().regex(/^\d{1,32}$/) });

export const CSV_FIELDS = ["orderId", "itemKey", "orderedAt", "status", "amount", "commission", "subId"] as const;
export type CsvField = (typeof CSV_FIELDS)[number];
export const REQUIRED_CSV_FIELDS: CsvField[] = ["orderId", "orderedAt", "status", "amount", "commission"];

const MAX_CSV_CHARS = 15_000_000;

export const csvPreviewSchema = z.strictObject({ csv: z.string().min(1).max(MAX_CSV_CHARS) });
export const csvImportSchema = z.strictObject({
  csv: z.string().min(1).max(MAX_CSV_CHARS),
  fileName: trimmed(255),
  mapping: z.record(z.enum(CSV_FIELDS), z.string().max(200)),
});

export const REPORT_GRANULARITIES = ["day", "week", "month"] as const;
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const reportQuerySchema = z.object({
  from: isoDay,
  to: isoDay,
  granularity: z.enum(REPORT_GRANULARITIES).default("day"),
});

export const devLoginSchema = z.strictObject({ email: emailAddress });

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
}

export interface DashboardSummary {
  totals: { owners: number; mailboxes: number; platformAccounts: number; pages: number };
  accountsByStatus: Record<(typeof PLATFORMS)[number], Record<(typeof ACCOUNT_STATUSES)[number], number>>;
  mailboxesByStatus: Record<(typeof MAILBOX_STATUSES)[number], number>;
  pagesByStatus: Record<(typeof PAGE_STATUSES)[number], number>;
  mailboxesWithout2fa: number;
  actions: {
    overdueTasks: number;
    staleAccounts: number;
    inboxNeedsReview: number;
    postsNeedingAttention: number;
    connectionsNeedingReauth: number;
  };
  attention: Array<{
    id: string;
    displayName: string;
    platform: (typeof PLATFORMS)[number];
    status: (typeof ACCOUNT_STATUSES)[number];
    statusReason: string | null;
    statusChangedAt: string;
    ownerName: string;
  }>;
}

export interface OnboardingStep {
  key: string;
  title: string;
  description: string;
  url?: string;
  /** ข้อมูลของเจ้าของบัญชีที่ควรมีปุ่มคัดลอกในขั้นตอนนี้ */
  copy?: Array<"name" | "contactEmail" | "mailbox">;
}

export const ONBOARDING_TEMPLATES: Record<string, { title: string; steps: OnboardingStep[] }> = {
  shopee_affiliate: {
    title: "Shopee Affiliate",
    steps: [
      {
        key: "prepare",
        title: "เตรียมข้อมูลของเจ้าของบัญชี",
        description: "เตรียมข้อมูลจริงที่ต้องใช้สมัคร และให้เจ้าของบัญชีเป็นคนตรวจสอบ",
        copy: ["name", "contactEmail", "mailbox"],
      },
      {
        key: "apply",
        title: "เจ้าของบัญชีสมัครด้วยตัวเอง",
        description: "เปิดหน้า Shopee Affiliate แล้วกรอก ยืนยันตัวตน และยอมรับเงื่อนไขด้วยตัวเอง",
        url: "https://affiliate.shopee.co.th/",
        copy: ["name", "mailbox"],
      },
      {
        key: "record",
        title: "บันทึกบัญชีในระบบ",
        description: "เพิ่มบัญชีในหน้าบัญชีแพลตฟอร์ม และตั้งสถานะเป็นรออนุมัติ",
      },
      {
        key: "watch",
        title: "เชื่อมเมลเพื่อติดตามผล",
        description: "เชื่อม Gmail ของบัญชีนี้ในหน้าเชื่อมต่อ เพื่อให้ระบบช่วยตามผลอนุมัติ",
      },
    ],
  },
  facebook_page: {
    title: "Facebook Page",
    steps: [
      {
        key: "kit",
        title: "เตรียมชุดข้อมูล Page",
        description: "สร้าง Page Kit แล้วเลือกชื่อ คำอธิบาย และโพสต์แรก",
      },
      {
        key: "create",
        title: "เจ้าของบัญชีสร้าง Page ด้วยบัญชีจริงของตัวเอง",
        description: "สร้าง Page จากบัญชี Facebook ส่วนตัวที่มีอยู่แล้ว ไม่ต้องสมัครบัญชีเพิ่ม",
        url: "https://www.facebook.com/pages/create",
      },
      {
        key: "portfolio",
        title: "เพิ่ม Page เข้า Business Portfolio",
        description: "เพิ่ม Page และกำหนดสิทธิ์ของทีม",
        url: "https://business.facebook.com/",
      },
      {
        key: "record",
        title: "บันทึก Page ในระบบ",
        description: "เพิ่ม Page พร้อมลิงก์ และตั้งสถานะเป็นเปิดใช้งาน",
      },
    ],
  },
};
