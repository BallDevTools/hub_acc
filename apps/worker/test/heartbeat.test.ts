import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { runHeartbeat } from "../src/jobs/heartbeat";
import { createDb } from "@hub/db";
import { createTestDb } from "./helpers";

const db = createTestDb();
afterAll(() => db.$disconnect());
const file = async () => join(await mkdtemp(join(tmpdir(), "hub-")), "beat");

describe("runHeartbeat", () => {
  it("writes the file and pings", async () => {
    const path = await file();
    const pinged: string[] = [];
    await runHeartbeat(db, { file: path, pingUrl: "https://ping.example", send: async (url) => void pinged.push(url) });
    expect(await readFile(path, "utf8")).toMatch(/^\d{4}-/);
    expect(pinged).toEqual(["https://ping.example"]);
  });

  it("does not fail when the ping service is down", async () => {
    const path = await file();
    await runHeartbeat(db, { file: path, pingUrl: "https://ping.example", send: async () => { throw new Error("down"); } });
    expect((await stat(path)).size).toBeGreaterThan(0);
  });

  it("stays silent when the database is down, so monitors raise the alarm", async () => {
    const dead = createDb("postgresql://hub:x@127.0.0.1:1/none");
    const path = await file();
    const pinged: string[] = [];
    await expect(runHeartbeat(dead, { file: path, pingUrl: "https://ping.example", send: async (url) => void pinged.push(url) })).rejects.toThrow();
    expect(pinged).toEqual([]);
    await dead.$disconnect().catch(() => undefined);
  });
});
