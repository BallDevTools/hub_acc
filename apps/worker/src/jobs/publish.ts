import type { PrismaClient } from "@hub/db";
import { decryptToken, MetaApiError, type MetaClient } from "@hub/integrations";
import { notify } from "../notify";

export interface PublishDeps {
  meta: MetaClient;
  tokenKey: string | null;
  now?: () => Date;
}

const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 2 * 60_000;
const STUCK_AFTER_MS = 10 * 60_000;

export async function runPublishPosts(db: PrismaClient, deps: PublishDeps): Promise<void> {
  const now = deps.now?.() ?? new Date();

  // งานที่ค้างเพราะ worker ดับระหว่างโพสต์ อาจขึ้น Page ไปแล้ว จึงให้คนตรวจแทนการโพสต์ซ้ำ
  const stuck = await db.postJob.findMany({
    where: { status: "publishing", updatedAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) } },
    select: { id: true },
  });
  for (const { id } of stuck) {
    const { count } = await db.postJob.updateMany({
      where: { id, status: "publishing" },
      data: { status: "unknown", lastError: "งานค้างระหว่างโพสต์ กรุณาตรวจที่ Page" },
    });
    if (count) await notifyUnknown(db, id);
  }

  const due = await db.postJob.findMany({
    where: {
      status: "scheduled",
      scheduledAt: { lte: now },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: { scheduledAt: "asc" },
    take: BATCH_SIZE,
    select: { id: true },
  });

  for (const { id } of due) await publishOne(db, deps, id, now);
}

async function notifyUnknown(db: PrismaClient, jobId: string) {
  await notify(db, {
    severity: "warning",
    title: "มีโพสต์ที่ต้องตรวจที่ Page",
    body: "ระบบไม่แน่ใจว่าโพสต์ขึ้นแล้วหรือยัง จึงไม่ลองซ้ำเอง",
    link: "/schedule?status=unknown",
    dedupeKey: `post-unknown:${jobId}`,
  });
}

async function publishOne(db: PrismaClient, deps: PublishDeps, id: string, now: Date) {
  // ทำแบบมีเงื่อนไขเพื่อให้ worker หลายตัวหยิบงานเดียวกันไม่ได้ และเคารพการยกเลิกล่าสุด
  const { count } = await db.postJob.updateMany({
    where: { id, status: "scheduled" },
    data: { status: "publishing", attempts: { increment: 1 } },
  });
  if (count === 0) return;

  const job = await db.postJob.findUniqueOrThrow({
    where: { id },
    include: { contentItem: true, page: { include: { connection: true } } },
  });

  const fail = async (message: string) => {
    await db.postJob.update({ where: { id }, data: { status: "failed", lastError: message } });
    await notify(db, {
      severity: "critical",
      title: `โพสต์ไม่สำเร็จ: ${job.page.name}`,
      body: message,
      link: "/schedule?status=failed",
      dedupeKey: `post-failed:${id}:${job.attempts}`,
    });
  };

  if (job.contentItem.status !== "approved") return fail("คอนเทนต์ถูกแก้ไขหรือยกเลิกการอนุมัติหลังตั้งเวลา");
  const connection = job.page.connection;
  if (!job.page.metaPageId || !connection) return fail("Page ยังไม่ได้เชื่อมกับ Facebook");
  if (connection.status !== "active") return fail("ต้องเชื่อม Facebook Page ใหม่");
  if (!deps.tokenKey) return fail("ระบบยังไม่ได้ตั้งค่า TOKEN_ENCRYPTION_KEY");

  try {
    const externalPostId = await deps.meta.publishPost(job.page.metaPageId, decryptToken(connection.accessTokenEnc, deps.tokenKey), {
      message: job.contentItem.body,
      link: job.contentItem.link,
    });
    await db.postJob.update({
      where: { id },
      data: { status: "published", externalPostId, publishedAt: new Date(), lastError: null, nextAttemptAt: null },
    });
  } catch (error) {
    const kind = error instanceof MetaApiError ? error.kind : "ambiguous";
    const message = error instanceof Error ? error.message.slice(0, 500) : "เกิดข้อผิดพลาด";
    console.error(`[worker] publish ${id} failed (${kind})`, message);

    if (kind === "rate_limit" && job.attempts < MAX_ATTEMPTS) {
      await db.postJob.update({
        where: { id },
        data: {
          status: "scheduled",
          lastError: message,
          nextAttemptAt: new Date(now.getTime() + BASE_BACKOFF_MS * 2 ** (job.attempts - 1)),
        },
      });
      return;
    }
    if (kind === "ambiguous") {
      await db.postJob.update({ where: { id }, data: { status: "unknown", lastError: message } });
      await notifyUnknown(db, id);
      return;
    }
    if (kind === "auth") {
      await db.oAuthConnection.update({
        where: { id: connection.id },
        data: { status: "needs_reauth", lastError: "ต้องเชื่อม Facebook Page ใหม่" },
      });
    }
    await fail(kind === "auth" ? "สิทธิ์ของ Facebook Page หมดอายุ ต้องเชื่อมใหม่" : message);
  }
}
