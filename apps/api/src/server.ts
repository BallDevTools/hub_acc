import { createDb } from "@hub/db";
import { buildApp } from "./app";
import { loadConfig } from "./config";

const config = loadConfig();
const db = createDb(config.databaseUrl);
const app = await buildApp(db, config);

const shutdown = async () => {
  await app.close();
  await db.$disconnect();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

await app.listen({ host: "127.0.0.1", port: config.port });
