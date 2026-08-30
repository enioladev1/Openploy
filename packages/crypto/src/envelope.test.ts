import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./envelope";
import { __resetMasterKeyCacheForTests } from "./master-key";

describe("envelope encryption", () => {
  beforeEach(() => {
    process.env.OPENPLOY_MASTER_KEY = randomBytes(32).toString("base64");
    process.env.OPENPLOY_MASTER_KEY_VERSION = "1";
    __resetMasterKeyCacheForTests();
  });

  it("round-trips a plaintext secret", () => {
    const plaintext = "sk_live_super_secret_value";
    const encrypted = encryptSecret(plaintext);
    expect(encrypted.cipherText).not.toContain(plaintext);
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it("produces different ciphertext for the same plaintext (random IV/data key per call)", () => {
    const a = encryptSecret("same-value");
    const b = encryptSecret("same-value");
    expect(a.cipherText).not.toBe(b.cipherText);
    expect(a.wrappedDataKey).not.toBe(b.wrappedDataKey);
  });

  it("throws if decrypted with a different master key version", () => {
    const encrypted = encryptSecret("value");
    process.env.OPENPLOY_MASTER_KEY = randomBytes(32).toString("base64");
    process.env.OPENPLOY_MASTER_KEY_VERSION = "2";
    __resetMasterKeyCacheForTests();
    expect(() => decryptSecret(encrypted)).toThrow();
  });

  it("throws if ciphertext is tampered with (GCM auth tag mismatch)", () => {
    const encrypted = encryptSecret("value");
    const tampered = { ...encrypted, cipherText: Buffer.from("tampered").toString("base64") };
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
