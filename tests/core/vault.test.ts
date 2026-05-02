import { describe, it, expect, beforeEach, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import {
  create,
  load,
  save,
  addSecret,
  getSecret,
  removeSecret,
  listSecrets,
  exists,
  VaultVersionError,
  VaultSchemaError,
} from "../../src/core/vault.js";
import type { EncryptedSecret, VaultData } from "../../src/core/vault.js";

const baseTmp = path.join(
  os.tmpdir(),
  `vibelock-vault-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
);

let testCounter = 0;

function vaultPath(): string {
  testCounter += 1;
  return path.join(baseTmp, `vault-${testCounter}.vibe`);
}

function makeSecret(overrides?: Partial<EncryptedSecret>): EncryptedSecret {
  return {
    iv: "a".repeat(24),
    tag: "b".repeat(32),
    ciphertext: "deadbeef",
    salt: "c".repeat(32),
    ...overrides,
  };
}

afterAll(async () => {
  await fs.rm(baseTmp, { recursive: true, force: true });
});

describe("vault", () => {
  beforeEach(async () => {
    await fs.mkdir(baseTmp, { recursive: true });
  });

  it("create produces valid JSON with version 1 and empty secrets", async () => {
    const vp = vaultPath();
    await create(vp);
    const raw = await fs.readFile(vp, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.version).toBe(1);
    expect(parsed.secrets).toEqual({});
  });

  it("create throws if file already exists", async () => {
    const vp = vaultPath();
    await create(vp);
    await expect(create(vp)).rejects.toThrow();
  });

  it("addSecret + getSecret round-trip", async () => {
    const vp = vaultPath();
    await create(vp);
    const secret = makeSecret();
    await addSecret(vp, "db-password", secret);
    const result = await getSecret(vp, "db-password");
    expect(result).toEqual(secret);
  });

  it("addSecret overwrites existing key without affecting others", async () => {
    const vp = vaultPath();
    await create(vp);
    const secretA = makeSecret({ ciphertext: "aaaa" });
    const secretB = makeSecret({ ciphertext: "bbbb" });
    const secretC = makeSecret({ ciphertext: "cccc" });
    await addSecret(vp, "key-a", secretA);
    await addSecret(vp, "key-b", secretB);
    await addSecret(vp, "key-a", secretC);
    expect(await getSecret(vp, "key-a")).toEqual(secretC);
    expect(await getSecret(vp, "key-b")).toEqual(secretB);
  });

  it("removeSecret deletes the key", async () => {
    const vp = vaultPath();
    await create(vp);
    await addSecret(vp, "alpha", makeSecret());
    await addSecret(vp, "beta", makeSecret({ ciphertext: "cafe" }));
    await removeSecret(vp, "alpha");
    const names = await listSecrets(vp);
    expect(names).toEqual(["beta"]);
  });

  it("removeSecret throws if key doesn't exist", async () => {
    const vp = vaultPath();
    await create(vp);
    await expect(removeSecret(vp, "nope")).rejects.toThrow();
  });

  it("listSecrets returns correct names", async () => {
    const vp = vaultPath();
    await create(vp);
    await addSecret(vp, "charlie", makeSecret());
    await addSecret(vp, "alpha", makeSecret());
    await addSecret(vp, "bravo", makeSecret());
    const names = await listSecrets(vp);
    expect([...names].sort()).toEqual(["alpha", "bravo", "charlie"]);
  });

  it("load throws VaultVersionError for version 2", async () => {
    const vp = vaultPath();
    await fs.writeFile(vp, JSON.stringify({ version: 2, secrets: {} }));
    await expect(load(vp)).rejects.toThrow(VaultVersionError);
  });

  it("load throws on malformed JSON", async () => {
    const vp = vaultPath();
    await fs.writeFile(vp, "{{not valid json}}");
    await expect(load(vp)).rejects.toThrow();
  });

  it("load throws VaultSchemaError on missing fields in secret entries", async () => {
    const vp = vaultPath();
    const badSecret = { tag: "b".repeat(32), ciphertext: "deadbeef", salt: "c".repeat(32) };
    await fs.writeFile(
      vp,
      JSON.stringify({ version: 1, secrets: { bad: badSecret } })
    );
    await expect(load(vp)).rejects.toThrow(VaultSchemaError);
  });

  it("atomic write preserves original vault if save fails", async () => {
    const vp = vaultPath();
    await create(vp);
    const secret = makeSecret();
    await addSecret(vp, "safe-key", secret);
    await fs.mkdir(`${vp}.tmp`, { recursive: true });
    const data = await load(vp);
    data.secrets["extra"] = makeSecret({ ciphertext: "shouldnotpersist" });
    await expect(save(vp, data)).rejects.toThrow();
    const restored = await load(vp);
    expect(Object.keys(restored.secrets)).toEqual(["safe-key"]);
    expect(restored.secrets["safe-key"]).toEqual(secret);
    await fs.rm(`${vp}.tmp`, { recursive: true, force: true });
  });

  it("exists returns false when no vault file, true after create", async () => {
    const vp = vaultPath();
    expect(await exists(vp)).toBe(false);
    await create(vp);
    expect(await exists(vp)).toBe(true);
  });

  it("create sets file permissions to 0o600", async () => {
    const vp = vaultPath();
    await create(vp);
    const stat = await fs.stat(vp);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it("create makes parent directory if it does not exist", async () => {
    const vp = path.join(baseTmp, `deep-dir-${++testCounter}`, "sub", "secrets.vibe");
    await create(vp);
    const stat = await fs.stat(vp);
    expect(stat.mode & 0o777).toBe(0o600);
    const content = await fs.readFile(vp, "utf-8");
    expect(JSON.parse(content).version).toBe(1);
  });

  it("save preserves existing file permissions", async () => {
    const vp = vaultPath();
    await create(vp);
    await fs.chmod(vp, 0o644);
    const vault = await load(vp);
    vault.secrets["test"] = makeSecret();
    await save(vp, vault);
    const stat = await fs.stat(vp);
    expect(stat.mode & 0o777).toBe(0o644);
  });
});
