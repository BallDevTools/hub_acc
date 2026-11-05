import { resolve } from "node:path";
import { createDb, type PrismaClient } from "@hub/db";
import { config as loadDotenv } from "dotenv";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { SESSION_COOKIE } from "../src/auth";
import type { AppConfig } from "../src/config";

loadDotenv({ path: resolve(import.meta.dirname, "../../../.env"), quiet: true });

export const WEB_ORIGIN = "http://localhost:3000";
export const ADMIN_EMAIL = "admin@example.com";
export const MEMBER_EMAIL = "member@example.com";

export interface TestContext {
  app: FastifyInstance;
  db: PrismaClient;
}

export async function createContext(): Promise<TestContext> {
  const databaseUrl = process.env.TEST_DATABASE_URL!;
  const config: AppConfig = {
    production: false,
    databaseUrl,
    port: 0,
    webOrigin: WEB_ORIGIN,
    adminEmails: new Set([ADMIN_EMAIL]),
    google: null,
    devLogin: true,
  };
  const db = createDb(databaseUrl);
  const app = await buildApp(db, config, false);
  return { app, db };
}

export async function resetDb(db: PrismaClient) {
  await db.$executeRawUnsafe(
    'TRUNCATE "audit_logs", "pages", "platform_accounts", "mailboxes", "owners", "sessions", "users" CASCADE',
  );
}

export async function login(app: FastifyInstance, email: string): Promise<string> {
  const response = await app.inject({ method: "POST", url: "/api/auth/dev-login", payload: { email } });
  if (response.statusCode !== 204) throw new Error(`login failed: ${response.statusCode} ${response.body}`);
  const cookie = response.cookies.find((item) => item.name === SESSION_COOKIE);
  return `${SESSION_COOKIE}=${cookie!.value}`;
}

export async function loginAdminAndMember(context: TestContext) {
  const admin = await login(context.app, ADMIN_EMAIL);
  await context.db.user.create({ data: { email: MEMBER_EMAIL, role: "member" } });
  const member = await login(context.app, MEMBER_EMAIL);
  return { admin, member };
}
