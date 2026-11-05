import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resolveLoginUser } from "../src/auth";
import { loadConfig } from "../src/config";
import { ADMIN_EMAIL, createContext, login, MEMBER_EMAIL, resetDb, WEB_ORIGIN, type TestContext } from "./helpers";

let context: TestContext;
const admins = new Set([ADMIN_EMAIL]);

beforeAll(async () => {
  context = await createContext();
});
afterAll(async () => {
  await context.app.close();
  await context.db.$disconnect();
});
beforeEach(() => resetDb(context.db));

describe("allowlist", () => {
  it("rejects an email that is not on the allowlist", async () => {
    const user = await resolveLoginUser(context.db, { email: "stranger@example.com", emailVerified: true }, admins);
    expect(user).toBeNull();
    expect(await context.db.user.count()).toBe(0);
  });

  it("rejects an unverified Google email even when it is an admin email", async () => {
    expect(await resolveLoginUser(context.db, { email: ADMIN_EMAIL, emailVerified: false }, admins)).toBeNull();
  });

  it("creates an ADMIN_EMAILS user as admin, ignoring email case", async () => {
    const user = await resolveLoginUser(context.db, { email: "ADMIN@example.com", emailVerified: true }, admins);
    expect(user).toMatchObject({ email: ADMIN_EMAIL, role: "admin" });
  });

  it("does not let ADMIN_EMAILS reactivate a deactivated user", async () => {
    await context.db.user.create({ data: { email: ADMIN_EMAIL, role: "admin", active: false } });
    expect(await resolveLoginUser(context.db, { email: ADMIN_EMAIL, emailVerified: true }, admins)).toBeNull();
  });

  it("returns 403 from dev login for an unknown email", async () => {
    const response = await context.app.inject({
      method: "POST",
      url: "/api/auth/dev-login",
      payload: { email: "stranger@example.com" },
    });
    expect(response.statusCode).toBe(403);
  });
});

describe("sessions", () => {
  it("requires a session on protected routes", async () => {
    for (const url of ["/api/auth/me", "/api/owners", "/api/users", "/api/dashboard/summary", "/api/audit-logs"]) {
      expect((await context.app.inject({ url })).statusCode, url).toBe(401);
    }
  });

  it("stores only a hash of the session token and sets a safe cookie", async () => {
    const response = await context.app.inject({
      method: "POST",
      url: "/api/auth/dev-login",
      payload: { email: ADMIN_EMAIL },
    });
    const cookie = response.cookies[0]!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("Lax");
    const session = await context.db.session.findFirstOrThrow();
    expect(session.tokenHash).not.toBe(cookie.value);
  });

  it("invalidates the session on logout", async () => {
    const cookie = await login(context.app, ADMIN_EMAIL);
    const headers = { cookie };
    expect((await context.app.inject({ url: "/api/auth/me", headers })).statusCode).toBe(200);
    expect((await context.app.inject({ method: "POST", url: "/api/auth/logout", headers })).statusCode).toBe(204);
    expect((await context.app.inject({ url: "/api/auth/me", headers })).statusCode).toBe(401);
  });

  it("rejects an expired session", async () => {
    const cookie = await login(context.app, ADMIN_EMAIL);
    await context.db.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await context.app.inject({ url: "/api/auth/me", headers: { cookie } })).statusCode).toBe(401);
  });

  it("blocks state-changing requests from another origin", async () => {
    const cookie = await login(context.app, ADMIN_EMAIL);
    const attack = await context.app.inject({
      method: "POST",
      url: "/api/owners",
      headers: { cookie, origin: "https://evil.example" },
      payload: { name: "x" },
    });
    expect(attack.statusCode).toBe(403);
    const allowed = await context.app.inject({
      method: "POST",
      url: "/api/owners",
      headers: { cookie, origin: WEB_ORIGIN },
      payload: { name: "x" },
    });
    expect(allowed.statusCode).toBe(201);
  });
});

describe("user management", () => {
  it("lets only admins add users, and a new user can log in", async () => {
    const admin = await login(context.app, ADMIN_EMAIL);
    const added = await context.app.inject({
      method: "POST",
      url: "/api/users",
      headers: { cookie: admin },
      payload: { email: MEMBER_EMAIL },
    });
    expect(added.statusCode).toBe(201);

    const member = await login(context.app, MEMBER_EMAIL);
    const forbidden = await context.app.inject({
      method: "POST",
      url: "/api/users",
      headers: { cookie: member },
      payload: { email: "other@example.com" },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it("ends every session when a user is deactivated", async () => {
    const admin = await login(context.app, ADMIN_EMAIL);
    const created = await context.db.user.create({ data: { email: MEMBER_EMAIL } });
    const member = await login(context.app, MEMBER_EMAIL);
    const response = await context.app.inject({
      method: "PATCH",
      url: `/api/users/${created.id}`,
      headers: { cookie: admin },
      payload: { active: false },
    });
    expect(response.statusCode).toBe(200);
    expect((await context.app.inject({ url: "/api/auth/me", headers: { cookie: member } })).statusCode).toBe(401);
  });

  it("prevents an admin from demoting or deactivating themselves", async () => {
    const admin = await login(context.app, ADMIN_EMAIL);
    const me = (await context.app.inject({ url: "/api/auth/me", headers: { cookie: admin } })).json();
    for (const payload of [{ role: "member" }, { active: false }]) {
      const response = await context.app.inject({
        method: "PATCH",
        url: `/api/users/${me.id}`,
        headers: { cookie: admin },
        payload,
      });
      expect(response.statusCode).toBe(400);
    }
  });
});

describe("config", () => {
  const base = { DATABASE_URL: "postgresql://x", WEB_ORIGIN };

  it("refuses dev login in production", () => {
    expect(() => loadConfig({ ...base, NODE_ENV: "production", AUTH_DEV_LOGIN: "true" })).toThrow(/AUTH_DEV_LOGIN/);
  });

  it("requires both Google credentials", () => {
    expect(() => loadConfig({ ...base, GOOGLE_CLIENT_ID: "id" })).toThrow(/GOOGLE_CLIENT/);
  });
});
