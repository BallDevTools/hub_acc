import { describe, expect, it } from "vitest";
import { classifyMail, isAuthenticated, senderDomain } from "../src/mail-rules";

const pass = "mx.google.com; dkim=pass header.i=@shopee.co.th; dmarc=pass (p=REJECT) header.from=shopee.co.th";
const mail = (from: string, subject: string, authenticationResults = pass) => ({ from, subject, authenticationResults });

describe("classifyMail", () => {
  it("is confident about an authenticated Shopee approval", () => {
    expect(classifyMail(mail("Shopee <no-reply@shopee.co.th>", "ใบสมัคร Affiliate ของคุณได้รับการอนุมัติ"))).toMatchObject({
      platform: "shopee",
      classification: "approved",
      confident: true,
    });
  });

  it("reads not approved as rejected, never approved", () => {
    expect(classifyMail(mail("a@shopee.co.th", "Your affiliate application was not approved"))).toMatchObject({
      classification: "rejected",
      confident: true,
    });
    expect(classifyMail(mail("a@shopee.co.th", "ใบสมัคร Affiliate ไม่อนุมัติ")).classification).toBe("rejected");
  });

  it("sends a failed sender check to review even with the right subject", () => {
    const result = classifyMail(mail("a@shopee.co.th", "Affiliate approved", "mx.google.com; dkim=fail; dmarc=fail"));
    expect(result.classification).toBe("approved");
    expect(result.confident).toBe(false);
  });

  it("does not trust a lookalike domain", () => {
    for (const from of ["a@shopee.co.th.evil.com", "a@notshopee.co.th", "shopee.co.th <a@evil.com>"]) {
      expect(classifyMail(mail(from, "Affiliate approved")).platform, from).toBeNull();
    }
  });

  it("accepts a real subdomain", () => {
    expect(classifyMail(mail("a@mail.shopee.co.th", "Affiliate approved")).platform).toBe("shopee");
  });

  it("flags unrelated or conflicting subjects for review", () => {
    expect(classifyMail(mail("a@shopee.co.th", "Your order was approved")).confident).toBe(false);
    expect(classifyMail(mail("a@shopee.co.th", "Affiliate newsletter")).classification).toBe("unknown");
    expect(classifyMail(mail("a@shopee.co.th", "Affiliate approved then suspended")).confident).toBe(false);
  });
});

describe("helpers", () => {
  it("extracts the address from a display name", () => {
    expect(senderDomain('"x@shopee.co.th" <a@EVIL.com>')).toBe("evil.com");
  });

  it("does not accept DMARC for another domain", () => {
    expect(isAuthenticated("dmarc=pass header.from=evil.com", "shopee.co.th")).toBe(false);
    expect(isAuthenticated("dmarc=pass", "shopee.co.th")).toBe(false);
  });

  it("does not accept DKIM from another domain", () => {
    expect(isAuthenticated("dkim=pass header.i=@evil.com", "shopee.co.th")).toBe(false);
    expect(isAuthenticated("dkim=pass header.i=@shopee.co.th", "mail.shopee.co.th")).toBe(true);
  });
});
