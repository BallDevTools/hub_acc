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
export const ENTITY_TYPES = ["user", "owner", "mailbox", "platform_account", "page"] as const;

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
