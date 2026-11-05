import { encryptToken, MetaApiError, type MetaClient, type MetaErrorKind } from "@hub/integrations";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runCollectMetrics } from "../src/jobs/metrics";
import { runPublishPosts } from "../src/jobs/publish";
import { createTestDb, resetDb, TOKEN_KEY } from "./helpers";

const db = createTestDb();
const NOW = new Date("2026-11-05T10:00:00Z");

function fakeMeta(behavior: () => Promise<string> = async () => "post_1") {
  const calls: Array<{ pageId: string; token: string; message: string }> = [];
  const meta: MetaClient = {
    exchangeCode: async () => ({ accessToken: "x", expiresAt: null }),
    listPages: async () => [],
    publishPost: async (pageId, token, post) => {
      calls.push({ pageId, token, message: post.message });
      return behavior();
    },
    pageMetric: async () => [],
  };
  return { meta, calls };
}
const failing = (kind: MetaErrorKind) => async (): Promise<string> => {
  throw new MetaApiError(kind, `failed: ${kind}`);
};

async function setup(overrides: { contentStatus?: "draft" | "approved"; connected?: boolean; scheduledAt?: Date } = {}) {
  const user = await db.user.create({ data: { email: `u${Math.random()}@example.com` } });
  const owner = await db.owner.create({ data: { name: "O" } });
  const page = await db.page.create({
    data: { ownerId: owner.id, name: "P", metaPageId: overrides.connected === false ? null : `${Math.floor(Math.random() * 1e9)}` },
  });
  if (overrides.connected !== false) {
    await db.oAuthConnection.create({
      data: {
        provider: "meta_page",
        accountLabel: "P",
        pageId: page.id,
        createdById: user.id,
        scopes: "x",
        accessTokenEnc: encryptToken("page-token", TOKEN_KEY),
      },
    });
  }
  const content = await db.contentItem.create({
    data: { title: "T", body: "สวัสดี", status: overrides.contentStatus ?? "approved", createdById: user.id },
  });
  const job = await db.postJob.create({
    data: { contentItemId: content.id, pageId: page.id, scheduledAt: overrides.scheduledAt ?? new Date("2026-11-05T09:59:00Z") },
  });
  return { job, page, content };
}

const run = (meta: MetaClient, now = NOW) => runPublishPosts(db, { meta, tokenKey: TOKEN_KEY, now: () => now });
const read = (id: string) => db.postJob.findUniqueOrThrow({ where: { id } });

afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

describe("runPublishPosts", () => {
  it("publishes a due job with the decrypted page token", async () => {
    const { job, page } = await setup();
    const { meta, calls } = fakeMeta();
    await run(meta);
    expect(calls).toEqual([{ pageId: page.metaPageId, token: "page-token", message: "สวัสดี" }]);
    expect(await read(job.id)).toMatchObject({ status: "published", externalPostId: "post_1" });
  });

  it("leaves a future job alone", async () => {
    const { job } = await setup({ scheduledAt: new Date("2026-11-05T12:00:00Z") });
    const { meta, calls } = fakeMeta();
    await run(meta);
    expect(calls).toHaveLength(0);
    expect((await read(job.id)).status).toBe("scheduled");
  });

  it("never posts the same job twice across runs", async () => {
    await setup();
    const { meta, calls } = fakeMeta();
    await run(meta);
    await run(meta);
    expect(calls).toHaveLength(1);
  });

  it("does not double-post when two workers run at once", async () => {
    await setup();
    const { meta, calls } = fakeMeta();
    await Promise.all([run(meta), run(meta), run(meta)]);
    expect(calls).toHaveLength(1);
  });

  it("does not auto-retry an ambiguous failure, and notifies", async () => {
    const { job } = await setup();
    const { meta, calls } = fakeMeta(failing("ambiguous"));
    await run(meta);
    await run(meta, new Date(NOW.getTime() + 3_600_000));
    expect(calls).toHaveLength(1);
    expect((await read(job.id)).status).toBe("unknown");
    expect(await db.notification.count()).toBe(1);
  });

  it("treats an unexpected crash as ambiguous too", async () => {
    const { job } = await setup();
    const { meta } = fakeMeta(async () => { throw new Error("boom"); });
    await run(meta);
    expect((await read(job.id)).status).toBe("unknown");
  });

  it("backs off on a rate limit, then gives up", async () => {
    const { job } = await setup();
    const { meta, calls } = fakeMeta(failing("rate_limit"));
    await run(meta);
    const first = await read(job.id);
    expect(first.status).toBe("scheduled");
    expect(first.nextAttemptAt!.getTime()).toBeGreaterThan(NOW.getTime());

    await run(meta); // ยังไม่ถึงเวลาลองใหม่
    expect(calls).toHaveLength(1);

    let time = NOW.getTime();
    for (let round = 0; round < 6; round += 1) {
      time += 3 * 3_600_000;
      await run(meta, new Date(time));
    }
    expect(calls).toHaveLength(5);
    expect((await read(job.id)).status).toBe("failed");
  });

  it("flags the connection on an auth failure", async () => {
    const { job, page } = await setup();
    const { meta } = fakeMeta(failing("auth"));
    await run(meta);
    expect((await read(job.id)).status).toBe("failed");
    expect((await db.oAuthConnection.findUniqueOrThrow({ where: { pageId: page.id } })).status).toBe("needs_reauth");
  });

  it("fails a rejected post once with Meta's reason", async () => {
    const { job } = await setup();
    const { meta, calls } = fakeMeta(failing("rejected"));
    await run(meta);
    await run(meta, new Date(NOW.getTime() + 3_600_000));
    expect(calls).toHaveLength(1);
    expect(await read(job.id)).toMatchObject({ status: "failed", lastError: "failed: rejected" });
  });

  it("refuses content that lost its approval after scheduling", async () => {
    const { job } = await setup({ contentStatus: "draft" });
    const { meta, calls } = fakeMeta();
    await run(meta);
    expect(calls).toHaveLength(0);
    expect((await read(job.id)).status).toBe("failed");
  });

  it("does not post a job cancelled before the run", async () => {
    const { job } = await setup();
    await db.postJob.update({ where: { id: job.id }, data: { status: "cancelled" } });
    const { meta, calls } = fakeMeta();
    await run(meta);
    expect(calls).toHaveLength(0);
  });

  it("marks a job stuck in publishing as unknown instead of reposting", async () => {
    const { job } = await setup();
    await db.postJob.update({ where: { id: job.id }, data: { status: "publishing" } });
    const { meta, calls } = fakeMeta();
    await run(meta, new Date(Date.now() + 3_600_000));
    expect(calls).toHaveLength(0);
    expect((await read(job.id)).status).toBe("unknown");
  });

  it("does not expose the token in errors", async () => {
    const { job } = await setup();
    const { meta } = fakeMeta(failing("rejected"));
    await run(meta);
    expect((await read(job.id)).lastError).not.toContain("page-token");
  });
});

describe("runCollectMetrics", () => {
  const collect = (meta: MetaClient, metrics: string[]) => runCollectMetrics(db, { meta, tokenKey: TOKEN_KEY, metrics, now: () => NOW });

  it("upserts daily values without duplicates", async () => {
    const { page } = await setup();
    const base = fakeMeta().meta;
    let value = 1;
    const meta: MetaClient = { ...base, pageMetric: async () => [{ date: "2026-11-04", value: value++ }] };
    await collect(meta, ["views"]);
    await collect(meta, ["views"]);
    const rows = await db.metricDaily.findMany({ where: { pageId: page.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.value).toBe(2);
  });

  it("keeps collecting when one metric is invalid and raises one notice", async () => {
    const { page } = await setup();
    const meta: MetaClient = {
      ...fakeMeta().meta,
      pageMetric: async (_id, _token, metric) => {
        if (metric === "gone") throw new MetaApiError("rejected", "invalid metric");
        return [{ date: "2026-11-04", value: 3 }];
      },
    };
    await collect(meta, ["gone", "views"]);
    await collect(meta, ["gone", "views"]);
    expect(await db.metricDaily.count({ where: { pageId: page.id, metric: "views" } })).toBe(1);
    expect(await db.notification.count()).toBe(1);
  });

  it("flags the connection when the token is rejected", async () => {
    const { page } = await setup();
    const meta: MetaClient = { ...fakeMeta().meta, pageMetric: async () => { throw new MetaApiError("auth", "expired"); } };
    await collect(meta, ["a", "b"]);
    expect((await db.oAuthConnection.findUniqueOrThrow({ where: { pageId: page.id } })).status).toBe("needs_reauth");
  });
});
