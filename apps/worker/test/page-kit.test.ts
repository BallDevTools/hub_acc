import { PageKitRefusedError } from "@hub/integrations";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runGeneratePageKit } from "../src/jobs/page-kit";
import { createTestDb, resetDb } from "./helpers";

const db = createTestDb();
const drafts = { names: ["ก"], description: "ง", firstPosts: ["จ"] };

async function kit(status: "pending" | "ready" = "pending") {
  const owner = await db.owner.create({ data: { name: "O" } });
  return db.pageKit.create({ data: { ownerId: owner.id, category: "x", status } });
}
const read = (id: string) => db.pageKit.findUniqueOrThrow({ where: { id } });

afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

describe("runGeneratePageKit", () => {
  it("stores generated drafts", async () => {
    const { id } = await kit();
    await runGeneratePageKit(db, async () => drafts, id);
    expect(await read(id)).toMatchObject({ status: "ready", drafts, error: null });
  });

  it("explains a missing API key", async () => {
    const { id } = await kit();
    await runGeneratePageKit(db, null, id);
    expect((await read(id)).error).toContain("ANTHROPIC_API_KEY");
  });

  it("explains a refusal and hides internal errors", async () => {
    const refused = await kit();
    await runGeneratePageKit(db, async () => { throw new PageKitRefusedError("no"); }, refused.id);
    expect((await read(refused.id)).error).toContain("ไม่สามารถร่าง");
    const crashed = await kit();
    await runGeneratePageKit(db, async () => { throw new Error("sk-ant-secret leaked"); }, crashed.id);
    expect((await read(crashed.id)).error).not.toContain("sk-ant");
  });

  it("skips a kit that is not pending, so a duplicate job does not spend money", async () => {
    const { id } = await kit("ready");
    let calls = 0;
    await runGeneratePageKit(db, async () => { calls += 1; return drafts; }, id);
    expect(calls).toBe(0);
  });
});
