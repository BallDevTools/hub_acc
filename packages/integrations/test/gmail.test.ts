import { afterEach, describe, expect, it, vi } from "vitest";
import { httpGmailClient, trustedAuthenticationResults } from "../src/gmail";
import { classifyMail } from "../src/mail-rules";

afterEach(() => vi.unstubAllGlobals());

const GOOGLE = "mx.google.com; dkim=fail; dmarc=fail header.from=shopee.co.th";
const FORGED = "mx.google.com; dmarc=pass header.from=shopee.co.th";

const message = (headers: Array<[string, string]>) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            internalDate: "1700000000000",
            payload: { headers: headers.map(([name, value]) => ({ name, value })) },
          }),
        ),
    ),
  );
  return httpGmailClient.getMessage("token", "m1");
};

describe("trustedAuthenticationResults", () => {
  it("uses only the header Gmail added on top", () => {
    expect(trustedAuthenticationResults([GOOGLE, FORGED])).toBe(GOOGLE);
  });

  it("ignores a result from any other server", () => {
    expect(trustedAuthenticationResults(["evil.example; dmarc=pass header.from=shopee.co.th"])).toBe("");
    expect(trustedAuthenticationResults([])).toBe("");
  });
});

describe("getMessage", () => {
  it("does not let a forged header pass the sender check", async () => {
    const mail = await message([
      ["From", "a@shopee.co.th"],
      ["Subject", "Affiliate approved"],
      ["Authentication-Results", GOOGLE],
      ["Authentication-Results", FORGED],
    ]);
    expect(classifyMail(mail).confident).toBe(false);
  });

  it("treats a message with two From headers as an unknown sender", async () => {
    const mail = await message([
      ["From", "a@shopee.co.th"],
      ["From", "b@evil.example"],
      ["Subject", "Affiliate approved"],
      ["Authentication-Results", FORGED],
    ]);
    expect(classifyMail(mail).platform).toBeNull();
  });

  it("requests metadata only, never the message body", async () => {
    await message([["From", "a@shopee.co.th"]]);
    const [url] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toContain("format=metadata");
  });
});
