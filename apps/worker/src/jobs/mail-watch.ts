import type { OAuthConnection, PrismaClient } from "@hub/db";
import {
  classifyMail,
  decryptToken,
  encryptToken,
  ReauthRequiredError,
  refreshGmailToken,
  type GmailClient,
  type GmailMessage,
  type GoogleCredentials,
} from "@hub/integrations";
import { notify } from "../notify";

export const MAIL_QUERY = "newer_than:14d (from:shopee OR from:facebookmail OR from:facebook OR from:meta)";
const EXPIRY_MARGIN_MS = 60_000;

export interface MailWatchDeps {
  gmail: GmailClient;
  credentials: GoogleCredentials | null;
  tokenKey: string | null;
  refresh?: typeof refreshGmailToken;
}

async function accessTokenFor(db: PrismaClient, connection: OAuthConnection, deps: MailWatchDeps & { credentials: GoogleCredentials; tokenKey: string }) {
  if (connection.expiresAt && connection.expiresAt.getTime() > Date.now() + EXPIRY_MARGIN_MS) {
    return decryptToken(connection.accessTokenEnc, deps.tokenKey);
  }
  if (!connection.refreshTokenEnc) throw new ReauthRequiredError("No refresh token stored");
  const refreshToken = decryptToken(connection.refreshTokenEnc, deps.tokenKey);
  const tokens = await (deps.refresh ?? refreshGmailToken)(deps.credentials, refreshToken);
  await db.oAuthConnection.update({
    where: { id: connection.id },
    data: {
      accessTokenEnc: encryptToken(tokens.accessToken, deps.tokenKey),
      refreshTokenEnc: tokens.refreshToken ? encryptToken(tokens.refreshToken, deps.tokenKey) : undefined,
      expiresAt: tokens.expiresAt,
    },
  });
  return tokens.accessToken;
}

/** ตัดสินใจจากข้อมูลล่าสุดและบันทึกผลแบบ atomic เพื่อไม่ให้อีเมลฉบับเดิมเปลี่ยนสถานะซ้ำ */
async function processMessage(db: PrismaClient, connection: OAuthConnection, mailboxId: string, message: GmailMessage) {
  const result = classifyMail(message);
  if (!result.platform) return;

  await db.$transaction(async (tx) => {
    const existing = await tx.emailEvent.findUnique({
      where: { connectionId_gmailMessageId: { connectionId: connection.id, gmailMessageId: message.id } },
      select: { id: true },
    });
    if (existing) return;

    const accounts = await tx.platformAccount.findMany({ where: { mailboxId, platform: result.platform! } });
    const account = accounts.length === 1 ? accounts[0]! : null;
    const base = {
      connectionId: connection.id,
      mailboxId,
      gmailMessageId: message.id,
      fromAddress: message.from.slice(0, 320),
      subject: message.subject.slice(0, 500),
      receivedAt: message.receivedAt,
      platform: result.platform,
      classification: result.classification,
    };

    let reviewReason: string | null = null;
    if (!result.confident) reviewReason = result.reason;
    else if (result.classification === "unknown") reviewReason = "ไม่ทราบความหมายของอีเมล";
    else if (!account) reviewReason = accounts.length === 0 ? "ไม่พบบัญชีที่ผูกกับเมลนี้" : "เมลนี้ผูกกับหลายบัญชีบนแพลตฟอร์มเดียวกัน";
    else if (message.receivedAt <= account.statusChangedAt) reviewReason = "อีเมลเก่ากว่าสถานะปัจจุบัน";

    if (reviewReason) {
      await tx.emailEvent.create({ data: { ...base, reason: reviewReason, outcome: "needs_review", platformAccountId: account?.id } });
      return;
    }

    const status = result.classification as "approved" | "rejected" | "suspended";
    const updated = await tx.platformAccount.update({
      where: { id: account!.id },
      data: { status, statusChangedAt: message.receivedAt, statusReason: `จากอีเมล: ${message.subject}`.slice(0, 1000) },
    });
    await tx.auditLog.create({
      data: {
        actorId: null,
        action: "update",
        entityType: "platform_account",
        entityId: account!.id,
        before: JSON.parse(JSON.stringify(account)),
        after: JSON.parse(JSON.stringify(updated)),
      },
    });
    await tx.emailEvent.create({
      data: { ...base, reason: result.reason, outcome: "applied", platformAccountId: account!.id, resolvedAt: new Date() },
    });
  });
}

export async function runMailWatch(db: PrismaClient, deps: MailWatchDeps): Promise<void> {
  const { credentials, tokenKey } = deps;
  if (!credentials || !tokenKey) return;
  const connections = await db.oAuthConnection.findMany({
    where: { provider: "google_gmail", status: "active", mailboxId: { not: null } },
  });

  for (const connection of connections) {
    try {
      const accessToken = await accessTokenFor(db, connection, { ...deps, credentials, tokenKey });
      const ids = await deps.gmail.listMessageIds(accessToken, MAIL_QUERY);
      const known = new Set(
        (
          await db.emailEvent.findMany({
            where: { connectionId: connection.id, gmailMessageId: { in: ids } },
            select: { gmailMessageId: true },
          })
        ).map((event) => event.gmailMessageId),
      );
      const messages = await Promise.all(ids.filter((id) => !known.has(id)).map((id) => deps.gmail.getMessage(accessToken, id)));
      // เก่าไปใหม่ เพื่อให้สถานะสุดท้ายมาจากอีเมลล่าสุด
      messages.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
      for (const message of messages) await processMessage(db, connection, connection.mailboxId!, message);
      await db.oAuthConnection.update({ where: { id: connection.id }, data: { lastSyncAt: new Date(), lastError: null } });
    } catch (error) {
      const reauth = error instanceof ReauthRequiredError;
      const message = reauth ? "ต้องเชื่อม Gmail ใหม่" : "อ่านเมลไม่สำเร็จ ระบบจะลองใหม่รอบถัดไป";
      console.error(`[worker] mail watch failed for ${connection.id}`, error instanceof Error ? error.message : error);
      await db.oAuthConnection.update({
        where: { id: connection.id },
        data: { lastError: message, status: reauth ? "needs_reauth" : undefined },
      });
      if (reauth) {
        await notify(db, {
          severity: "warning",
          title: `ต้องเชื่อม Gmail ใหม่: ${connection.accountLabel}`,
          link: "/connections",
          dedupeKey: `gmail-reauth:${connection.id}:${connection.updatedAt.toISOString()}`,
        });
      }
    }
  }
}
