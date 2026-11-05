import { encryptToken } from "@hub/integrations";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createContext, loginAdminAndMember, resetDb, TEST_TOKEN_KEY, type TestContext } from "./helpers";

let context: TestContext;
let admin: string;
let member: string;

const call = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: object, cookie = member) =>
  context.app.inject({ method, url, payload, headers: { cookie } });

async function ownerId(name = "เจ้าของ") {
  return (await call("POST", "/api/owners", { name })).json().id as string;
}

beforeAll(async () => {
  context = await createContext();
});
afterAll(async () => {
  await context.app.close();
  await context.db.$disconnect();
});
beforeEach(async () => {
  await resetDb(context.db);
  context.sentJobs.length = 0;
  ({ admin, member } = await loginAdminAndMember(context));
});

describe("onboarding", () => {
  it("creates both checklists with a due date when an owner is added", async () => {
    const id = await ownerId();
    const data = (await call("GET", `/api/onboarding/${id}`)).json();
    expect(new Set(data.tasks.map((task: { template: string }) => task.template))).toEqual(
      new Set(["shopee_affiliate", "facebook_page"]),
    );
    expect(data.tasks.every((task: { dueAt: string; status: string }) => task.dueAt && task.status === "todo")).toBe(true);
  });

  it("does not duplicate or reset tasks when generated again", async () => {
    const id = await ownerId();
    const before = (await call("GET", `/api/onboarding/${id}`)).json().tasks;
    await call("PATCH", `/api/onboarding/tasks/${before[0].id}`, { status: "done" });
    const generated = (await call("POST", `/api/onboarding/${id}/generate`)).json();
    expect(generated.total).toBe(before.length);
    const after = (await call("GET", `/api/onboarding/${id}`)).json().tasks;
    expect(after.find((task: { id: string }) => task.id === before[0].id).status).toBe("done");
  });

  it("records completion time, clears it on undo, and writes history", async () => {
    const id = await ownerId();
    const [task] = (await call("GET", `/api/onboarding/${id}`)).json().tasks;
    const done = (await call("PATCH", `/api/onboarding/tasks/${task.id}`, { status: "done" })).json();
    expect(done.completedAt).not.toBeNull();
    const undone = (await call("PATCH", `/api/onboarding/tasks/${task.id}`, { status: "todo" })).json();
    expect(undone.completedAt).toBeNull();
    const logs = (await call("GET", `/api/audit-logs?entityId=${task.id}`)).json();
    expect(logs.total).toBe(2);
  });

  it("offers the owner's details for copying", async () => {
    const id = await ownerId("สมชาย");
    await call("POST", "/api/mailboxes", { ownerId: id, address: "a@example.com" });
    const { copyValues } = (await call("GET", `/api/onboarding/${id}`)).json();
    expect(copyValues).toMatchObject({ name: "สมชาย", mailbox: "a@example.com" });
  });
});

describe("page kits", () => {
  it("queues generation and starts pending", async () => {
    const id = await ownerId();
    const response = await call("POST", "/api/page-kits", { ownerId: id, category: "ของใช้ในบ้าน" });
    expect(response.statusCode).toBe(201);
    expect(response.json().status).toBe("pending");
    expect(context.sentJobs).toEqual([{ queue: "generate-page-kit", data: { pageKitId: response.json().id } }]);
  });

  it("requeues a failed kit on retry", async () => {
    const id = await ownerId();
    const kit = (await call("POST", "/api/page-kits", { ownerId: id, category: "x" })).json();
    await context.db.pageKit.update({ where: { id: kit.id }, data: { status: "failed", error: "boom" } });
    const retried = (await call("POST", `/api/page-kits/${kit.id}/retry`)).json();
    expect(retried).toMatchObject({ status: "pending", error: null });
    expect(context.sentJobs).toHaveLength(2);
  });
});

describe("connections", () => {
  async function connection() {
    const id = await ownerId();
    const mailbox = (await call("POST", "/api/mailboxes", { ownerId: id, address: "a@example.com" })).json();
    const user = await context.db.user.findFirstOrThrow();
    const created = await context.db.oAuthConnection.create({
      data: {
        provider: "google_gmail",
        accountLabel: mailbox.address,
        mailboxId: mailbox.id,
        createdById: user.id,
        scopes: "x",
        accessTokenEnc: encryptToken("plain-access", TEST_TOKEN_KEY),
        refreshTokenEnc: encryptToken("plain-refresh", TEST_TOKEN_KEY),
      },
    });
    return { id, mailbox, created };
  }

  it("never returns tokens", async () => {
    await connection();
    const response = await call("GET", "/api/connections");
    expect(response.json()).toHaveLength(1);
    expect(response.body).not.toMatch(/plain-|TokenEnc|v1:/);
  });

  it("explains when Google is not configured", async () => {
    const response = await call("GET", "/api/connections/google/start?mailboxId=00000000-0000-4000-8000-000000000000");
    expect(response.statusCode).toBe(503);
  });

  it("lets only an admin remove a connection", async () => {
    const { created } = await connection();
    expect((await call("DELETE", `/api/connections/${created.id}`)).statusCode).toBe(403);
    expect((await call("DELETE", `/api/connections/${created.id}`, undefined, admin)).statusCode).toBe(204);
  });
});

describe("inbox", () => {
  async function reviewItem() {
    const id = await ownerId();
    const mailbox = (await call("POST", "/api/mailboxes", { ownerId: id, address: "a@example.com" })).json();
    const account = (
      await call("POST", "/api/platform-accounts", { ownerId: id, platform: "shopee", displayName: "A", mailboxId: mailbox.id })
    ).json();
    const user = await context.db.user.findFirstOrThrow();
    const connection = await context.db.oAuthConnection.create({
      data: { provider: "google_gmail", accountLabel: "a", mailboxId: mailbox.id, createdById: user.id, scopes: "x", accessTokenEnc: "x" },
    });
    const event = await context.db.emailEvent.create({
      data: {
        connectionId: connection.id,
        mailboxId: mailbox.id,
        gmailMessageId: "m1",
        fromAddress: "a@shopee.co.th",
        subject: "Affiliate approved",
        receivedAt: new Date(),
        platform: "shopee",
        classification: "approved",
        reason: "x",
        outcome: "needs_review",
      },
    });
    return { id, account, event };
  }

  it("applies a reviewed email with a history entry", async () => {
    const { account, event } = await reviewItem();
    const response = await call("POST", `/api/inbox/${event.id}/resolve`, {
      action: "apply",
      platformAccountId: account.id,
      status: "approved",
    });
    expect(response.statusCode).toBe(200);
    expect((await call("GET", `/api/platform-accounts/${account.id}`)).json().status).toBe("approved");
    expect((await call("GET", `/api/audit-logs?entityId=${account.id}`)).json().total).toBe(2);
    expect((await call("GET", "/api/inbox")).json().total).toBe(0);
  });

  it("refuses to apply to an account on another mailbox, and refuses a second resolve", async () => {
    const { id, event } = await reviewItem();
    const other = (await call("POST", "/api/platform-accounts", { ownerId: id, platform: "shopee", displayName: "B" })).json();
    const wrong = await call("POST", `/api/inbox/${event.id}/resolve`, {
      action: "apply",
      platformAccountId: other.id,
      status: "approved",
    });
    expect(wrong.statusCode).toBe(409);
    expect((await call("POST", `/api/inbox/${event.id}/resolve`, { action: "dismiss" })).statusCode).toBe(200);
    expect((await call("POST", `/api/inbox/${event.id}/resolve`, { action: "dismiss" })).statusCode).toBe(409);
  });
});
