import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import {
  deriveKey,
  encrypt,
  decrypt,
  PBKDF2_ITERATIONS,
  KEY_LENGTH,
  IV_LENGTH,
  SALT_LENGTH,
  TAG_LENGTH,
} from "../../src/core/crypto.js";

describe("crypto", () => {
  const masterKey = randomBytes(32);
  const salt = randomBytes(16);
  const derivedKey = deriveKey(masterKey, salt);

  it("round-trips encrypt → decrypt", () => {
    const plaintext = "Hello, VibeLock! 🔐";
    const { iv, tag, ciphertext } = encrypt(derivedKey, plaintext);
    const result = decrypt(derivedKey, iv, tag, ciphertext);
    expect(result).toBe(plaintext);
  });

  it("different plaintexts produce different ciphertexts", () => {
    const a = encrypt(derivedKey, "alpha");
    const b = encrypt(derivedKey, "beta");
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
  });

  it("throws on tampered tag", () => {
    const { iv, tag, ciphertext } = encrypt(derivedKey, "secret");
    const tampered = tag.slice(0, -1) + (tag.at(-1) === "a" ? "b" : "a");
    expect(() => decrypt(derivedKey, iv, tampered, ciphertext)).toThrow();
  });

  it("throws on tampered ciphertext", () => {
    const { iv, tag, ciphertext } = encrypt(derivedKey, "secret");
    const tampered =
      ciphertext.slice(0, -1) + (ciphertext.at(-1) === "a" ? "b" : "a");
    expect(() => decrypt(derivedKey, iv, tag, tampered)).toThrow();
  });

  it("IV length is 24 hex chars (12 bytes)", () => {
    const { iv } = encrypt(derivedKey, "test");
    expect(iv.length).toBe(24);
  });

  it("tag length is 32 hex chars (16 bytes)", () => {
    const { tag } = encrypt(derivedKey, "test");
    expect(tag.length).toBe(32);
  });
});
