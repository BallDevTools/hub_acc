import { createDb, type PrismaClient } from "@hub/db";
import { decryptToken, type MetaClient } from "@hub/integrations";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";
import type { AppConfig } from "../src/config";
import { ADMIN_EMAIL, login, MEMBER_EMAIL, resetDb, TEST_TOKEN_KEY, WEB_ORIGIN } from "./helpers";

let app: FastifyInstance;
let db: PrismaClient;
let admin: string;
let member: string;

const metaPages = [{ id: "111", name: "FB Page", accessToken: "page-secret" }];
const meta: MetaClient = {
  exchangeCode: async () => ({ accessToken: "user-secret", expiresAt: null }),
  listPages: async () => metaPages,
  publishPost: async () => "x",
  pageMetric: async () => [],
};
const exchangeGmailCode = vi.fn(async () => ({
  accessToken: "gmail-access",
  refreshToken: "gmail-refresh" as string | undefined,
  expiresAt: new Date(Date.now() + 3_600_000),
}));
const profileEmail = vi.fn(async () => "a@example.com");

const call = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: object, cookie = member) =>
  app.inject({ method, url, payload, headers: { cookie } });

async function ownerAndPage() {
  const owner = (await call("POST", "/api/owners", { name: "O" })).json();
  const page = (await call("POST", "/api/pages", { ownerId: owner.id, name: "P" })).json();
  return { owner, page };
}

/** ทำขั้นตอน OAuth ของ Meta จนจบ แล้วคืน Page ที่เชื่อมแล้ว */
async function connectedPage() {
  const start = await call("GET", "/api/connections/meta/start", undefined, admin);
  const state = new URL(start.headers.location as string).searchParams.get("state")!;
  const stateCookie = start.cookies.find((item) => item.name === "hub_connect_state")!.value;
  await app.inject({
    method: "GET",
    url: `/api/connections/meta/callback?code=c&state=${state}`,
    headers: { cookie: `${admin}; hub_connect_state=${stateCookie}` },
  });
  const { page } = await ownerAndPage();
  await call("POST", `/api/pages/${page.id}/connect-meta`, { metaPageId: "111" }, admin);
  return page;
}

async function approvedContent() {
  const content = (await call("POST", "/api/content", { title: "T", body: "B" })).json();
  await call("POST", `/api/content/${content.id}/approve`, undefined, admin);
  return content;
}
const inAnHour = () => new Date(Date.now() + 3_600_000).toISOString();

beforeAll(async () => {
  const databaseUrl = process.env.TEST_DATABASE_URL!;
  const config: AppConfig = {
    production: false,
    databaseUrl,
    port: 0,
    host: "127.0.0.1",
    webOrigin: WEB_ORIGIN,
    adminEmails: new Set([ADMIN_EMAIL]),
    google: { clientId: "gid", clientSecret: "gsecret" },
    devLogin: true,
    tokenKey: TEST_TOKEN_KEY,
    meta: { appId: "mid", appSecret: "msecret" },
    authRateLimit: 100_000,
  };
  db = createDb(databaseUrl);
  app = await buildApp(db, config, {
    logger: false,
    jobs: { send: async () => "id" },
    clients: { meta, exchangeGmailCode, gmail: { profileEmail, listMessageIds: async () => [], getMessage: async () => { throw new Error("unused"); } } },
  });
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});
beforeEach(async () => {
  await resetDb(db);
  admin = await login(app, ADMIN_EMAIL);
  await db.user.create({ data: { email: MEMBER_EMAIL } });
  member = await login(app, MEMBER_EMAIL);
  profileEmail.mockResolvedValue("a@example.com");
  exchangeGmailCode.mockClear();
});

describe("Gmail OAuth", () => {
  async function start() {
    const owner = (await call("POST", "/api/owners", { name: "O" })).json();
    const mailbox = (await call("POST", "/api/mailboxes", { ownerId: owner.id, address: "a@example.com" })).json();
    const response = await call("GET", `/api/connections/google/start?mailboxId=${mailbox.id}`);
    const location = new URL(response.headers.location as string);
    return {
      mailbox,
      location,
      state: location.searchParams.get("state")!,
      stateCookie: response.cookies.find((item) => item.name === "hub_connect_state")!.value,
    };
  }
  const callback = (query: string, stateCookie: string) =>
    app.inject({
      method: "GET",
      url: `/api/connections/google/callback?${query}`,
      headers: { cookie: `${member}; hub_connect_state=${stateCookie}` },
    });

  it("asks only for read access and offline tokens", async () => {
    const { location } = await start();
    expect(location.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/gmail.readonly");
    expect(location.searchParams.get("access_type")).toBe("offline");
  });

  it("rejects a state that does not match the cookie", async () => {
    const { stateCookie } = await start();
    const response = await callback("code=c&state=forged.00000000-0000-4000-8000-000000000000", stateCookie);
    expect(response.headers.location).toContain("error=google_denied");
    expect(exchangeGmailCode).not.toHaveBeenCalled();
  });

  it("refuses a Google account that does not match the mailbox", async () => {
    const { state, stateCookie } = await start();
    profileEmail.mockResolvedValue("other@example.com");
    const response = await callback(`code=c&state=${state}`, stateCookie);
    expect(response.headers.location).toContain("error=wrong_account");
    expect(await db.oAuthConnection.count()).toBe(0);
  });

  it("stores tokens encrypted on success", async () => {
    const { state, stateCookie } = await start();
    const response = await callback(`code=c&state=${state}`, stateCookie);
    expect(response.headers.location).toContain("connected=gmail");
    const stored = await db.oAuthConnection.findFirstOrThrow();
    expect(stored.accessTokenEnc).not.toContain("gmail-access");
    expect(decryptToken(stored.refreshTokenEnc!, TEST_TOKEN_KEY)).toBe("gmail-refresh");
  });
});

describe("Meta connection", () => {
  it("is admin only", async () => {
    expect((await call("GET", "/api/connections/meta/start")).statusCode).toBe(403);
    expect((await call("GET", "/api/connections/meta/pages")).statusCode).toBe(403);
  });

  it("stores page tokens encrypted and never returns them", async () => {
    const page = await connectedPage();
    const stored = await db.oAuthConnection.findUniqueOrThrow({ where: { pageId: page.id } });
    expect(decryptToken(stored.accessTokenEnc, TEST_TOKEN_KEY)).toBe("page-secret");
    const listed = await call("GET", "/api/connections/meta/pages", undefined, admin);
    expect(listed.json()).toEqual([{ id: "111", name: "FB Page" }]);
    expect(listed.body).not.toContain("secret");
    expect((await call("GET", "/api/connections")).body).not.toContain("secret");
  });

  it("refuses a page the Meta account does not manage", async () => {
    await connectedPage();
    const { page } = await ownerAndPage();
    const response = await call("POST", `/api/pages/${page.id}/connect-meta`, { metaPageId: "999" }, admin);
    expect(response.statusCode).toBe(403);
  });

  it("clears the page link when the connection is removed", async () => {
    const page = await connectedPage();
    const stored = await db.oAuthConnection.findUniqueOrThrow({ where: { pageId: page.id } });
    await call("DELETE", `/api/connections/${stored.id}`, undefined, admin);
    expect((await call("GET", `/api/pages/${page.id}`)).json().metaPageId).toBeNull();
  });
});

describe("content approval", () => {
  it("lets only an admin approve", async () => {
    const content = (await call("POST", "/api/content", { title: "T", body: "B" })).json();
    expect((await call("POST", `/api/content/${content.id}/approve`)).statusCode).toBe(403);
    const approved = (await call("POST", `/api/content/${content.id}/approve`, undefined, admin)).json();
    expect(approved.status).toBe("approved");
    expect(approved.approvedById).not.toBeNull();
  });

  it("cannot be self-approved through an update", async () => {
    const content = (await call("POST", "/api/content", { title: "T", body: "B" })).json();
    expect((await call("PATCH", `/api/content/${content.id}`, { status: "approved" })).statusCode).toBe(400);
  });

  it("returns to draft when approved text is edited", async () => {
    const content = await approvedContent();
    const edited = (await call("PATCH", `/api/content/${content.id}`, { body: "ใหม่" })).json();
    expect(edited).toMatchObject({ status: "draft", approvedById: null });
  });

  it("stays approved when an edit changes nothing", async () => {
    const content = await approvedContent();
    const same = (await call("PATCH", `/api/content/${content.id}`, { body: "B" })).json();
    expect(same.status).toBe("approved");
  });
});

describe("post jobs", () => {
  it("requires approved content and a connected page", async () => {
    const page = await connectedPage();
    const draft = (await call("POST", "/api/content", { title: "T", body: "B" })).json();
    const notApproved = await call("POST", "/api/post-jobs", { contentItemId: draft.id, pageIds: [page.id], scheduledAt: inAnHour() });
    expect(notApproved.json().error).toBe("not_approved");

    const content = await approvedContent();
    const { page: unconnected } = await ownerAndPage();
    const response = await call("POST", "/api/post-jobs", { contentItemId: content.id, pageIds: [unconnected.id], scheduledAt: inAnHour() });
    expect(response.json().error).toBe("page_not_connected");
  });

  it("rejects a time in the past", async () => {
    const page = await connectedPage();
    const content = await approvedContent();
    const response = await call("POST", "/api/post-jobs", {
      contentItemId: content.id,
      pageIds: [page.id],
      scheduledAt: "2020-01-01T00:00:00Z",
    });
    expect(response.statusCode).toBe(400);
  });

  it("blocks scheduling the same content to a page twice, but allows it after cancelling", async () => {
    const page = await connectedPage();
    const content = await approvedContent();
    const body = { contentItemId: content.id, pageIds: [page.id, page.id], scheduledAt: inAnHour() };
    const first = await call("POST", "/api/post-jobs", body);
    expect(first.json().items).toHaveLength(1);
    expect((await call("POST", "/api/post-jobs", body)).json().error).toBe("already_scheduled");
    await call("POST", `/api/post-jobs/${first.json().items[0].id}/cancel`);
    expect((await call("POST", "/api/post-jobs", body)).statusCode).toBe(201);
    expect(await db.postJob.count()).toBe(1);
  });

  async function jobWithStatus(status: "failed" | "unknown" | "published" | "publishing") {
    const page = await connectedPage();
    const content = await approvedContent();
    const job = (await call("POST", "/api/post-jobs", { contentItemId: content.id, pageIds: [page.id], scheduledAt: inAnHour() })).json().items[0];
    await db.postJob.update({ where: { id: job.id }, data: { status } });
    return job;
  }

  it("retries an unknown job only after the user confirms the page was checked", async () => {
    const job = await jobWithStatus("unknown");
    expect((await call("POST", `/api/post-jobs/${job.id}/retry`, {})).statusCode).toBe(409);
    expect((await call("POST", `/api/post-jobs/${job.id}/retry`, { confirmNotPosted: true })).json().status).toBe("scheduled");
  });

  it("can record that an unknown job did reach the page", async () => {
    const job = await jobWithStatus("unknown");
    expect((await call("POST", `/api/post-jobs/${job.id}/mark-published`)).json().status).toBe("published");
  });

  it("does not cancel or retry a published or in-flight job", async () => {
    const published = await jobWithStatus("published");
    expect((await call("POST", `/api/post-jobs/${published.id}/cancel`)).statusCode).toBe(409);
    expect((await call("POST", `/api/post-jobs/${published.id}/retry`, { confirmNotPosted: true })).statusCode).toBe(409);
  });

  it("filters by page and time range for the calendar", async () => {
    const page = await connectedPage();
    const content = await approvedContent();
    await call("POST", "/api/post-jobs", { contentItemId: content.id, pageIds: [page.id], scheduledAt: inAnHour() });
    const list = async (query: string) => (await call("GET", `/api/post-jobs?${query}`)).json().total;
    const day = (offset: number) => encodeURIComponent(new Date(Date.now() + offset * 86_400_000).toISOString());
    expect(await list(`from=${day(-1)}&to=${day(1)}`)).toBe(1);
    expect(await list(`from=${day(2)}&to=${day(3)}`)).toBe(0);
    expect(await list(`pageId=${page.id}`)).toBe(1);
    expect(await list("pageId=00000000-0000-4000-8000-000000000000")).toBe(0);
  });

  it("filters by status", async () => {
    await jobWithStatus("failed");
    expect((await call("GET", "/api/post-jobs?status=failed")).json().total).toBe(1);
    expect((await call("GET", "/api/post-jobs?status=published")).json().total).toBe(0);
    expect((await call("GET", "/api/post-jobs?status=nope")).statusCode).toBe(400);
  });
});
