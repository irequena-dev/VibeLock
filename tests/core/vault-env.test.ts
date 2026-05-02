import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { create, load, save, addSecret } from "../../src/core/vault.js";
import { randomBytes } from "node:crypto";

const baseTmp = path.join(
  os.tmpdir(),
  `vibelock-env-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
);

beforeAll(async () => {
  await fs.mkdir(baseTmp, { recursive: true });
});

afterAll(async () => {
  await fs.rm(baseTmp, { recursive: true, force: true });
});

describe("Environment Variables Core Functions", () => {
  let vaultPath: string;

  beforeAll(() => {
    vaultPath = path.join(baseTmp, "test-secrets.vibe");
  });

  it("should create vault with env", async () => {
    const { create: createVault } = await import("../../src/core/vault.js");
    await createVault(vaultPath, "test-project");
    
    const exists = await fs.access(vaultPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it("should add env to vault", async () => {
    const vault = await load(vaultPath);
    vault.env = { DB_URL: "jdbc:postgresql://localhost:5432/test" };
    await save(vaultPath, vault);
    
    const updatedVault = await load(vaultPath);
    expect(updatedVault.env?.DB_URL).toBe("jdbc:postgresql://localhost:5432/test");
  });

  it("should add multiple env variables", async () => {
    const vault = await load(vaultPath);
    vault.env = {
      DB_URL: "jdbc:postgresql://localhost:5432/test",
      SERVER_PORT: "8080",
      LOG_LEVEL: "INFO"
    };
    await save(vaultPath, vault);
    
    const updatedVault = await load(vaultPath);
    expect(updatedVault.env?.DB_URL).toBe("jdbc:postgresql://localhost:5432/test");
    expect(updatedVault.env?.SERVER_PORT).toBe("8080");
    expect(updatedVault.env?.LOG_LEVEL).toBe("INFO");
  });

  it("should separate env from secrets", async () => {
    // Add a secret
    await addSecret(vaultPath, "API_KEY", {
      iv: "1a2b3c4d5e6f789012345678",
      tag: "9876543210fedcba098765432109876a",
      ciphertext: "encrypted_data_here",
      salt: "deadbeef12345678deadbeef12345678"
    });
    
    const vault = await load(vaultPath);
    expect(vault.secrets?.API_KEY).toBeDefined();
    expect(vault.env?.DB_URL).toBe("jdbc:postgresql://localhost:5432/test");
    expect(vault.env?.SERVER_PORT).toBe("8080");
  });

  it("should handle empty env", async () => {
    const vault = await load(vaultPath);
    vault.env = {};
    await save(vaultPath, vault);
    
    const updatedVault = await load(vaultPath);
    expect(updatedVault.env).toEqual({});
  });

  it("should handle missing env", async () => {
    const vault = await load(vaultPath);
    expect(vault.env).toBeDefined();
    expect(typeof vault.env).toBe("object");
  });

  it("should maintain secrets when updating env", async () => {
    const vault = await load(vaultPath);
    expect(vault.secrets?.API_KEY).toBeDefined();
    
    // Update env only
    vault.env = {
      ...vault.env,
      NEW_ENV: "new_value"
    };
    await save(vaultPath, vault);
    
    const updatedVault = await load(vaultPath);
    expect(updatedVault.secrets?.API_KEY).toBeDefined();
    expect(updatedVault.env?.NEW_ENV).toBe("new_value");
  });
});