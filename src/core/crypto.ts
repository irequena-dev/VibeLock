import { pbkdf2Sync, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

export const PBKDF2_ITERATIONS = 600_000;
export const KEY_LENGTH = 32;
export const IV_LENGTH = 12;
export const SALT_LENGTH = 16;
export const TAG_LENGTH = 16;

export function deriveKey(masterKey: Buffer, salt: Buffer): Buffer {
  return pbkdf2Sync(masterKey, salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha512");
}

export function encrypt(
  derivedKey: Buffer,
  plaintext: string,
): { iv: string; tag: string; ciphertext: string } {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", derivedKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    ciphertext: encrypted.toString("hex"),
  };
}

export function decrypt(
  derivedKey: Buffer,
  iv: string,
  tag: string,
  ciphertext: string,
): string {
  const ivBuffer = Buffer.from(iv, "hex");
  const tagBuffer = Buffer.from(tag, "hex");
  const ciphertextBuffer = Buffer.from(ciphertext, "hex");
  const decipher = createDecipheriv("aes-256-gcm", derivedKey, ivBuffer);
  decipher.setAuthTag(tagBuffer);
  const decrypted = Buffer.concat([decipher.update(ciphertextBuffer), decipher.final()]);
  return decrypted.toString("utf8");
}
