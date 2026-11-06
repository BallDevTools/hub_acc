import { encryptToken, ReauthRequiredError, type GmailClient, type GmailMessage } from "@hub/integrations";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runMailWatch } from "../src/jobs/mail-watch";
import { createTestDb, resetDb, TOKEN_KEY } from "./helpers";

const db = createTestDb();
const credentials = { clientId: "id", clientSecret: "secret" };
const AUTH_PASS = "dmarc=pass header.from=shopee.co.th";

const mail = (id: string, subject: string, receivedAt: Date, extra: Partial<GmailMessage> = {}): GmailMessage => ({
  id,
  subject,
  receivedAt,
  from: "Shopee <no-reply@shopee.co.th>",
  authenticationResults: AUTH_PASS,
  ...extra,
});

const gmailWith = (messages: GmailMessage[]): GmailClient => ({
  profileEmail: async () => "a@example.com",
  listMessageIds: async () => messages.map((message) => message.id),
  getMessage: async (_token, id) => messages.find((message) => message.id === id)!,
});

async function setup(options: { accounts?: number; expired?: boolean } = {}) {
  const user = await db.user.create({ data: { email: "u@example.com" } });
  const owner = await db.owner.create({ data: { name: "O" } });
  const mailbox = await db.mailbox.create({ data: { ownerId: owner.id, address: "a@example.com" } });
  const accounts = [];
  for (let index = 0; index < (options.accounts ?? 1); index += 1) {
    accounts.push(
      await db.platformAccount.create({
        data: {
          ownerId: owner.id,
          mailboxId: mailbox.id,
          platform: "shopee",
          displayName: `A${index}`,
          status: "pending_review",
          statusChangedAt: new Date("2026-01-01"),
        },
      }),
    );
  }
  const connection = await db.oAuthConnection.create({
    data: {
      provider: "google_gmail",
      accountLabel: mailbox.address,
      mailboxId: mailbox.id,
      createdById: user.id,
      scopes: "x",
      accessTokenEnc: encryptToken("access", TOKEN_KEY),
      refreshTokenEnc: encryptToken("refresh", TOKEN_KEY),
      expiresAt: new Date(Date.now() + (options.expired ? -1000 : 3_600_000)),
    },
  });
  return { accounts, connection };
}

const run = (gmail: GmailClient, refresh?: Parameters<typeof runMailWatch>[1]["refresh"]) =>
  runMailWatch(db, { gmail, credentials, tokenKey: TOKEN_KEY, refresh });

afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

describe("runMailWatch", () => {
  it("applies a confident email and records who did it as the system", async () => {
    const { accounts } = await setup();
    await run(gmailWith([mail("1", "Affiliate application approved", new Date("2026-02-01"))]));
    const account = await db.platformAccount.findUniqueOrThrow({ where: { id: accounts[0]!.id } });
    expect(account.status).toBe("approved");
    const audit = await db.auditLog.findFirstOrThrow({ where: { entityId: account.id } });
    expect(audit.actorId).toBeNull();
  });

  it("does not repeat a change when the same email is seen again", async () => {
    const { accounts } = await setup();
    const gmail = gmailWith([mail("1", "Affiliate application approved", new Date("2026-02-01"))]);
    await run(gmail);
    await db.platformAccount.update({ where: { id: accounts[0]!.id }, data: { status: "in_progress" } });
    await run(gmail);
    const account = await db.platformAccount.findUniqueOrThrow({ where: { id: accounts[0]!.id } });
    expect(account.status).toBe("in_progress");
    expect(await db.emailEvent.count()).toBe(1);
  });

  it("sends a spoofed email to review without changing status", async () => {
    const { accounts } = await setup();
    await run(gmailWith([mail("1", "Affiliate approved", new Date("2026-02-01"), { authenticationResults: "dmarc=fail" })]));
    expect((await db.platformAccount.findUniqueOrThrow({ where: { id: accounts[0]!.id } })).status).toBe("pending_review");
    expect((await db.emailEvent.findFirstOrThrow()).outcome).toBe("needs_review");
  });

  it("sends an email to review when the mailbox has several accounts", async () => {
    const { accounts } = await setup({ accounts: 2 });
    await run(gmailWith([mail("1", "Affiliate approved", new Date("2026-02-01"))]));
    expect((await db.emailEvent.findFirstOrThrow()).outcome).toBe("needs_review");
    expect((await db.platformAccount.findUniqueOrThrow({ where: { id: accounts[0]!.id } })).status).toBe("pending_review");
  });

  it("does not let an older email overwrite a newer status", async () => {
    const { accounts } = await setup();
    await run(gmailWith([mail("1", "Affiliate approved", new Date("2025-06-01"))]));
    expect((await db.platformAccount.findUniqueOrThrow({ where: { id: accounts[0]!.id } })).status).toBe("pending_review");
    expect((await db.emailEvent.findFirstOrThrow()).reason).toContain("เก่ากว่า");
  });

  it("ends on the latest email regardless of list order", async () => {
    const { accounts } = await setup();
    await run(
      gmailWith([
        mail("new", "Affiliate account suspended", new Date("2026-03-01")),
        mail("old", "Affiliate application approved", new Date("2026-02-01")),
      ]),
    );
    expect((await db.platformAccount.findUniqueOrThrow({ where: { id: accounts[0]!.id } })).status).toBe("suspended");
  });

  it("ignores mail from unknown senders entirely", async () => {
    await setup();
    await run(gmailWith([mail("1", "Affiliate approved", new Date("2026-02-01"), { from: "x@evil.com" })]));
    expect(await db.emailEvent.count()).toBe(0);
  });

  it("refreshes an expired token and stores it encrypted", async () => {
    const { connection } = await setup({ expired: true });
    let used = "";
    const gmail: GmailClient = {
      ...gmailWith([]),
      listMessageIds: async (token) => {
        used = token;
        return [];
      },
    };
    await run(gmail, async () => ({ accessToken: "new-access", expiresAt: new Date(Date.now() + 3_600_000) }));
    expect(used).toBe("new-access");
    const stored = await db.oAuthConnection.findUniqueOrThrow({ where: { id: connection.id } });
    expect(stored.accessTokenEnc).not.toContain("new-access");
  });

  it("marks a revoked connection and notifies once", async () => {
    const { connection } = await setup({ expired: true });
    await run(gmailWith([]), async () => {
      throw new ReauthRequiredError("revoked");
    });
    const stored = await db.oAuthConnection.findUniqueOrThrow({ where: { id: connection.id } });
    expect(stored.status).toBe("needs_reauth");
    expect(await db.notification.count()).toBe(1);
    await run(gmailWith([]));
    expect(await db.notification.count()).toBe(1);
  });

  it("keeps going when one connection fails", async () => {
    await setup();
    const gmail: GmailClient = {
      ...gmailWith([]),
      listMessageIds: async () => {
        throw new Error("Gmail request failed with 500");
      },
    };
    await run(gmail);
    const stored = await db.oAuthConnection.findFirstOrThrow();
    expect(stored.status).toBe("active");
    expect(stored.lastError).toContain("ลองใหม่");
  });
});
