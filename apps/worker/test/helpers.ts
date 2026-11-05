import { resolve } from "node:path";
import { createDb } from "@hub/db";
import { config } from "dotenv";

config({ path: resolve(import.meta.dirname, "../../../.env"), quiet: true });

export const createTestDb = () => createDb(process.env.TEST_DATABASE_URL!);
export type TestDb = ReturnType<typeof createTestDb>;
export const TOKEN_KEY = Buffer.alloc(32, 9).toString("base64");

export async function resetDb(db: TestDb) {
  await db.$executeRawUnsafe('TRUNCATE "audit_logs", "notifications", "owners", "users" CASCADE');
}
