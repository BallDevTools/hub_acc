import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createContext, loginAdminAndMember, resetDb, type TestContext } from "./helpers";

let context: TestContext;
let admin: string;
let member: string;

const call = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: object, cookie = member) =>
  context.app.inject({ method, url, payload, headers: { cookie } });

async function createOwner(name = "เจ้าของ A") {
  return (await call("POST", "/api/owners", { name })).json();
}
async function createMailbox(ownerId: string, address = "a@example.com") {
  return (await call("POST", "/api/mailboxes", { ownerId, address })).json();
}
async function createAccount(ownerId: string, platform = "facebook", extra: object = {}) {
  return (await call("POST", "/api/platform-accounts", { ownerId, platform, displayName: "บัญชี", ...extra })).json();
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
  ({ admin, member } = await loginAdminAndMember(context));
});

describe("CRUD and validation", () => {
  it("creates, reads, updates and lists an owner", async () => {
    const owner = await createOwner();
    expect((await call("GET", `/api/owners/${owner.id}`)).json().name).toBe("เจ้าของ A");
    const updated = await call("PATCH", `/api/owners/${owner.id}`, { team: "ทีม 1" });
    expect(updated.json().team).toBe("ทีม 1");
    expect((await call("GET", "/api/owners")).json().total).toBe(1);
  });

  it("rejects a password field instead of storing it", async () => {
    const owner = await createOwner();
    const response = await call("POST", "/api/mailboxes", {
      ownerId: owner.id,
      address: "a@example.com",
      password: "secret",
    });
    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain("secret");
  });

  it("accepts only https vault links", async () => {
    const owner = await createOwner();
    for (const vaultUrl of ["http://vault.example/x", "javascript:alert(1)", "plain text"]) {
      const response = await call("POST", "/api/mailboxes", { ownerId: owner.id, address: "a@example.com", vaultUrl });
      expect(response.statusCode, vaultUrl).toBe(400);
    }
    const ok = await call("POST", "/api/mailboxes", {
      ownerId: owner.id,
      address: "a@example.com",
      vaultUrl: "https://vault.example/item/1",
    });
    expect(ok.statusCode).toBe(201);
  });

  it("returns 409 for a duplicate mailbox and normalizes case", async () => {
    const owner = await createOwner();
    await createMailbox(owner.id, "same@example.com");
    const response = await call("POST", "/api/mailboxes", { ownerId: owner.id, address: "SAME@example.com" });
    expect(response.statusCode).toBe(409);
  });

  it("returns 400 for a bad id and 404 for an unknown one", async () => {
    expect((await call("GET", "/api/owners/not-a-uuid")).statusCode).toBe(400);
    expect((await call("GET", "/api/owners/00000000-0000-4000-8000-000000000000")).statusCode).toBe(404);
  });

  it("returns 409 when the referenced owner does not exist", async () => {
    const response = await call("POST", "/api/mailboxes", {
      ownerId: "00000000-0000-4000-8000-000000000000",
      address: "a@example.com",
    });
    expect(response.statusCode).toBe(409);
  });
});

describe("relationship rules", () => {
  it("rejects linking another owner's mailbox to an account", async () => {
    const a = await createOwner("A");
    const b = await createOwner("B");
    const mailbox = await createMailbox(b.id);
    const response = await call("POST", "/api/platform-accounts", {
      ownerId: a.id,
      platform: "shopee",
      displayName: "x",
      mailboxId: mailbox.id,
    });
    expect(response.statusCode).toBe(409);
  });

  it("requires a page to link to a Facebook account of the same owner", async () => {
    const a = await createOwner("A");
    const b = await createOwner("B");
    const shopee = await createAccount(a.id, "shopee");
    const otherFacebook = await createAccount(b.id, "facebook");
    const facebook = await createAccount(a.id, "facebook");
    const create = (platformAccountId: string) =>
      call("POST", "/api/pages", { ownerId: a.id, name: "Page", platformAccountId });
    expect((await create(shopee.id)).statusCode).toBe(409);
    expect((await create(otherFacebook.id)).statusCode).toBe(409);
    expect((await create(facebook.id)).statusCode).toBe(201);
  });

  it("blocks changes that would break an existing link", async () => {
    const a = await createOwner("A");
    const b = await createOwner("B");
    const mailbox = await createMailbox(a.id);
    const account = await createAccount(a.id, "facebook", { mailboxId: mailbox.id });
    await call("POST", "/api/pages", { ownerId: a.id, name: "Page", platformAccountId: account.id });
    expect((await call("PATCH", `/api/mailboxes/${mailbox.id}`, { ownerId: b.id })).statusCode).toBe(409);
    expect((await call("PATCH", `/api/platform-accounts/${account.id}`, { platform: "shopee" })).statusCode).toBe(409);
    expect((await call("PATCH", `/api/platform-accounts/${account.id}`, { ownerId: b.id })).statusCode).toBe(409);
  });
});

describe("delete", () => {
  it("is admin only", async () => {
    const owner = await createOwner();
    expect((await call("DELETE", `/api/owners/${owner.id}`)).statusCode).toBe(403);
    expect((await call("DELETE", `/api/owners/${owner.id}`, undefined, admin)).statusCode).toBe(204);
  });

  it("refuses to delete an owner that still has data", async () => {
    const owner = await createOwner();
    await createMailbox(owner.id);
    const response = await call("DELETE", `/api/owners/${owner.id}`, undefined, admin);
    expect(response.statusCode).toBe(409);
    expect((await call("GET", `/api/owners/${owner.id}`)).statusCode).toBe(200);
  });
});

describe("status tracking", () => {
  it("updates statusChangedAt only when the status changes and clears a stale reason", async () => {
    const owner = await createOwner();
    const account = await createAccount(owner.id, "shopee");
    const old = new Date("2020-01-01T00:00:00Z");
    await context.db.platformAccount.update({ where: { id: account.id }, data: { statusChangedAt: old } });

    const renamed = (await call("PATCH", `/api/platform-accounts/${account.id}`, { displayName: "ใหม่" })).json();
    expect(new Date(renamed.statusChangedAt)).toEqual(old);

    const rejected = (
      await call("PATCH", `/api/platform-accounts/${account.id}`, { status: "rejected", statusReason: "เอกสารไม่ครบ" })
    ).json();
    expect(new Date(rejected.statusChangedAt).getTime()).toBeGreaterThan(old.getTime());
    expect(rejected.statusReason).toBe("เอกสารไม่ครบ");

    const retried = (await call("PATCH", `/api/platform-accounts/${account.id}`, { status: "in_progress" })).json();
    expect(retried.statusReason).toBeNull();
  });
});

describe("search and filter", () => {
  it("filters accounts by search text, platform and status with pagination", async () => {
    const owner = await createOwner();
    await createAccount(owner.id, "shopee", { displayName: "Alpha Shop", status: "approved" });
    await createAccount(owner.id, "shopee", { displayName: "Beta Shop", status: "pending_review" });
    await createAccount(owner.id, "facebook", { displayName: "Alpha FB", status: "approved" });

    const names = async (query: string) =>
      (await call("GET", `/api/platform-accounts?${query}`)).json().items.map((item: { displayName: string }) => item.displayName).sort();

    expect(await names("q=alpha")).toEqual(["Alpha FB", "Alpha Shop"]);
    expect(await names("platform=shopee")).toEqual(["Alpha Shop", "Beta Shop"]);
    expect(await names("platform=shopee&status=approved")).toEqual(["Alpha Shop"]);

    const paged = (await call("GET", "/api/platform-accounts?pageSize=2&page=2")).json();
    expect(paged).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(paged.items).toHaveLength(1);
  });

  it("rejects an unknown status filter", async () => {
    expect((await call("GET", "/api/platform-accounts?status=nope")).statusCode).toBe(400);
  });
});

describe("audit log", () => {
  const history = async (entityId: string) =>
    (await call("GET", `/api/audit-logs?entityId=${entityId}`)).json().items;

  it("records who changed what on create, update and delete", async () => {
    const owner = await createOwner("ก่อนแก้");
    await call("PATCH", `/api/owners/${owner.id}`, { name: "หลังแก้" });
    await call("DELETE", `/api/owners/${owner.id}`, undefined, admin);

    const logs = await history(owner.id);
    expect(logs.map((log: { action: string }) => log.action)).toEqual(["delete", "update", "create"]);
    expect(logs[1].before.name).toBe("ก่อนแก้");
    expect(logs[1].after.name).toBe("หลังแก้");
    expect(logs[1].actor.email).toBe("member@example.com");
    expect(logs[0].actor.email).toBe("admin@example.com");
  });

  it("writes nothing when an update changes nothing", async () => {
    const owner = await createOwner("เดิม");
    await call("PATCH", `/api/owners/${owner.id}`, { name: "เดิม" });
    expect(await history(owner.id)).toHaveLength(1);
  });

  it("does not leave a record behind when the audited change fails", async () => {
    const owner = await createOwner();
    await createMailbox(owner.id);
    await call("DELETE", `/api/owners/${owner.id}`, undefined, admin);
    const logs = await history(owner.id);
    expect(logs.map((log: { action: string }) => log.action)).toEqual(["create"]);
  });
});

describe("dashboard", () => {
  it("counts match the data and flag accounts needing attention", async () => {
    const owner = await createOwner("สมชาย");
    const mailbox = await createMailbox(owner.id);
    await call("PATCH", `/api/mailboxes/${mailbox.id}`, { status: "active" });
    await createMailbox(owner.id, "b@example.com");
    await createAccount(owner.id, "shopee", { status: "approved" });
    await createAccount(owner.id, "shopee", { status: "rejected", statusReason: "ข้อมูลไม่ตรง" });
    await createAccount(owner.id, "facebook", { status: "pending_review" });
    await call("POST", "/api/pages", { ownerId: owner.id, name: "Page", status: "active" });

    const summary = (await call("GET", "/api/dashboard/summary")).json();
    expect(summary.totals).toEqual({ owners: 1, mailboxes: 2, platformAccounts: 3, pages: 1 });
    expect(summary.accountsByStatus.shopee).toMatchObject({ approved: 1, rejected: 1, not_started: 0 });
    expect(summary.accountsByStatus.facebook.pending_review).toBe(1);
    expect(summary.mailboxesByStatus).toMatchObject({ active: 1, pending: 1 });
    expect(summary.pagesByStatus.active).toBe(1);
    expect(summary.mailboxesWithout2fa).toBe(2);
    expect(summary.attention).toHaveLength(1);
    expect(summary.attention[0]).toMatchObject({ ownerName: "สมชาย", statusReason: "ข้อมูลไม่ตรง" });
  });
});
