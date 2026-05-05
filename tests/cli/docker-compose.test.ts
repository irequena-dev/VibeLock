import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { rm, mkdtemp, writeFile, readFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { init, set } from "../../src/sdk/index.js";
import {
  parseDockerComposeOptions,
  spawnDockerCompose,
} from "../../src/cli/docker-compose.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface CliResult {
  stdout: string;
  stderr: string;
  code: number;
}

interface TestVaultContext {
  tempDir: string;
  vaultPath: string;
  projectId: string;
  secrets: Record<string, string>;
}

const TEST_SECRETS = {
  MY_KEY: "my_secret_value",
  API_KEY: "api_123",
};

async function createTestVault(): Promise<TestVaultContext> {
  const tempDir = await mkdtemp(join(tmpdir(), "vibelock-compose-test-"));
  const projectId = `compose-test-${randomBytes(4).toString("hex")}`;
  const vaultPath = join(tempDir, "secrets.vibe");

  const options = { vaultPath, projectId };
  await init(options);

  for (const [key, value] of Object.entries(TEST_SECRETS)) {
    await set(key, value, options);
  }

  return {
    tempDir,
    vaultPath,
    projectId,
    secrets: { ...TEST_SECRETS },
  };
}

async function cleanupTestVault(context: TestVaultContext): Promise<void> {
  await rm(context.tempDir, { recursive: true, force: true });
  const { homedir } = await import("node:os");
  const keyDir = join(homedir(), ".vibelock", "keys", context.projectId);
  await rm(keyDir, { recursive: true, force: true }).catch(() => {});
}

function runVibelockDockerCompose(args: string[], cwd?: string): Promise<CliResult> {
  return new Promise((resolve) => {
    const cliPath = join(__dirname, "../../dist/cli/index.js");

    const child = execFile(
      cliPath,
      ["docker", "compose", ...args],
      { cwd: cwd || process.cwd(), encoding: "utf8", timeout: 10000 },
      (error, stdout, stderr) => {
        let code = 0;
        if (error) {
          code = typeof error.code === "number" ? error.code : 1;
        }
        resolve({
          stdout: stdout || "",
          stderr: stderr || "",
          code,
        });
      }
    );

    void child;
  });
}

async function writeFakeDockerForCompose(dir: string): Promise<{
  scriptPath: string;
  argsPath: string;
  envPath: string;
}> {
  const scriptPath = join(dir, "docker");
  const argsPath = join(dir, "args.log");
  const envPath = join(dir, "env.log");

  // Captures all positional args, then a filtered view of the env so we can
  // assert that secrets reach the child process without leaking unrelated
  // host environment variables into the snapshot.
  const script = `#!/bin/sh
printf '%s\\n' "$@" > "${argsPath}"
env | grep -E '^(MY_KEY|API_KEY|APP_|MULTILINE|CUSTOM_)' > "${envPath}" || true
exit 0
`;
  await writeFile(scriptPath, script);
  await chmod(scriptPath, 0o755);

  return { scriptPath, argsPath, envPath };
}

describe("parseDockerComposeOptions", () => {
  it("parses a single compose subcommand", () => {
    const result = parseDockerComposeOptions(["--", "up"]);

    expect(result).toMatchObject({
      composeArgs: ["up"],
    });
  });

  it("parses compose subcommand with flags", () => {
    const result = parseDockerComposeOptions(["--", "up", "-d"]);

    expect(result).toMatchObject({
      composeArgs: ["up", "-d"],
    });
  });

  it("parses VibeLock options before separator", () => {
    const result = parseDockerComposeOptions([
      "--project", "myapp",
      "--only", "KEY1,KEY2",
      "--", "up",
    ]);

    expect(result).toMatchObject({
      project: "myapp",
      only: ["KEY1", "KEY2"],
      composeArgs: ["up"],
    });
  });

  it("parses --vault and --keys-path options", () => {
    const result = parseDockerComposeOptions([
      "--vault", "custom.vibe",
      "--keys-path", "/etc/keys",
      "--", "up", "-d",
    ]);

    expect(result).toMatchObject({
      vaultPath: "custom.vibe",
      keysPath: "/etc/keys",
      composeArgs: ["up", "-d"],
    });
  });

  it("accepts -v as shorthand for --vault", () => {
    const result = parseDockerComposeOptions(["-v", "custom.vibe", "--", "up"]);

    expect(result).toMatchObject({
      vaultPath: "custom.vibe",
      composeArgs: ["up"],
    });
  });

  it("accepts -k as shorthand for --keys-path", () => {
    const result = parseDockerComposeOptions(["-k", "/etc/keys", "--", "up"]);

    expect(result).toMatchObject({
      keysPath: "/etc/keys",
      composeArgs: ["up"],
    });
  });

  it("accepts -p as shorthand for --project", () => {
    const result = parseDockerComposeOptions(["-p", "myapp", "--", "up"]);

    expect(result).toMatchObject({
      project: "myapp",
      composeArgs: ["up"],
    });
  });

  it("parses --prefix option", () => {
    const result = parseDockerComposeOptions([
      "--prefix", "APP_",
      "--", "up",
    ]);

    expect(result).toMatchObject({
      prefix: "APP_",
      composeArgs: ["up"],
    });
  });

  it("parses full combination of vibelock options and compose args", () => {
    const result = parseDockerComposeOptions([
      "--project", "myapp",
      "--prefix", "APP_",
      "--vault", "custom.vibe",
      "--", "up", "-d", "--build",
    ]);

    expect(result).toEqual({
      project: "myapp",
      prefix: "APP_",
      vaultPath: "custom.vibe",
      composeArgs: ["up", "-d", "--build"],
    });
  });

  it("trims whitespace in --only values", () => {
    const result = parseDockerComposeOptions([
      "--only", "KEY1, KEY2 , KEY3", "--", "up",
    ]);

    expect(result.only).toEqual(["KEY1", "KEY2", "KEY3"]);
  });

  it("throws when -- separator is missing", () => {
    expect(() => parseDockerComposeOptions(["up"])).toThrow(
      "Missing '--' separator before compose arguments"
    );
  });

  it("throws when no arguments follow the -- separator", () => {
    expect(() => parseDockerComposeOptions(["--"])).toThrow(
      /Missing compose arguments after '--'/
    );
  });

  it("throws when no arguments follow the -- separator after vibelock options", () => {
    expect(() =>
      parseDockerComposeOptions(["--project", "myapp", "--"])
    ).toThrow(/Missing compose arguments/);
  });
});

describe("spawnDockerCompose", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "vibelock-compose-spawn-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("spawns binary with 'compose' as first arg followed by composeArgs", async () => {
    const { scriptPath, argsPath } = await writeFakeDockerForCompose(tempDir);

    const exitCode = await spawnDockerCompose(
      ["up", "-d"],
      { MY_KEY: "value" },
      scriptPath
    );

    expect(exitCode).toBe(0);

    const args = (await readFile(argsPath, "utf8")).trim().split("\n");
    expect(args).toEqual(["compose", "up", "-d"]);
  });

  it("injects secrets as environment variables in the spawned process", async () => {
    const { scriptPath, envPath } = await writeFakeDockerForCompose(tempDir);

    const exitCode = await spawnDockerCompose(
      ["up"],
      { MY_KEY: "my_secret_value", API_KEY: "api_123" },
      scriptPath
    );

    expect(exitCode).toBe(0);

    const envContent = await readFile(envPath, "utf8");
    expect(envContent).toContain("MY_KEY=my_secret_value");
    expect(envContent).toContain("API_KEY=api_123");
  });

  it("propagates non-zero exit code from spawned process", async () => {
    const scriptPath = join(tempDir, "fail-docker.sh");
    await writeFile(scriptPath, "#!/bin/sh\nexit 17\n");
    await chmod(scriptPath, 0o755);

    const exitCode = await spawnDockerCompose(["up"], {}, scriptPath);
    expect(exitCode).toBe(17);
  });

  it("rejects when binary does not exist", async () => {
    await expect(
      spawnDockerCompose(["up"], {}, "/no/such/binary-xyz123")
    ).rejects.toThrow();
  });

  it("forwards multiple compose args in order", async () => {
    const { scriptPath, argsPath } = await writeFakeDockerForCompose(tempDir);

    const exitCode = await spawnDockerCompose(
      ["-f", "compose.prod.yml", "up", "-d", "--build"],
      {},
      scriptPath
    );

    expect(exitCode).toBe(0);

    const args = (await readFile(argsPath, "utf8")).trim().split("\n");
    expect(args).toEqual([
      "compose",
      "-f",
      "compose.prod.yml",
      "up",
      "-d",
      "--build",
    ]);
  });
});

describe("CLI vibelock docker compose - End-to-End", () => {
  let testVault: TestVaultContext;
  let fakeDockerDir: string;
  let originalPath: string | undefined;

  beforeEach(async () => {
    testVault = await createTestVault();

    fakeDockerDir = await mkdtemp(join(tmpdir(), "vibelock-fake-docker-compose-"));
    await writeFakeDockerForCompose(fakeDockerDir);

    originalPath = process.env.PATH;
    process.env.PATH = `${fakeDockerDir}:${originalPath ?? ""}`;
  });

  afterEach(async () => {
    if (originalPath !== undefined) {
      process.env.PATH = originalPath;
    }
    await rm(fakeDockerDir, { recursive: true, force: true });
    if (testVault) {
      await cleanupTestVault(testVault);
    }
  });

  it("runs `docker compose up -d` with secrets injected as env vars", async () => {
    const result = await runVibelockDockerCompose(
      [
        "--project", testVault.projectId,
        "--vault", testVault.vaultPath,
        "--", "up", "-d",
      ],
      testVault.tempDir
    );

    expect(result.code).toBe(0);

    const argsLog = await readFile(join(fakeDockerDir, "args.log"), "utf8");
    const argsLines = argsLog.trim().split("\n");
    expect(argsLines).toEqual(["compose", "up", "-d"]);

    const envLog = await readFile(join(fakeDockerDir, "env.log"), "utf8");
    expect(envLog).toContain("MY_KEY=my_secret_value");
    expect(envLog).toContain("API_KEY=api_123");
  });

  it("respects --only filter", async () => {
    const result = await runVibelockDockerCompose(
      [
        "--project", testVault.projectId,
        "--vault", testVault.vaultPath,
        "--only", "MY_KEY",
        "--", "up",
      ],
      testVault.tempDir
    );

    expect(result.code).toBe(0);

    const envLog = await readFile(join(fakeDockerDir, "env.log"), "utf8");
    expect(envLog).toContain("MY_KEY=my_secret_value");
    expect(envLog).not.toContain("API_KEY=api_123");
  });

  it("respects --prefix when injecting secrets", async () => {
    const result = await runVibelockDockerCompose(
      [
        "--project", testVault.projectId,
        "--vault", testVault.vaultPath,
        "--prefix", "APP_",
        "--", "up",
      ],
      testVault.tempDir
    );

    expect(result.code).toBe(0);

    const envLog = await readFile(join(fakeDockerDir, "env.log"), "utf8");
    expect(envLog).toContain("APP_MY_KEY=my_secret_value");
    expect(envLog).toContain("APP_API_KEY=api_123");
  });

  it("forwards compose args in correct order", async () => {
    const result = await runVibelockDockerCompose(
      [
        "--project", testVault.projectId,
        "--vault", testVault.vaultPath,
        "--", "-f", "compose.prod.yml", "up", "-d", "--build",
      ],
      testVault.tempDir
    );

    expect(result.code).toBe(0);

    const argsLog = await readFile(join(fakeDockerDir, "args.log"), "utf8");
    const argsLines = argsLog.trim().split("\n");
    expect(argsLines).toEqual([
      "compose",
      "-f",
      "compose.prod.yml",
      "up",
      "-d",
      "--build",
    ]);
  });

  it("supports secrets containing newlines (unlike docker run)", async () => {
    const pemValue = "-----BEGIN CERTIFICATE-----\nABCDEF\n-----END CERTIFICATE-----";
    await set("MULTILINE", pemValue, {
      vaultPath: testVault.vaultPath,
      projectId: testVault.projectId,
    });

    const result = await runVibelockDockerCompose(
      [
        "--project", testVault.projectId,
        "--vault", testVault.vaultPath,
        "--only", "MULTILINE",
        "--", "up",
      ],
      testVault.tempDir
    );

    expect(result.code).toBe(0);

    const envLog = await readFile(join(fakeDockerDir, "env.log"), "utf8");
    // env(1) prints "KEY=first-line"; remaining lines from the multi-line
    // value appear unprefixed in subsequent lines. We assert on the leading
    // line which proves the variable was set with the original content.
    expect(envLog).toContain("MULTILINE=-----BEGIN CERTIFICATE-----");
  });

  it("errors when -- separator is missing", async () => {
    const result = await runVibelockDockerCompose(
      [
        "--project", testVault.projectId,
        "--vault", testVault.vaultPath,
        "up",
      ],
      testVault.tempDir
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Missing '--' separator");
  });

  it("errors when no compose arguments follow --", async () => {
    const result = await runVibelockDockerCompose(
      [
        "--project", testVault.projectId,
        "--vault", testVault.vaultPath,
        "--",
      ],
      testVault.tempDir
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Missing compose arguments");
  });
});
