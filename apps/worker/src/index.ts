import { createDb } from "@hub/db";
import { PgBoss } from "pg-boss";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const CLEANUP_SESSIONS = "cleanup-expired-sessions";

const db = createDb(connectionString);
const boss = new PgBoss(connectionString);
boss.on("error", (error) => console.error("[worker] pg-boss error", error));

await boss.start();
await boss.createQueue(CLEANUP_SESSIONS);
await boss.schedule(CLEANUP_SESSIONS, "0 * * * *");
await boss.work(CLEANUP_SESSIONS, async () => {
  const { count } = await db.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  console.log(`[worker] removed ${count} expired sessions`);
});
console.log("[worker] started");

const shutdown = async () => {
  await boss.stop({ graceful: true });
  await db.$disconnect();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
