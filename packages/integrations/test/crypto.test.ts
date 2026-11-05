import { describe, expect, it } from "vitest";
import { assertValidKey, decryptToken, encryptToken } from "../src/crypto";

const key = Buffer.alloc(32, 1).toString("base64");

describe("token encryption", () => {
  it("round-trips without exposing the plain text", () => {
    const encoded = encryptToken("secret-token", key);
    expect(encoded).not.toContain("secret-token");
    expect(decryptToken(encoded, key)).toBe("secret-token");
  });

  it("uses a new IV each time", () => {
    expect(encryptToken("x", key)).not.toBe(encryptToken("x", key));
  });

  it("rejects tampering and the wrong key", () => {
    const [v, iv, tag, data] = encryptToken("secret", key).split(":");
    const flipped = Buffer.from(data!, "base64");
    flipped[0]! ^= 1;
    expect(() => decryptToken([v, iv, tag, flipped.toString("base64")].join(":"), key)).toThrow();
    expect(() => decryptToken(encryptToken("x", key), Buffer.alloc(32, 2).toString("base64"))).toThrow();
  });

  it("rejects a key of the wrong size", () => {
    expect(() => assertValidKey(Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
  });
});
