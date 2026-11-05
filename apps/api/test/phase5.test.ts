import { createDb, type PrismaClient } from "@hub/db";
import type { MetaClient } from "@hub/integrations";
import { MetaApiError, encryptToken } from "@hub/integrations";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { loadConfig, type AppConfig } from "../src/config";
import { ADMIN_EMAIL, login, resetDb, TEST_TOKEN_KEY, WEB_ORIGIN } from "./helpers";

let db: PrismaClient;
const apps: FastifyInstance[] = [];
const baseConfig = (): AppConfig => ({
  production: false,
  databaseUrl: process.env.TEST_DATABASE_URL!,
  port: 0,
  host: "127.0.0.1",
  webOrigin: WEB_ORIGIN,
  adminEmails: new Set([ADMIN_EMAIL]),
  google: null,
  devLogin: true,
  tokenKey: TEST_TOKEN_KEY,
  meta: { appId: "a", appSecret: "b" },
  authRateLimit: 100_000,
});
async function makeApp(config: AppConfig, meta?: MetaClient) {
  const app = await buildApp(db, config, { logger: false, jobs: { send: async () => "id" }, clients: meta ? { meta } : undefined });
  apps.push(app);
  return app;
}

beforeAll(() => {
  db = createDb(process.env.TEST_DATABASE_URL!);
});
afterAll(async () => {
  await Promise.all(apps.map((app) => app.close()));
  await db.$disconnect();
});
beforeEach(() => resetDb(db));

const devLogin = (app: FastifyInstance, ip = "10.0.0.1") =>
  app.inject({ method: "POST", url: "/api/auth/dev-login", payload: { email: "nobody@example.com" }, headers: { "x-forwarded-for": ip } });

describe("rate limits", () => {
  it("blocks repeated login attempts per IP with a readable message", async () => {
    const app = await makeApp({ ...baseConfig(), authRateLimit: 2 });
    expect((await devLogin(app)).statusCode).toBe(403);
    expect((await devLogin(app)).statusCode).toBe(403);
    const blocked = await devLogin(app);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().message).toContain("รอสักครู่");
    expect((await devLogin(app, "10.0.0.2")).statusCode).toBe(403);
  });

  it("does not limit the health check", async () => {
    const app = await makeApp({ ...baseConfig(), authRateLimit: 1 });
    for (let index = 0; index < 5; index += 1) {
      expect((await app.inject({ url: "/api/health" })).statusCode).toBe(200);
    }
  });
});

describe("production config", () => {
  const env = {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://x",
    WEB_ORIGIN: "https://hub.example/path",
  };

  it("refuses dev login", () => {
    expect(() => loadConfig({ ...env, AUTH_DEV_LOGIN: "true" })).toThrow(/AUTH_DEV_LOGIN/);
  });

  it("refuses half-set credentials and a bad encryption key", () => {
    expect(() => loadConfig({ ...env, META_APP_ID: "x" })).toThrow(/META_APP/);
    expect(() => loadConfig({ ...env, TOKEN_ENCRYPTION_KEY: "short" })).toThrow(/32 bytes/);
  });

  it("marks cookies secure and keeps only the origin", () => {
    const config = loadConfig(env);
    expect(config.production).toBe(true);
    expect(config.webOrigin).toBe("https://hub.example");
  });

  it("sends a Secure, HttpOnly session cookie in production mode", async () => {
    const app = await makeApp({ ...baseConfig(), production: true });
    const response = await app.inject({ method: "POST", url: "/api/auth/dev-login", payload: { email: ADMIN_EMAIL } });
    const cookie = response.cookies[0]!;
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax" });
  });
});

describe("access control", () => {
  it("rejects every data route without a session", async () => {
    const app = await makeApp(baseConfig());
    const routes = [
      "/api/owners", "/api/mailboxes", "/api/platform-accounts", "/api/pages", "/api/users", "/api/audit-logs",
      "/api/dashboard/summary", "/api/page-kits", "/api/connections", "/api/inbox", "/api/content", "/api/post-jobs",
      "/api/notifications", "/api/reports/overdue", "/api/reports/shopee/imports",
      "/api/reports/performance?from=2026-01-01&to=2026-01-02", "/api/reports/performance.csv?from=2026-01-01&to=2026-01-02",
    ];
    for (const url of routes) expect((await app.inject({ url })).statusCode, url).toBe(401);
  });

  it("rejects a mutating request from another site", async () => {
    const app = await makeApp(baseConfig());
    const cookie = await login(app, ADMIN_EMAIL);
    const response = await app.inject({
      method: "POST",
      url: "/api/owners",
      payload: { name: "x" },
      headers: { cookie, origin: "https://evil.example" },
    });
    expect(response.statusCode).toBe(403);
    expect(await db.owner.count()).toBe(0);
  });
});

describe("expired Meta token", () => {
  it("asks for reconnection instead of a generic error", async () => {
    const meta: MetaClient = {
      exchangeCode: async () => ({ accessToken: "x", expiresAt: null }),
      listPages: async () => { throw new MetaApiError("auth", "expired"); },
      publishPost: async () => "x",
      pageMetric: async () => [],
    };
    const app = await makeApp(baseConfig(), meta);
    const cookie = await login(app, ADMIN_EMAIL);
    const user = await db.user.findFirstOrThrow();
    await db.oAuthConnection.create({
      data: { provider: "meta_user", accountLabel: "m", createdById: user.id, scopes: "x", accessTokenEnc: encryptToken("t", TEST_TOKEN_KEY) },
    });
    const response = await app.inject({ url: "/api/connections/meta/pages", headers: { cookie } });
    expect(response.statusCode).toBe(409);
    expect((await db.oAuthConnection.findFirstOrThrow()).status).toBe("needs_reauth");
  });
});
