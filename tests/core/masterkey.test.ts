import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import {
  FileMasterKeyProvider,
  getMasterKeyProvider,
} from "../../src/core/masterkey.js";

const { tmpDir } = vi.hoisted(() => ({
  tmpDir: require("node:path").join(
    require("node:os").tmpdir(),
    `vibelock-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  ),
}));

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => tmpDir };
});

let originalKeysPath: string | undefined;

beforeEach(() => {
  originalKeysPath = process.env.VIBELOCK_KEYS_PATH;
  delete process.env.VIBELOCK_KEYS_PATH;
});

afterEach(() => {
  if (originalKeysPath === undefined) {
    delete process.env.VIBELOCK_KEYS_PATH;
  } else {
    process.env.VIBELOCK_KEYS_PATH = originalKeysPath;
  }
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("FileMasterKeyProvider", () => {
  it("write creates a 32-byte file", async () => {
    const provider = new FileMasterKeyProvider("test-project");
    const key = crypto.randomBytes(32);
    await provider.write(key);
    const filePath = path.join(
      tmpDir,
      ".vibelock",
      "keys",
      "test-project",
      "master.key"
    );
    const stat = await fs.stat(filePath);
    expect(stat.size).toBe(32);
  });

  it("read returns same bytes written", async () => {
    const provider = new FileMasterKeyProvider("test-project");
    const key = crypto.randomBytes(32);
    await provider.write(key);
    const readKey = await provider.read();
    expect(Buffer.compare(readKey, key)).toBe(0);
  });

  it("File permissions are 0o600", async () => {
    const provider = new FileMasterKeyProvider("test-project");
    const key = crypto.randomBytes(32);
    await provider.write(key);
    const filePath = path.join(
      tmpDir,
      ".vibelock",
      "keys",
      "test-project",
      "master.key"
    );
    const stat = await fs.stat(filePath);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it("Directory permissions are 0o700", async () => {
    const provider = new FileMasterKeyProvider("test-project");
    const key = crypto.randomBytes(32);
    await provider.write(key);
    const dirPath = path.join(
      tmpDir,
      ".vibelock",
      "keys",
      "test-project"
    );
    const stat = await fs.stat(dirPath);
    expect(stat.mode & 0o777).toBe(0o700);
  });

  it("read throws if file doesn't exist", async () => {
    const provider = new FileMasterKeyProvider("nonexistent");
    await expect(provider.read()).rejects.toThrow("Master key file not found");
  });

  it("Two different projectIds produce independent keys", async () => {
    const providerA = new FileMasterKeyProvider("project-a");
    const providerB = new FileMasterKeyProvider("project-b");
    const keyA = crypto.randomBytes(32);
    const keyB = crypto.randomBytes(32);
    await providerA.write(keyA);
    await providerB.write(keyB);
    const readA = await providerA.read();
    const readB = await providerB.read();
    expect(Buffer.compare(readA, keyA)).toBe(0);
    expect(Buffer.compare(readB, keyB)).toBe(0);
    expect(Buffer.compare(readA, readB)).not.toBe(0);
  });

  it("Omitting projectId uses 'default' subdirectory", async () => {
    const provider = getMasterKeyProvider();
    expect(provider).toBeInstanceOf(FileMasterKeyProvider);
    const key = crypto.randomBytes(32);
    await provider.write(key);
    const defaultPath = path.join(
      tmpDir,
      ".vibelock",
      "keys",
      "default",
      "master.key"
    );
    const stat = await fs.stat(defaultPath);
    expect(stat.size).toBe(32);
    const readKey = await provider.read();
    expect(Buffer.compare(readKey, key)).toBe(0);
  });

  it("basePath overrides default location", async () => {
    const customBase = path.join(tmpDir, "custom-keys");
    const provider = new FileMasterKeyProvider("my-project", customBase);
    const key = crypto.randomBytes(32);
    await provider.write(key);
    const filePath = path.join(customBase, "my-project", "master.key");
    const stat = await fs.stat(filePath);
    expect(stat.size).toBe(32);
    const readKey = await provider.read();
    expect(Buffer.compare(readKey, key)).toBe(0);
  });
});

describe("getMasterKeyProvider", () => {
  it("returns FileMasterKeyProvider with default projectId", () => {
    const provider = getMasterKeyProvider();
    expect(provider).toBeInstanceOf(FileMasterKeyProvider);
  });

  it("accepts keysPath option", async () => {
    const customBase = path.join(tmpDir, "opts-keys");
    const provider = getMasterKeyProvider("test-opts", { keysPath: customBase });
    expect(provider).toBeInstanceOf(FileMasterKeyProvider);
    const key = crypto.randomBytes(32);
    await provider.write(key);
    const filePath = path.join(customBase, "test-opts", "master.key");
    const stat = await fs.stat(filePath);
    expect(stat.size).toBe(32);
  });

  it("VIBELOCK_KEYS_PATH env var sets base path", async () => {
    const envBase = path.join(tmpDir, "env-keys");
    process.env.VIBELOCK_KEYS_PATH = envBase;
    const provider = getMasterKeyProvider("env-test");
    expect(provider).toBeInstanceOf(FileMasterKeyProvider);
    const key = crypto.randomBytes(32);
    await provider.write(key);
    const filePath = path.join(envBase, "env-test", "master.key");
    const stat = await fs.stat(filePath);
    expect(stat.size).toBe(32);
  });

  it("keysPath option takes priority over env var", async () => {
    const envBase = path.join(tmpDir, "env-priority");
    const optBase = path.join(tmpDir, "opt-priority");
    process.env.VIBELOCK_KEYS_PATH = envBase;
    const provider = getMasterKeyProvider("priority-test", { keysPath: optBase });
    const key = crypto.randomBytes(32);
    await provider.write(key);
    const filePath = path.join(optBase, "priority-test", "master.key");
    const stat = await fs.stat(filePath);
    expect(stat.size).toBe(32);
    // Should NOT exist in envBase
    await expect(fs.stat(path.join(envBase, "priority-test", "master.key"))).rejects.toThrow();
  });

  it("Default projectId is 'default'", async () => {
    const provider = getMasterKeyProvider();
    expect(provider).toBeInstanceOf(FileMasterKeyProvider);
    const key = crypto.randomBytes(32);
    await provider.write(key);
    const defaultPath = path.join(
      tmpDir,
      ".vibelock",
      "keys",
      "default",
      "master.key"
    );
    const stat = await fs.stat(defaultPath);
    expect(stat.size).toBe(32);
  });
});
