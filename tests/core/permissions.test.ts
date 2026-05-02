import { describe, it, expect, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { writeFileSecure, writeFileAtomic, PermissionDeniedError } from "../../src/core/permissions.js";

const baseTmp = path.join(
  os.tmpdir(),
  `vibelock-perms-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
);

let testCounter = 0;

function testPath(name?: string): string {
  testCounter += 1;
  return path.join(baseTmp, name ?? `test-${testCounter}`);
}

afterAll(async () => {
  await fs.rm(baseTmp, { recursive: true, force: true });
});

describe("writeFileSecure", () => {
  it("creates file with 0o600", async () => {
    const filePath = path.join(testPath(), "test.key");
    await writeFileSecure(filePath, Buffer.from("test-data"));
    const stat = await fs.stat(filePath);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it("creates parent directories with 0o700", async () => {
    const dir = path.join(testPath(), "deep", "nested");
    const filePath = path.join(dir, "test.key");
    await writeFileSecure(filePath, Buffer.from("data"));
    const dirStat = await fs.stat(dir);
    expect(dirStat.mode & 0o777).toBe(0o700);
  });

  it("writes string data", async () => {
    const filePath = path.join(testPath(), "string.json");
    await writeFileSecure(filePath, '{"test": true}');
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe('{"test": true}');
  });

  it("respects writeOpts flag", async () => {
    const dir = testPath("flag-test");
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, "exclusive.key");
    await writeFileSecure(filePath, Buffer.from("first"), { flag: "wx" });
    await expect(
      writeFileSecure(filePath, Buffer.from("second"), { flag: "wx" })
    ).rejects.toThrow();
  });

  it("throws PermissionDeniedError on EACCES", async () => {
    // Create a directory we can't write to
    const readonlyDir = testPath("readonly");
    await fs.mkdir(readonlyDir, { recursive: true });
    
    // Try to create file in a protected path (this won't actually trigger EACCES in test)
    // but we can test the error type
    const protectedPath = "/etc/vibelock/test/secret.vibe";
    
    // This test simulates the EACCES scenario by checking if the error is PermissionDeniedError
    await expect(writeFileSecure(protectedPath, "test")).rejects.toThrow(PermissionDeniedError);
  });
});

describe("writeFileAtomic", () => {
  it("writes file with 0o600", async () => {
    const dir = testPath("atomic-test");
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, "vault.vibe");
    await writeFileAtomic(filePath, '{"version":1}');
    const stat = await fs.stat(filePath);
    expect(stat.mode & 0o777).toBe(0o600);
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe('{"version":1}');
  });

  it("replaces existing file", async () => {
    const dir = testPath("atomic-replace");
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, "vault.vibe");
    await writeFileAtomic(filePath, "original");
    await writeFileAtomic(filePath, "updated");
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("updated");
  });

  it("does not leave tmp file on success", async () => {
    const dir = testPath("atomic-tmp");
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, "clean.vibe");
    await writeFileAtomic(filePath, "data");
    await expect(fs.access(filePath + ".tmp")).rejects.toThrow();
  });
});
