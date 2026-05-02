import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { mkdir, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { readFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface CliResult {
  stdout: string;
  stderr: string;
  code: number;
}

function runCli(args: string[], cwd?: string, stdin?: string): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const cliPath = join(__dirname, "../../dist/cli/index.js");
    
    const child = execFile(cliPath, args, { 
      cwd: cwd || process.cwd(),
      encoding: "utf8",
      timeout: 10000
    }, (error, stdout, stderr) => {
      const result = {
        stdout: stdout || "",
        stderr: stderr || "",
        code: error?.code || 0
      };
      
      if (error) {
        console.log(`CLI Error (code ${result.code}): ${error.message}`);
        console.log(`CLI Stderr: ${result.stderr}`);
        console.log(`CLI Args: ${args.join(' ')}`);
        console.log(`CLI CWD: ${cwd || process.cwd()}`);
      }
      
      resolve(result);
    });

    if (stdin) {
      child.stdin.write(stdin);
      child.stdin.end();
    }
  });
}

describe("CLI Integration Tests", () => {
  let tempDir: string;
  let originalHome: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "vibelock-test-"));
    originalHome = process.env.HOME || "";
    process.env.HOME = tempDir;
    // Create the .vibelock/keys structure with proper permissions
    const vibelockDir = join(tempDir, ".vibelock");
    const keysDir = join(vibelockDir, "keys");
    await mkdir(vibelockDir, { recursive: true, mode: 0o700 });
    await mkdir(keysDir, { recursive: true, mode: 0o700 });
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("init creates vault and master key (verify both files exist)", async () => {
    const vaultPath = join(tempDir, "secrets.vibe");
    
    const result = await runCli(["init"], tempDir);
    
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Vault initialized successfully");
    expect(result.stdout).toContain("Project:    default");
    expect(result.stdout).toContain("Vault:      " + vaultPath);
    
    const masterKeyPath = join(tempDir, ".vibelock", "keys", "default", "master.key");
    expect(existsSync(masterKeyPath)).toBe(true);
    expect(existsSync(vaultPath)).toBe(true);
  });

  it("init twice warns about existing key (code !== 0)", async () => {
    await runCli(["init"], tempDir);
    
    const result = await runCli(["init"], tempDir);
    
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("Master key already exists");
  });

  it("init --force without --project is rejected", async () => {
    await runCli(["init"], tempDir);

    const result = await runCli(["init", "--force"], tempDir);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("--force requires --project");
  });

  it("init --force --project overwrites existing vault and master key", async () => {
    await runCli(["init", "--project", "myapp"], tempDir);
    await runCli(["set", "KEY1", "--project", "myapp"], tempDir, "value1\n");

    const result = await runCli(["init", "--force", "--project", "myapp"], tempDir);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Vault initialized successfully");
    expect(result.stdout).toContain("Project:    myapp");

    const getResult = await runCli(["get", "KEY1", "--project", "myapp"], tempDir);
    expect(getResult.code).not.toBe(0);
    expect(getResult.stderr).toContain("not found");
  });

  it("set + get round-trip (test with piped input)", async () => {
    await runCli(["init"], tempDir);
    
    const setResult = await runCli(["set", "test-key"], tempDir, "test-value\n");
    expect(setResult.code).toBe(0);
    expect(setResult.stdout).toContain('✓ Secret "test-key" saved successfully');
    
    const getResult = await runCli(["get", "test-key"], tempDir);
    expect(getResult.code).toBe(0);
    expect(getResult.stdout.trim()).toBe("test-value");
  });

  it("get nonexistent key exits with code 1", async () => {
    await runCli(["init"], tempDir);
    
    const result = await runCli(["get", "nonexistent"], tempDir);
    
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("not found");
  });

  it("list shows all keys (set multiple and verify)", async () => {
    await runCli(["init"], tempDir);
    
    await runCli(["set", "key1"], tempDir, "value1\n");
    await runCli(["set", "key2"], tempDir, "value2\n");
    await runCli(["set", "key3"], tempDir, "value3\n");
    
    const result = await runCli(["list"], tempDir);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("key1");
    expect(result.stdout).toContain("key2");
    expect(result.stdout).toContain("key3");
  });

  it("remove deletes a key", async () => {
    await runCli(["init"], tempDir);
    
    await runCli(["set", "test-key"], tempDir, "test-value\n");
    
    const removeResult = await runCli(["remove", "test-key"], tempDir);
    expect(removeResult.code).toBe(0);
    expect(removeResult.stdout).toContain('✓ Secret "test-key" removed successfully');
    
    const getResult = await runCli(["get", "test-key"], tempDir);
    expect(getResult.code).not.toBe(0);
  });

  it("remove nonexistent exits with code 1", async () => {
    await runCli(["init"], tempDir);
    
    const result = await runCli(["remove", "nonexistent"], tempDir);
    
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("not found");
  });

  it("status shows vault info (path, secrets count, project, etc)", async () => {
    await runCli(["init"], tempDir);
    await runCli(["set", "test-key"], tempDir, "test-value\n");
    
    const result = await runCli(["status"], tempDir);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Project: default");
    expect(result.stdout).toContain("secrets.vibe");
    expect(result.stdout).toContain("Master key: exists");
    expect(result.stdout).toContain("Vault file: exists");
    expect(result.stdout).toContain("Secrets: 1");
  });

  it("--vault flag overrides path", async () => {
    const customVaultPath = join(tempDir, "custom.vibe");
    
    await runCli(["init", "--vault", "custom.vibe"], tempDir);
    await runCli(["set", "test-key", "--vault", "custom.vibe"], tempDir, "test-value\n");
    
    const getResult = await runCli(["get", "test-key", "--vault", "custom.vibe"], tempDir);
    expect(getResult.code).toBe(0);
    expect(getResult.stdout.trim()).toBe("test-value");
    
    const result = await runCli(["status", "--vault", "custom.vibe"], tempDir);
    // Test that the vault exists and has our data
    expect(existsSync(join(tempDir, "secrets.vibe"))).toBe(false);
    expect(existsSync(customVaultPath)).toBe(true);
    expect(result.stdout).toContain("Secrets: 1");
  });

  it("--project flag selects correct master key", async () => {
    await runCli(["init", "--project", "project1", "--vault", "vault1.vibe"], tempDir);
    await runCli(["init", "--project", "project2", "--vault", "vault2.vibe"], tempDir);
    
    await runCli(["set", "shared-key", "--project", "project1", "--vault", "vault1.vibe"], tempDir, "value1\n");
    const project1Result = await runCli(["get", "shared-key", "--project", "project1", "--vault", "vault1.vibe"], tempDir);
    
    await runCli(["set", "shared-key", "--project", "project2", "--vault", "vault2.vibe"], tempDir, "value2\n");
    const project2Result = await runCli(["get", "shared-key", "--project", "project2", "--vault", "vault2.vibe"], tempDir);
    
    expect(project1Result.stdout.trim()).toBe("value1");
    expect(project2Result.stdout.trim()).toBe("value2");
  });

  it("--project isolation (different projects don't share secrets)", async () => {
    await runCli(["init", "--project", "projectA", "--vault", "vaultA.vibe"], tempDir);
    await runCli(["init", "--project", "projectB", "--vault", "vaultB.vibe"], tempDir);
    
    await runCli(["set", "secret1", "--project", "projectA", "--vault", "vaultA.vibe"], tempDir, "valueA\n");
    await runCli(["set", "secret2", "--project", "projectB", "--vault", "vaultB.vibe"], tempDir, "valueB\n");
    
    const projectAResult = await runCli(["list", "--project", "projectA", "--vault", "vaultA.vibe"], tempDir);
    const projectBResult = await runCli(["list", "--project", "projectB", "--vault", "vaultB.vibe"], tempDir);
    
    expect(projectAResult.stdout).toContain("secret1");
    expect(projectAResult.stdout).not.toContain("secret2");
    expect(projectBResult.stdout).toContain("secret2");
    expect(projectBResult.stdout).not.toContain("secret1");
  });

  it("piped input works (echo \"value\" | vibelock set KEY)", async () => {
    await runCli(["init"], tempDir);
    
    const echoProcess = spawn("echo", ["\"piped-value\""], { cwd: tempDir });
    const cliProcess = spawn("node", [join(__dirname, "../../dist/cli/index.js"), "set", "piped-key"], {
      cwd: tempDir,
      stdio: ["pipe", "pipe", "pipe"]
    });
    
    let stdout = "";
    let stderr = "";
    
    cliProcess.stdout.on("data", (data) => stdout += data.toString());
    cliProcess.stderr.on("data", (data) => stderr += data.toString());
    
    echoProcess.stdout.pipe(cliProcess.stdin);
    
    await new Promise((resolve) => {
      cliProcess.on("close", resolve);
    });
    
    const getResult = await runCli(["get", "piped-key"], tempDir);
    expect(getResult.code).toBe(0);
    expect(getResult.stdout.trim().replace(/"/g, "")).toBe("piped-value");
  });

  describe("cleanup command", () => {
    it("cleanup deletes master key and vault file with confirmation", async () => {
      await runCli(["init"], tempDir);
      await runCli(["set", "test-key"], tempDir, "test-value\n");
      
      // Verify both exist
      expect(existsSync(join(tempDir, "secrets.vibe"))).toBe(true);
      expect(existsSync(join(tempDir, ".vibelock", "keys", "default", "master.key"))).toBe(true);
      
      // Cleanup with confirmation (will fail without 'y' input)
      const result = await runCli(["cleanup"], tempDir, "y\n");
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("✓ Vault file deleted");
      expect(result.stdout).toContain("✓ Master key deleted");
      expect(existsSync(join(tempDir, "secrets.vibe"))).toBe(false);
      expect(existsSync(join(tempDir, ".vibelock", "keys", "default", "master.key"))).toBe(false);
    });

    it("cleanup --force deletes without confirmation", async () => {
      await runCli(["init"], tempDir);
      
      const result = await runCli(["cleanup", "--force"], tempDir);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("✓ Vault file deleted");
      expect(result.stdout).toContain("✓ Master key deleted");
      expect(existsSync(join(tempDir, "secrets.vibe"))).toBe(false);
      expect(existsSync(join(tempDir, ".vibelock", "keys", "default", "master.key"))).toBe(false);
    });

    it("cleanup warns if vault file missing but deletes key", async () => {
      await runCli(["init"], tempDir);
      
      // Delete vault file manually
      rmSync(join(tempDir, "secrets.vibe"));
      expect(existsSync(join(tempDir, "secrets.vibe"))).toBe(false);
      
      const result = await runCli(["cleanup"], tempDir, "y\n");
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Warning: Vault file not found");
      expect(result.stdout).toContain("✓ Master key deleted");
      expect(existsSync(join(tempDir, ".vibelock", "keys", "default", "master.key"))).toBe(false);
    });

    it("cleanup exits with error if master key missing", async () => {
      // Create vault file but no master key
      await runCli(["init"], tempDir);
      rmSync(join(tempDir, ".vibelock"), { recursive: true, force: true });
      
      const result = await runCli(["cleanup"], tempDir, "y\n");
      
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("Master key not found");
    });

    it("cleanup with --project deletes correct project key", async () => {
      await runCli(["init", "--project", "staging", "--vault", "vault-staging.vibe"], tempDir);
      await runCli(["init", "--project", "prod", "--vault", "vault-prod.vibe"], tempDir);
      
      // Verify both exist
      expect(existsSync(join(tempDir, "vault-staging.vibe"))).toBe(true);
      expect(existsSync(join(tempDir, "vault-prod.vibe"))).toBe(true);
      
      // Cleanup only staging (need to specify vault path)
      const result = await runCli(["cleanup", "--project", "staging", "--vault", "vault-staging.vibe"], tempDir, "y\n");
      
      expect(result.code).toBe(0);
      expect(existsSync(join(tempDir, "vault-staging.vibe"))).toBe(false);
      expect(existsSync(join(tempDir, "vault-prod.vibe"))).toBe(true);
      expect(existsSync(join(tempDir, ".vibelock", "keys", "staging", "master.key"))).toBe(false);
      expect(existsSync(join(tempDir, ".vibelock", "keys", "prod", "master.key"))).toBe(true);
    });

    it("cleanup fails confirmation and does nothing", async () => {
      await runCli(["init"], tempDir);
      
      // Answer 'n' to confirmation
      const result = await runCli(["cleanup"], tempDir, "n\n");
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Cleanup cancelled");
      expect(existsSync(join(tempDir, "secrets.vibe"))).toBe(true);
      expect(existsSync(join(tempDir, ".vibelock", "keys", "default", "master.key"))).toBe(true);
    });
  });
});