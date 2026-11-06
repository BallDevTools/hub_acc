import type { Prisma, PrismaClient } from "@hub/db";
import {
  ACCOUNT_STATUSES,
  MAILBOX_STATUSES,
  OWNER_STATUSES,
  PAGE_STATUSES,
  mailboxCreateSchema,
  mailboxUpdateSchema,
  ownerCreateSchema,
  ownerUpdateSchema,
  pageCreateSchema,
  pageUpdateSchema,
  platformAccountCreateSchema,
  platformAccountUpdateSchema,
} from "@hub/shared";
import type { FastifyInstance } from "fastify";
import { registerCrud, type Row } from "../crud";
import { HttpError } from "../errors";
import { createOnboardingTasks } from "./onboarding";

const invalid = (message: string) => new HttpError(409, "invalid_relation", message);

async function assertMailboxBelongsToOwner(tx: Prisma.TransactionClient, mailboxId: unknown, ownerId: unknown) {
  if (!mailboxId) return;
  const mailbox = await tx.mailbox.findUnique({ where: { id: String(mailboxId) } });
  if (!mailbox || mailbox.ownerId !== ownerId) {
    throw invalid("เมลนี้ไม่ได้เป็นของเจ้าของบัญชีที่เลือก");
  }
}

async function assertFacebookAccountBelongsToOwner(tx: Prisma.TransactionClient, accountId: unknown, ownerId: unknown) {
  if (!accountId) return;
  const account = await tx.platformAccount.findUnique({ where: { id: String(accountId) } });
  if (!account || account.ownerId !== ownerId || account.platform !== "facebook") {
    throw invalid("Page ต้องเชื่อมกับบัญชี Facebook ของเจ้าของบัญชีเดียวกัน");
  }
}

const ownerFilter = (query: { ownerId?: string }) => (query.ownerId ? { ownerId: query.ownerId } : {});
const ownerSummary = { select: { id: true, name: true } };

export function registerResourceRoutes(app: FastifyInstance, db: PrismaClient): void {
  registerCrud(app, db, {
    path: "/api/owners",
    entityType: "owner",
    delegate: (client) => client.owner,
    createSchema: ownerCreateSchema,
    updateSchema: ownerUpdateSchema,
    searchFields: ["name", "team", "contactEmail"],
    statuses: OWNER_STATUSES,
    afterCreate: (tx, owner) => createOnboardingTasks(tx, owner.id),
    include: {
      manager: { select: { id: true, name: true, email: true } },
      _count: { select: { mailboxes: true, platformAccounts: true, pages: true } },
    },
  });

  registerCrud(app, db, {
    path: "/api/mailboxes",
    entityType: "mailbox",
    delegate: (client) => client.mailbox,
    createSchema: mailboxCreateSchema,
    updateSchema: mailboxUpdateSchema,
    searchFields: ["address", "notes"],
    statuses: MAILBOX_STATUSES,
    include: { owner: ownerSummary },
    extraFilters: ownerFilter,
    validate: async (tx, next, current) => {
      if (current && next.ownerId !== current.ownerId) {
        const linked = await tx.platformAccount.count({ where: { mailboxId: current.id } });
        if (linked > 0) throw invalid("เปลี่ยนเจ้าของไม่ได้ เพราะเมลนี้ยังเชื่อมกับบัญชีแพลตฟอร์ม");
      }
    },
  });

  registerCrud(app, db, {
    path: "/api/platform-accounts",
    entityType: "platform_account",
    delegate: (client) => client.platformAccount,
    createSchema: platformAccountCreateSchema,
    updateSchema: platformAccountUpdateSchema,
    searchFields: ["displayName", "statusReason", "notes"],
    statuses: ACCOUNT_STATUSES,
    include: { owner: ownerSummary, mailbox: { select: { id: true, address: true } } },
    extraFilters: (query) => ({
      ...ownerFilter(query),
      ...(query.platform ? { platform: query.platform } : {}),
    }),
    beforeUpdate: (changes, current: Row) => {
      if (changes.status === undefined || changes.status === current.status) return changes;
      return {
        ...changes,
        statusChangedAt: new Date(),
        // เหตุผลเดิมอธิบายสถานะเดิม จึงล้างออกถ้าไม่ได้ส่งเหตุผลใหม่มา
        statusReason: changes.statusReason ?? null,
      };
    },
    validate: async (tx, next, current) => {
      await assertMailboxBelongsToOwner(tx, next.mailboxId, next.ownerId);
      if (current && (next.ownerId !== current.ownerId || next.platform !== current.platform)) {
        const linked = await tx.page.count({ where: { platformAccountId: current.id } });
        if (linked > 0) throw invalid("เปลี่ยนเจ้าของหรือแพลตฟอร์มไม่ได้ เพราะบัญชีนี้ยังเชื่อมกับ Page");
      }
    },
  });

  registerCrud(app, db, {
    path: "/api/pages",
    entityType: "page",
    delegate: (client) => client.page,
    createSchema: pageCreateSchema,
    updateSchema: pageUpdateSchema,
    searchFields: ["name", "url", "subId", "notes"],
    statuses: PAGE_STATUSES,
    include: {
      owner: ownerSummary,
      platformAccount: { select: { id: true, displayName: true } },
      connection: { select: { status: true } },
    },
    extraFilters: ownerFilter,
    validate: (tx, next) => assertFacebookAccountBelongsToOwner(tx, next.platformAccountId, next.ownerId),
  });
}
