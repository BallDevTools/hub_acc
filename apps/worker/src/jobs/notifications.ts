import type { PrismaClient } from "@hub/db";
import { notify } from "../notify";

const STALE_ACCOUNT_DAYS = 14;
const BATCH_SIZE = 20;
const MAX_MESSAGE = 1800;

const bangkokDate = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

export async function runDailySummary(db: PrismaClient, now: Date = new Date()): Promise<void> {
  const staleBefore = new Date(now.getTime() - STALE_ACCOUNT_DAYS * 24 * 60 * 60 * 1000);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [overdue, stale, inbox, failedPosts, published, rejected] = await Promise.all([
    db.onboardingTask.count({ where: { status: "todo", dueAt: { lt: now } } }),
    db.platformAccount.count({ where: { status: { in: ["in_progress", "pending_review"] }, statusChangedAt: { lt: staleBefore } } }),
    db.emailEvent.count({ where: { outcome: "needs_review" } }),
    db.postJob.count({ where: { status: { in: ["failed", "unknown"] } } }),
    db.postJob.count({ where: { status: "published", publishedAt: { gte: dayAgo } } }),
    db.platformAccount.count({ where: { status: { in: ["rejected", "suspended"] }, statusChangedAt: { gte: dayAgo } } }),
  ]);
  const lines = [
    `โพสต์สำเร็จใน 24 ชั่วโมง: ${published}`,
    `โพสต์ที่ต้องจัดการ: ${failedPosts}`,
    `บัญชีถูกปฏิเสธหรือระงับใหม่: ${rejected}`,
    `อีเมลรอตรวจ: ${inbox}`,
    `งานเกินกำหนด: ${overdue}`,
    `บัญชีค้างเกิน ${STALE_ACCOUNT_DAYS} วัน: ${stale}`,
  ];
  const needsAction = failedPosts + rejected + inbox + overdue + stale > 0;
  await notify(db, {
    severity: needsAction ? "warning" : "info",
    title: `สรุปประจำวัน ${bangkokDate(now)}`,
    body: lines.join("\n"),
    link: "/",
    dedupeKey: `daily:${bangkokDate(now)}`,
  });
}

export interface DeliveryDeps {
  webhookUrl: string | null;
  webOrigin: string | null;
  send?: (url: string, body: object) => Promise<void>;
}

async function postWebhook(url: string, body: object) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Webhook responded ${response.status}`);
}

export async function runDeliverNotifications(db: PrismaClient, deps: DeliveryDeps): Promise<void> {
  if (!deps.webhookUrl) return;
  const send = deps.send ?? postWebhook;
  const pending = await db.notification.findMany({ where: { deliveredAt: null }, orderBy: { createdAt: "asc" }, take: BATCH_SIZE });
  for (const item of pending) {
    const link = item.link && deps.webOrigin ? `\n${deps.webOrigin}${item.link}` : "";
    const message = `${item.title}${item.body ? `\n${item.body}` : ""}${link}`.slice(0, MAX_MESSAGE);
    try {
      await send(deps.webhookUrl, { text: message, content: message });
      await db.notification.update({ where: { id: item.id }, data: { deliveredAt: new Date() } });
    } catch (error) {
      // หยุดรอบนี้แล้วลองใหม่นาทีถัดไป เพื่อรักษาลำดับและไม่ยิงซ้ำถี่เมื่อปลายทางล่ม
      console.error("[worker] webhook delivery failed", error instanceof Error ? error.message : error);
      return;
    }
  }
}
