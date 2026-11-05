import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runDailySummary, runDeliverNotifications } from "../src/jobs/notifications";
import { notify } from "../src/notify";
import { createTestDb, resetDb } from "./helpers";

const db = createTestDb();
const add = (key: string, title = "T") => notify(db, { severity: "info", title, link: "/x", dedupeKey: key });

afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

describe("runDailySummary", () => {
  it("creates one summary per Bangkok day", async () => {
    await runDailySummary(db, new Date("2026-11-05T01:00:00Z"));
    await runDailySummary(db, new Date("2026-11-05T02:00:00Z"));
    expect(await db.notification.count()).toBe(1);
    // 17:30 UTC ตรงกับวันถัดไปในเวลาไทย
    await runDailySummary(db, new Date("2026-11-05T17:30:00Z"));
    expect(await db.notification.count()).toBe(2);
  });

  it("raises severity only when something needs action", async () => {
    await runDailySummary(db, new Date("2026-11-05T01:00:00Z"));
    expect((await db.notification.findFirstOrThrow()).severity).toBe("info");
    const owner = await db.owner.create({ data: { name: "O" } });
    await db.onboardingTask.create({
      data: { ownerId: owner.id, template: "t", stepKey: "s", title: "x", position: 0, dueAt: new Date("2026-01-01") },
    });
    await runDailySummary(db, new Date("2026-11-06T01:00:00Z"));
    const latest = await db.notification.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
    expect(latest.severity).toBe("warning");
    expect(latest.body).toContain("งานเกินกำหนด: 1");
  });
});

describe("runDeliverNotifications", () => {
  const collect = () => {
    const sent: Array<{ text: string }> = [];
    return { sent, send: async (_url: string, body: object) => void sent.push(body as { text: string }) };
  };

  it("does nothing without a webhook", async () => {
    await add("a");
    await runDeliverNotifications(db, { webhookUrl: null, webOrigin: null });
    expect((await db.notification.findFirstOrThrow()).deliveredAt).toBeNull();
  });

  it("delivers each notification once with a full link", async () => {
    await add("a", "แจ้งเตือน");
    const { sent, send } = collect();
    const deps = { webhookUrl: "https://hook.example", webOrigin: "https://hub.example", send };
    await runDeliverNotifications(db, deps);
    await runDeliverNotifications(db, deps);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("แจ้งเตือน");
    expect(sent[0]!.text).toContain("https://hub.example/x");
  });

  it("retries later after a failure, without losing the message", async () => {
    await add("a");
    await add("b");
    let fail = true;
    const delivered: string[] = [];
    const send = async (_url: string, body: object) => {
      if (fail) throw new Error("down");
      delivered.push((body as { text: string }).text);
    };
    const deps = { webhookUrl: "https://hook.example", webOrigin: null, send };
    await runDeliverNotifications(db, deps);
    expect(await db.notification.count({ where: { deliveredAt: null } })).toBe(2);
    fail = false;
    await runDeliverNotifications(db, deps);
    expect(delivered).toHaveLength(2);
    expect(await db.notification.count({ where: { deliveredAt: null } })).toBe(0);
  });
});
