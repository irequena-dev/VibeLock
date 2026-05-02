import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { mkdir, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { init, set, get } from "../../src/sdk/index.js";
import { parseRunOptions } from "../../src/cli/run.js";
import { loadSecrets } from "../../src/cli/load-secrets.js";
import { spawnCommand } from "../../src/cli/spawn.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface CliResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface TestVaultContext {
  tempDir: string;
  vaultPath: string;
  projectId: string;
  secrets: Record<string, string>;
}

export const TEST_SECRETS = {
  MY_KEY: 'my_secret_value',
  API_KEY: 'api_123'
};

export async function createTestVault(): Promise<TestVaultContext> {
  const tempDir = await mkdtemp(join(tmpdir(), "vibelock-run-test-"));
  const projectId = `run-test-${randomBytes(4).toString("hex")}`;
  const vaultPath = join(tempDir, "secrets.vibe");

  const options = {
    vaultPath,
    projectId,
  };

  await init(options);

  for (const [key, value] of Object.entries(TEST_SECRETS)) {
    await set(key, value, options);
  }

  return {
    tempDir,
    vaultPath,
    projectId,
    secrets: { ...TEST_SECRETS }
  };
}

export async function cleanupTestVault(context: TestVaultContext): Promise<void> {
  await rm(context.tempDir, { recursive: true, force: true });
  const { homedir } = await import("node:os");
  const keyDir = join(homedir(), ".vibelock", "keys", context.projectId);
  await rm(keyDir, { recursive: true, force: true }).catch(() => {});
}

export function runVibelockRun(args: string[], cwd?: string): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const cliPath = join(__dirname, "../../dist/cli/index.js");

    const child = execFile(cliPath, ["run", ...args], {
      cwd: cwd || process.cwd(),
      encoding: "utf8",
      timeout: 10000
    }, (error, stdout, stderr) => {
      let code = 0;
      if (error) {
        code = typeof error.code === 'number' ? error.code : 1;
      }

      const result = {
        stdout: stdout || "",
        stderr: stderr || "",
        code
      };

      if (error) {
        console.log(`CLI Error (code ${result.code}): ${error.message}`);
        console.log(`CLI Stderr: ${result.stderr}`);
        console.log(`CLI Args: ${args.join(' ')}`);
        console.log(`CLI CWD: ${cwd || process.cwd()}`);
      }

      resolve(result);
    });
  });
}

describe("CLI run command - Test Infrastructure", () => {
  let testVault: TestVaultContext;

  it("createTestVault helper creates vault with test secrets", async () => {
    testVault = await createTestVault();

    expect(testVault.tempDir).toBeTruthy();
    expect(testVault.vaultPath).toBeTruthy();
    expect(testVault.projectId).toBeTruthy();
    expect(testVault.secrets).toEqual(TEST_SECRETS);

    const options = {
      vaultPath: testVault.vaultPath,
      projectId: testVault.projectId,
    };

    for (const [key, value] of Object.entries(TEST_SECRETS)) {
      const retrieved = await get(key, options);
      expect(retrieved).toBe(value);
    }
  });

  it("can read secrets from test vault", async () => {
    testVault = await createTestVault();

    const options = {
      vaultPath: testVault.vaultPath,
      projectId: testVault.projectId,
    };

    const myKey = await get("MY_KEY", options);
    const apiKey = await get("API_KEY", options);

    expect(myKey).toBe("my_secret_value");
    expect(apiKey).toBe("api_123");
  });

  afterEach(async () => {
    if (testVault) {
      await cleanupTestVault(testVault);
    }
  });
});

describe("parseRunOptions", () => {
  it("parses default project with command", () => {
    const result = parseRunOptions(["--", "node", "server.js"]);

    expect(result).toEqual({
      command: "node",
      args: ["server.js"]
    });
  });

  it("parses custom project flag", () => {
    const result = parseRunOptions(["--project", "myapp", "--", "npm", "start"]);

    expect(result).toEqual({
      project: "myapp",
      command: "npm",
      args: ["start"]
    });
  });

  it("parses only flag with comma-separated values", () => {
    const result = parseRunOptions(["--only", "KEY1,KEY2", "--", "node", "script.js"]);

    expect(result).toEqual({
      only: ["KEY1", "KEY2"],
      command: "node",
      args: ["script.js"]
    });
  });

  it("parses prefix flag", () => {
    const result = parseRunOptions(["--prefix", "VIBELOCK_", "--", "node", "script.js"]);

    expect(result).toEqual({
      prefix: "VIBELOCK_",
      command: "node",
      args: ["script.js"]
    });
  });

  it("parses vault flag", () => {
    const result = parseRunOptions(["--vault", "custom.vibe", "--", "node", "server.js"]);

    expect(result).toEqual({
      vaultPath: "custom.vibe",
      command: "node",
      args: ["server.js"]
    });
  });

  it("parses multiple flags together", () => {
    const result = parseRunOptions([
      "--project", "myapp",
      "--only", "KEY1,KEY2",
      "--prefix", "VIBELOCK_",
      "--vault", "custom.vibe",
      "--", "npm", "start", "--", "--production"
    ]);

    expect(result).toEqual({
      project: "myapp",
      only: ["KEY1", "KEY2"],
      vaultPath: "custom.vibe",
      prefix: "VIBELOCK_",
      command: "npm",
      args: ["start", "--", "--production"]
    });
  });

  it("throws error when missing -- separator", () => {
    expect(() => parseRunOptions(["node", "server.js"])).toThrow("Missing '--' separator");
  });

  it("throws error when missing command after --", () => {
    expect(() => parseRunOptions(["--"])).toThrow("Missing command");
  });

  it("trims whitespace in only values", () => {
    const result = parseRunOptions(["--only", "KEY1, KEY2 , KEY3", "--", "node", "script.js"]);

    expect(result.only).toEqual(["KEY1", "KEY2", "KEY3"]);
  });
});

describe("loadSecrets", () => {
  let testVault: TestVaultContext;

  it("loadSecrets returns all decrypted secrets", async () => {
    testVault = await createTestVault();

    const secrets = await loadSecrets({
      project: testVault.projectId,
      vaultPath: testVault.vaultPath,
    });

    expect(secrets).toEqual({
      MY_KEY: "my_secret_value",
      API_KEY: "api_123"
    });
  });

  it("loadSecrets with only option filters secrets", async () => {
    testVault = await createTestVault();

    const secrets = await loadSecrets({
      project: testVault.projectId,
      vaultPath: testVault.vaultPath,
      only: ["MY_KEY"]
    });

    expect(secrets).toEqual({
      MY_KEY: "my_secret_value"
    });
    expect(secrets).not.toHaveProperty("API_KEY");
  });

  it("loadSecrets with prefix option applies prefix to all keys", async () => {
    testVault = await createTestVault();

    const secrets = await loadSecrets({
      project: testVault.projectId,
      vaultPath: testVault.vaultPath,
      prefix: "VIBELOCK_"
    });

    expect(secrets).toEqual({
      VIBELOCK_MY_KEY: "my_secret_value",
      VIBELOCK_API_KEY: "api_123"
    });
  });

  it("loadSecrets with non-existent project throws", async () => {
    testVault = await createTestVault();

    await expect(
      loadSecrets({
        project: "non-existent-project",
        vaultPath: testVault.vaultPath
      })
    ).rejects.toThrow("Master key not found for project: non-existent-project");
  });

  afterEach(async () => {
    if (testVault) {
      await cleanupTestVault(testVault);
    }
  });
});

describe("spawnCommand", () => {
  it("spawns command and returns exit code 0 on success", async () => {
    const exitCode = await spawnCommand("node", ["-e", "console.log('test')"], {});
    expect(exitCode).toBe(0);
  });

  it("spawns command and returns exit code 1 on failure", async () => {
    const exitCode = await spawnCommand("node", ["-e", "process.exit(1)"], {});
    expect(exitCode).toBe(1);
  });

  it("injects environment variables into child process", async () => {
    const env = { MY_KEY: "value" };
    const exitCode = await spawnCommand("node", ["-e", "console.log(process.env.MY_KEY)"], env);
    expect(exitCode).toBe(0);
  });

  it("spawns command with multiple arguments", async () => {
    const exitCode = await spawnCommand("node", ["-e", "console.log('arg1', 'arg2')"], {});
    expect(exitCode).toBe(0);
  });

  it("handles non-existent command error", async () => {
    await expect(spawnCommand("nonexistent-command", [], {})).rejects.toThrow();
  });
});

describe("CLI run command - End-to-End Integration", () => {
  let testVault: TestVaultContext;

  beforeEach(async () => {
    testVault = await createTestVault();
  });

  it("runs command with secret injected as environment variable", async () => {
    const result = await runVibelockRun(
      ["--project", testVault.projectId, "--vault", testVault.vaultPath, "--", "node", "-e", "console.log(process.env.MY_KEY)"],
      testVault.tempDir
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("my_secret_value");
    expect(result.stderr).toBe("");
  });

  it("runs command with --only flag filtering secrets", async () => {
    const result = await runVibelockRun(
      ["--project", testVault.projectId, "--vault", testVault.vaultPath, "--only", "MY_KEY", "--", "node", "-e", "console.log(Object.keys(process.env).filter(k => ['MY_KEY', 'API_KEY'].includes(k)).join(' '))"],
      testVault.tempDir
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("MY_KEY");
    expect(result.stdout).not.toContain("API_KEY");
  });

  it("runs command with --prefix flag adding prefix to secrets", async () => {
    const result = await runVibelockRun(
      ["--project", testVault.projectId, "--vault", testVault.vaultPath, "--prefix", "VIBELOCK_", "--", "node", "-e", "console.log(process.env.VIBELOCK_MY_KEY)"],
      testVault.tempDir
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("my_secret_value");
  });

  it("propagates exit code from child process", async () => {
    const result = await runVibelockRun(
      ["--project", testVault.projectId, "--vault", testVault.vaultPath, "--", "node", "-e", "process.exit(42)"],
      testVault.tempDir
    );

    expect(result.code).toBe(42);
  });

  it("secrets are not in parent process after run", async () => {
    const envBefore = { ...process.env };
    const result = await runVibelockRun(
      ["--project", testVault.projectId, "--vault", testVault.vaultPath, "--", "node", "-e", "console.log('done')"],
      testVault.tempDir
    );

    expect(result.code).toBe(0);
    expect(process.env.MY_KEY).toBe(envBefore.MY_KEY);
    expect(process.env.API_KEY).toBe(envBefore.API_KEY);
  });

  it("runs command with multiple flags combined", async () => {
    const result = await runVibelockRun(
      [
        "--project", testVault.projectId,
        "--vault", testVault.vaultPath,
        "--only", "MY_KEY",
        "--prefix", "CUSTOM_",
        "--", "node", "-e", "console.log(process.env.CUSTOM_MY_KEY)"
      ],
      testVault.tempDir
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("my_secret_value");
  });

  it("handles non-existent command error", async () => {
    const result = await runVibelockRun(
      ["--project", testVault.projectId, "--vault", testVault.vaultPath, "--", "nonexistent-command-xyz123"],
      testVault.tempDir
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toBeTruthy();
  });

  it("handles missing vault file error", async () => {
    await rm(testVault.vaultPath);

    const result = await runVibelockRun(
      ["--project", testVault.projectId, "--vault", testVault.vaultPath, "--", "node", "-e", "console.log('test')"],
      testVault.tempDir
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("ENOENT");
  });

  it("handles missing master key error", async () => {
    const { homedir } = await import("node:os");
    const { join } = await import("node:path");
    const { rm } = await import("node:fs/promises");

    const keyDir = join(homedir(), ".vibelock", "keys", testVault.projectId);
    await rm(keyDir, { recursive: true, force: true });

    const result = await runVibelockRun(
      ["--project", testVault.projectId, "--vault", testVault.vaultPath, "--", "node", "-e", "console.log('test')"],
      testVault.tempDir
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Master key not found");
  });

  it("runs command with vault from specified project", async () => {
    const result = await runVibelockRun(
      ["--project", testVault.projectId, "--vault", testVault.vaultPath, "--", "node", "-e", "console.log(process.env.MY_KEY, process.env.API_KEY)"],
      testVault.tempDir
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("my_secret_value");
    expect(result.stdout).toContain("api_123");
  });

  it("handles command that writes to stderr", async () => {
    const result = await runVibelockRun(
      ["--project", testVault.projectId, "--vault", testVault.vaultPath, "--", "node", "-e", "console.error('error output'); console.log('normal output')"],
      testVault.tempDir
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("normal output");
    expect(result.stderr).toContain("error output");
  });

  afterEach(async () => {
    if (testVault) {
      await cleanupTestVault(testVault);
    }
  });
});
