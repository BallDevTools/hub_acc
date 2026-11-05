import { createDb } from "@hub/db";
import { assertValidKey, createPageKitGenerator, httpGmailClient, httpMetaClient, QUEUES } from "@hub/integrations";
import { PgBoss } from "pg-boss";
import { runMailWatch } from "./jobs/mail-watch";
import { HEARTBEAT_FILE, runHeartbeat } from "./jobs/heartbeat";
import { runCollectMetrics } from "./jobs/metrics";
import { runDailySummary, runDeliverNotifications } from "./jobs/notifications";
import { runGeneratePageKit } from "./jobs/page-kit";
import { runPublishPosts } from "./jobs/publish";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const db = createDb(connectionString);
const boss = new PgBoss(connectionString);
boss.on("error", (error) => console.error("[worker] pg-boss error", error));

const generator = process.env.ANTHROPIC_API_KEY
  ? createPageKitGenerator(process.env.ANTHROPIC_API_KEY, process.env.CLAUDE_MODEL || undefined)
  : null;
const googleCredentials =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET }
    : null;
const tokenKey = process.env.TOKEN_ENCRYPTION_KEY || null;
if (tokenKey) assertValidKey(tokenKey);

await boss.start();
for (const queue of Object.values(QUEUES)) await boss.createQueue(queue);

await boss.schedule(QUEUES.cleanupSessions, "0 * * * *");
await boss.work(QUEUES.cleanupSessions, async () => {
  const { count } = await db.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  console.log(`[worker] removed ${count} expired sessions`);
});

await boss.work<{ pageKitId: string }>(QUEUES.generatePageKit, async (jobs) => {
  for (const job of jobs) await runGeneratePageKit(db, generator, job.data.pageKitId);
});

await boss.schedule(QUEUES.watchMail, "*/5 * * * *");
await boss.work(QUEUES.watchMail, () =>
  runMailWatch(db, { gmail: httpGmailClient, credentials: googleCredentials, tokenKey }),
);

await boss.schedule(QUEUES.publishPosts, "* * * * *");
await boss.work(QUEUES.publishPosts, () => runPublishPosts(db, { meta: httpMetaClient, tokenKey }));

const metricNames = (process.env.META_INSIGHT_METRICS ?? "page_media_view,page_total_media_view_unique,page_follows")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);
await boss.schedule(QUEUES.collectMetrics, "30 2 * * *", null, { tz: "Asia/Bangkok" });
await boss.work(QUEUES.collectMetrics, () =>
  runCollectMetrics(db, { meta: httpMetaClient, tokenKey, metrics: metricNames }),
);

await boss.schedule(QUEUES.dailySummary, "0 8 * * *", null, { tz: "Asia/Bangkok" });
await boss.work(QUEUES.dailySummary, () => runDailySummary(db));

await boss.schedule(QUEUES.deliverNotifications, "* * * * *");
await boss.work(QUEUES.deliverNotifications, () =>
  runDeliverNotifications(db, { webhookUrl: process.env.NOTIFY_WEBHOOK_URL || null, webOrigin: process.env.WEB_ORIGIN || null }),
);

const heartbeatDeps = { file: HEARTBEAT_FILE, pingUrl: process.env.HEALTHCHECK_PING_URL || null };
await boss.schedule(QUEUES.heartbeat, "* * * * *");
await boss.work(QUEUES.heartbeat, () => runHeartbeat(db, heartbeatDeps));
await runHeartbeat(db, heartbeatDeps);

console.log("[worker] started");

const shutdown = async () => {
  await boss.stop({ graceful: true });
  await db.$disconnect();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
