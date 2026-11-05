import { createDb } from "@hub/db";
import { QUEUES } from "@hub/integrations";
import { PgBoss } from "pg-boss";
import { buildApp } from "./app";
import { loadConfig } from "./config";

const config = loadConfig();
const db = createDb(config.databaseUrl);
const boss = new PgBoss(config.databaseUrl);
boss.on("error", (error) => console.error("[api] pg-boss error", error));
await boss.start();
for (const queue of Object.values(QUEUES)) await boss.createQueue(queue);
const app = await buildApp(db, config, { jobs: boss });

const shutdown = async () => {
  await app.close();
  await boss.stop();
  await db.$disconnect();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

await app.listen({ host: config.host, port: config.port });
