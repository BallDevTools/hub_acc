import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyMetaError, httpMetaClient, MetaApiError } from "../src/meta";

const respond = (status: number, body: unknown) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

afterEach(() => vi.unstubAllGlobals());

describe("classifyMetaError", () => {
  it.each([
    [400, 190, "auth"],
    [401, undefined, "auth"],
    [403, 4, "rate_limit"],
    [429, undefined, "rate_limit"],
    [500, 1, "ambiguous"],
    [503, undefined, "ambiguous"],
    [400, 100, "rejected"],
    [403, 200, "rejected"],
  ])("status %s code %s is %s", (status, code, kind) => {
    expect(classifyMetaError(status, code)).toBe(kind);
  });
});

describe("publishPost", () => {
  it("posts to the page feed with a bearer token, not in the URL", async () => {
    respond(200, { id: "1_2" });
    expect(await httpMetaClient.publishPost("123", "tok", { message: "สวัสดี", link: "https://a.example" })).toBe("1_2");
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toMatch(/\/123\/feed$/);
    expect(String(url)).not.toContain("tok");
    expect((init!.headers as Record<string, string>).authorization).toBe("Bearer tok");
    expect(String(init!.body)).toContain("message=");
  });

  it("treats a dropped connection as ambiguous so it is never auto-retried", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("socket hang up"); }));
    await expect(httpMetaClient.publishPost("1", "t", { message: "m" })).rejects.toMatchObject({ kind: "ambiguous" });
  });

  it("treats a success without an id as ambiguous", async () => {
    respond(200, {});
    await expect(httpMetaClient.publishPost("1", "t", { message: "m" })).rejects.toBeInstanceOf(MetaApiError);
  });

  it("reports an expired token as auth", async () => {
    respond(400, { error: { code: 190, message: "expired" } });
    await expect(httpMetaClient.publishPost("1", "t", { message: "m" })).rejects.toMatchObject({ kind: "auth", code: 190 });
  });
});

describe("pageMetric", () => {
  it("keeps numeric daily values", async () => {
    respond(200, { data: [{ values: [{ value: 5, end_time: "2026-11-01T07:00:00+0000" }, { value: { a: 1 }, end_time: "2026-11-02T07:00:00+0000" }] }] });
    expect(await httpMetaClient.pageMetric("1", "t", "views", new Date(), new Date())).toEqual([{ date: "2026-11-01", value: 5 }]);
  });
});
