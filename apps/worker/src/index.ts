import { createDb } from "@hub/db";
import { createPageKitGenerator, httpGmailClient, QUEUES } from "@hub/integrations";
import { PgBoss } from "pg-boss";
import { runMailWatch } from "./jobs/mail-watch";
import { runGeneratePageKit } from "./jobs/page-kit";

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

console.log("[worker] started");

const shutdown = async () => {
  await boss.stop({ graceful: true });
  await db.$disconnect();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
