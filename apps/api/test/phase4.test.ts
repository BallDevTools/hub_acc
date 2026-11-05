import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { csvCell, detectMapping, parseCsv, parseMoney, parseOrderDate, toConversions } from "../src/shopee-csv";
import { createContext, loginAdminAndMember, resetDb, type TestContext } from "./helpers";

let context: TestContext;
let admin: string;
let member: string;

const call = (method: "GET" | "POST", url: string, payload?: object, cookie = admin) =>
  context.app.inject({ method, url, payload, headers: { cookie } });

const HEADER = "Order ID,Item ID,Order Time,Order Status,Purchase Value,Net Commission,Sub_id";
const MAPPING = {
  orderId: "Order ID",
  itemKey: "Item ID",
  orderedAt: "Order Time",
  status: "Order Status",
  amount: "Purchase Value",
  commission: "Net Commission",
  subId: "Sub_id",
};
const importCsv = async (rows: string[], cookie = admin) =>
  call("POST", "/api/reports/shopee/import", { csv: [HEADER, ...rows].join("\n"), fileName: "a.csv", mapping: MAPPING }, cookie);

async function pageWithSub(subId: string, name = `Page ${subId}`) {
  const owner = (await call("POST", "/api/owners", { name: "O" })).json();
  return (await call("POST", "/api/pages", { ownerId: owner.id, name, subId })).json();
}
const report = async (query = "from=2026-11-01&to=2026-11-30&granularity=month") =>
  (await call("GET", `/api/reports/performance?${query}`)).json();

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

describe("CSV parsing", () => {
  it("handles a BOM, quotes and Thai headers", () => {
    const { headers, rows } = parseCsv('﻿เลขที่คำสั่งซื้อ,ค่าคอมมิชชัน\n"A,1","1,234.50"\n');
    expect(headers).toEqual(["เลขที่คำสั่งซื้อ", "ค่าคอมมิชชัน"]);
    expect(rows[0]).toEqual({ เลขที่คำสั่งซื้อ: "A,1", ค่าคอมมิชชัน: "1,234.50" });
  });

  it("detects common columns and does not use one column twice", () => {
    const mapping = detectMapping(["Order ID", "Order Time", "Status", "Commission", "GMV", "Sub ID"]);
    expect(mapping).toEqual({ orderId: "Order ID", orderedAt: "Order Time", status: "Status", commission: "Commission", amount: "GMV", subId: "Sub ID" });
  });

  it.each([
    ["1,234.50", 1234.5],
    ["฿99", 99],
    ["10 บาท", 10],
    ["-5.25", -5.25],
    ["abc", null],
    ["", null],
    ["1.2.3", null],
  ])("parses money %s", (raw, value) => {
    expect(parseMoney(raw)).toBe(value);
  });

  it("reads dates as Bangkok time and converts Buddhist years", () => {
    const expected = "2026-11-04T17:30:00.000Z";
    expect(parseOrderDate("2026-11-05 00:30:00")?.toISOString()).toBe(expected);
    expect(parseOrderDate("05/11/2026 00:30")?.toISOString()).toBe(expected);
    expect(parseOrderDate("05/11/2569 00:30")?.toISOString()).toBe(expected);
    expect(parseOrderDate("2026-11-04T17:30:00Z")?.toISOString()).toBe(expected);
  });

  it("rejects impossible dates", () => {
    expect(parseOrderDate("2026-02-31")).toBeNull();
    expect(parseOrderDate("13/13/2026")).toBeNull();
    expect(parseOrderDate("soon")).toBeNull();
  });

  it("reports the file row number for a bad row", () => {
    const { conversions, errors } = toConversions(
      [
        { o: "1", d: "2026-11-01", s: "ok", a: "1", c: "1" },
        { o: "", d: "nope", s: "ok", a: "x", c: "1" },
      ],
      { orderId: "o", orderedAt: "d", status: "s", amount: "a", commission: "c" },
    );
    expect(conversions).toHaveLength(1);
    expect(errors[0]!.row).toBe(3);
    expect(errors[0]!.message).toContain("ไม่มีเลขคำสั่งซื้อ");
  });

  it("neutralizes spreadsheet formulas in exports", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
  });
});

describe("import", () => {
  const rows = [
    "A,1,2026-11-05 10:00:00,Completed,100.00,10.50,page1",
    "A,2,2026-11-05 10:00:00,Completed,50.00,5.00,page1",
    "B,1,2026-11-06 10:00:00,Pending,200.00,20.00,unknown-sub",
  ];

  it("previews columns without saving", async () => {
    const preview = (await call("POST", "/api/reports/shopee/preview", { csv: [HEADER, ...rows].join("\n") })).json();
    expect(preview.rowCount).toBe(3);
    expect(preview.mapping.orderId).toBe("Order ID");
    expect(await context.db.shopeeConversion.count()).toBe(0);
  });

  it("is admin only", async () => {
    expect((await importCsv(rows, member)).statusCode).toBe(403);
  });

  it("does not change totals when the same file is imported again", async () => {
    await pageWithSub("page1");
    expect((await importCsv(rows)).json()).toMatchObject({ inserted: 3, updated: 0, unchanged: 0 });
    const first = await report();
    expect((await importCsv(rows)).json()).toMatchObject({ inserted: 0, updated: 0, unchanged: 3 });
    expect(await report()).toEqual(first);
  });

  it("updates an order whose status changed in a newer file", async () => {
    await importCsv(rows);
    const result = await importCsv(["B,1,2026-11-06 10:00:00,Completed,200.00,18.00,unknown-sub"]);
    expect(result.json()).toMatchObject({ inserted: 0, updated: 1 });
    const stored = await context.db.shopeeConversion.findUniqueOrThrow({ where: { orderId_itemKey: { orderId: "B", itemKey: "1" } } });
    expect(stored.commission.toString()).toBe("18");
  });

  it("imports valid rows, reports invalid ones, and counts in-file duplicates", async () => {
    const result = (await importCsv([rows[0]!, "C,1,not-a-date,Completed,1,1,x", rows[0]!])).json();
    expect(result).toMatchObject({ rowCount: 3, inserted: 1, invalid: 1, duplicates: 1 });
    expect(result.errors[0].row).toBe(3);
  });

  it("rejects a mapping to a column the file does not have", async () => {
    const response = await call("POST", "/api/reports/shopee/import", {
      csv: [HEADER, rows[0]].join("\n"),
      fileName: "a.csv",
      mapping: { ...MAPPING, commission: "Missing" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("missing_columns");
  });

  it("records the import", async () => {
    await importCsv(rows);
    const { items } = (await call("GET", "/api/reports/shopee/imports")).json();
    expect(items[0]).toMatchObject({ fileName: "a.csv", insertedCount: 3 });
  });
});

describe("reports", () => {
  it("totals match the file and unmatched sales stay separate", async () => {
    const page = await pageWithSub("page1");
    await importCsv([
      "A,1,2026-11-05 10:00:00,Completed,100.00,10.50,page1",
      "A,2,2026-11-05 10:00:00,Completed,50.25,5.25,page1",
      "B,1,2026-11-06 10:00:00,Pending,200.00,20.00,nope",
      "C,1,2026-11-07 10:00:00,Pending,70.00,7.00,",
    ]);
    const { rows, totals } = await report();
    const matched = rows.find((row: { pageId: string | null }) => row.pageId === page.id);
    expect(matched).toMatchObject({ orders: 1, pageName: page.name });
    expect(Number(matched.amount)).toBe(150.25);
    expect(Number(matched.commission)).toBe(15.75);
    expect(Number(totals.commission)).toBe(42.75);
    expect(Number(totals.unmatchedCommission)).toBe(27);
    expect(rows.filter((row: { pageId: string | null }) => row.pageId === null)).toHaveLength(2);
  });

  it("matches a sub ID added to a page after the import", async () => {
    await importCsv(["A,1,2026-11-05 10:00:00,Completed,100,10,late"]);
    expect((await report()).rows[0].pageId).toBeNull();
    const page = await pageWithSub("late");
    expect((await report()).rows[0].pageId).toBe(page.id);
  });

  it("excludes cancelled orders from money but counts them", async () => {
    await importCsv([
      "A,1,2026-11-05 10:00:00,Completed,100,10,x",
      "B,1,2026-11-05 11:00:00,Cancelled,999,99,x",
      "C,1,2026-11-05 12:00:00,ยกเลิกแล้ว,999,99,x",
    ]);
    const { rows, totals } = await report();
    expect(rows[0]).toMatchObject({ orders: 1, cancelledOrders: 2 });
    expect(Number(totals.commission)).toBe(10);
  });

  it("groups by Bangkok day, week and month", async () => {
    await importCsv([
      "A,1,2026-11-01T17:30:00Z,Completed,1,1,x", // 2 พ.ย. เวลาไทย
      "B,1,2026-11-03 10:00:00,Completed,1,1,x",
    ]);
    const periods = async (granularity: string) =>
      (await report(`from=2026-11-01&to=2026-11-30&granularity=${granularity}`)).rows.map((row: { period: string }) => row.period).sort();
    expect(await periods("day")).toEqual(["2026-11-02", "2026-11-03"]);
    expect(await periods("week")).toEqual(["2026-11-02"]);
    expect(await periods("month")).toEqual(["2026-11-01"]);
  });

  it("includes the whole last day of the range in Bangkok time", async () => {
    await importCsv(["A,1,2026-11-30 23:59:00,Completed,1,1,x", "B,1,2026-12-01 00:00:00,Completed,1,1,x"]);
    expect(Number((await report()).totals.commission)).toBe(1);
  });

  it("rejects a bad range", async () => {
    expect((await call("GET", "/api/reports/performance?from=2026-12-01&to=2026-11-01")).statusCode).toBe(400);
    expect((await call("GET", "/api/reports/performance?from=x&to=y")).statusCode).toBe(400);
  });

  it("exports safe CSV with a BOM for Excel", async () => {
    await importCsv(["A,1,2026-11-05 10:00:00,Completed,100,10,=cmd"]);
    const response = await call("GET", "/api/reports/performance.csv?from=2026-11-01&to=2026-11-30");
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.body.charCodeAt(0)).toBe(0xfeff);
    expect(response.body).toContain("'=cmd");
    expect(response.body).toContain("จับคู่ไม่ได้");
  });

  it("rejects a duplicate or invalid sub ID on a page", async () => {
    await pageWithSub("dup");
    const owner = (await call("POST", "/api/owners", { name: "X" })).json();
    expect((await call("POST", "/api/pages", { ownerId: owner.id, name: "P", subId: "dup" })).statusCode).toBe(409);
    expect((await call("POST", "/api/pages", { ownerId: owner.id, name: "P", subId: "=bad" })).statusCode).toBe(400);
  });

  it("sums page metrics within the range", async () => {
    const page = await pageWithSub("m");
    await context.db.metricDaily.createMany({
      data: [
        { pageId: page.id, date: new Date("2026-11-01"), metric: "views", value: 5 },
        { pageId: page.id, date: new Date("2026-11-02"), metric: "views", value: 7 },
        { pageId: page.id, date: new Date("2026-12-01"), metric: "views", value: 100 },
      ],
    });
    const rows = (await call("GET", "/api/reports/metrics?from=2026-11-01&to=2026-11-30")).json();
    expect(rows[0]).toMatchObject({ metric: "views", total: 12, latest: 7, latestDate: "2026-11-02" });
  });
});

describe("overdue and dashboard actions", () => {
  it("lists overdue tasks and stale accounts", async () => {
    const owner = (await call("POST", "/api/owners", { name: "O" })).json();
    const account = (await call("POST", "/api/platform-accounts", { ownerId: owner.id, platform: "shopee", displayName: "A", status: "pending_review" })).json();
    await context.db.platformAccount.update({ where: { id: account.id }, data: { statusChangedAt: new Date("2026-01-01") } });
    await context.db.onboardingTask.updateMany({ where: { ownerId: owner.id, stepKey: "prepare" }, data: { dueAt: new Date("2026-01-01") } });

    const overdue = (await call("GET", "/api/reports/overdue")).json();
    expect(overdue.tasks).toHaveLength(1);
    expect(overdue.accounts[0].owner.name).toBe("O");
    const { actions } = (await call("GET", "/api/dashboard/summary")).json();
    expect(actions).toMatchObject({ overdueTasks: 1, staleAccounts: 1 });
  });
});

describe("notifications", () => {
  it("lists, counts unread and marks as read", async () => {
    await context.db.notification.createMany({
      data: [
        { title: "A", dedupeKey: "a" },
        { title: "B", dedupeKey: "b" },
      ],
    });
    const list = (await call("GET", "/api/notifications")).json();
    expect(list).toMatchObject({ total: 2, unread: 2 });
    await call("POST", `/api/notifications/${list.items[0].id}/read`);
    expect((await call("GET", "/api/notifications")).json().unread).toBe(1);
    await call("POST", "/api/notifications/read-all");
    expect((await call("GET", "/api/notifications")).json().unread).toBe(0);
  });
});
