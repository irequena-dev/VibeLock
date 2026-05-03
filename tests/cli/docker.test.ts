import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { mkdir, rm, mkdtemp, writeFile, readFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { init, set } from "../../src/sdk/index.js";
import {
  parseDockerRunOptions,
  formatEnvForStdin,
  spawnDockerRun,
  buildDockerRunArgs,
} from "../../src/cli/docker.js";

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
  const tempDir = await mkdtemp(join(tmpdir(), "vibelock-docker-test-"));
  const projectId = `docker-test-${randomBytes(4).toString("hex")}`;
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

function runVibelockDockerRun(args: string[], cwd?: string): Promise<CliResult> {
  return new Promise((resolve) => {
    const cliPath = join(__dirname, "../../dist/cli/index.js");

    const child = execFile(
      cliPath,
      ["docker", "run", ...args],
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

async function writeFakeDocker(dir: string): Promise<{
  scriptPath: string;
  argsPath: string;
  stdinPath: string;
}> {
  const scriptPath = join(dir, "fake-docker.sh");
  const argsPath = join(dir, "docker-args.log");
  const stdinPath = join(dir, "docker-stdin.log");

  const script = `#!/bin/sh
printf '%s\\n' "$@" > "${argsPath}"
cat > "${stdinPath}"
exit 0
`;
  await writeFile(scriptPath, script);
  await chmod(scriptPath, 0o755);

  return { scriptPath, argsPath, stdinPath };
}

describe("parseDockerRunOptions", () => {
  it("parses simple image name", () => {
    const result = parseDockerRunOptions(["--", "myimage"]);

    expect(result).toMatchObject({
      image: "myimage",
      dockerArgs: [],
      command: [],
    });
  });

  it("parses docker args before image", () => {
    const result = parseDockerRunOptions(["--", "--rm", "-p", "8080:80", "myimage"]);

    expect(result).toMatchObject({
      image: "myimage",
      dockerArgs: ["--rm", "-p", "8080:80"],
      command: [],
    });
  });

  it("parses VibeLock options before separator", () => {
    const result = parseDockerRunOptions([
      "--project", "myapp",
      "--only", "KEY1,KEY2",
      "--", "myimage",
    ]);

    expect(result).toMatchObject({
      project: "myapp",
      only: ["KEY1", "KEY2"],
      image: "myimage",
      dockerArgs: [],
      command: [],
    });
  });

  it("parses command after image", () => {
    const result = parseDockerRunOptions(["--", "myimage", "npm", "start"]);

    expect(result).toMatchObject({
      image: "myimage",
      dockerArgs: [],
      command: ["npm", "start"],
    });
  });

  it("throws when -- separator is missing", () => {
    expect(() => parseDockerRunOptions(["myimage"])).toThrow("Missing '--' separator");
  });

  it("throws when image is missing after --", () => {
    expect(() => parseDockerRunOptions(["--"])).toThrow("Missing docker image");
  });

  it("parses full combination of vibelock and docker options", () => {
    const result = parseDockerRunOptions([
      "--project", "myapp",
      "--prefix", "APP_",
      "--", "--rm", "--name", "myapp", "-p", "8080:80",
      "myimage:latest", "node", "server.js",
    ]);

    expect(result).toEqual({
      project: "myapp",
      prefix: "APP_",
      image: "myimage:latest",
      dockerArgs: ["--rm", "--name", "myapp", "-p", "8080:80"],
      command: ["node", "server.js"],
    });
  });

  it("parses --vault and --keys-path options", () => {
    const result = parseDockerRunOptions([
      "--vault", "custom.vibe",
      "--keys-path", "/etc/keys",
      "--", "myimage",
    ]);

    expect(result).toMatchObject({
      vaultPath: "custom.vibe",
      keysPath: "/etc/keys",
      image: "myimage",
    });
  });

  it("parses self-contained flags with =", () => {
    const result = parseDockerRunOptions([
      "--", "--name=myapp", "--env=KEY=value", "myimage",
    ]);

    expect(result).toMatchObject({
      image: "myimage",
      dockerArgs: ["--name=myapp", "--env=KEY=value"],
    });
  });

  it("recognizes -it as a boolean flag", () => {
    const result = parseDockerRunOptions(["--", "-it", "myimage", "bash"]);

    expect(result).toMatchObject({
      image: "myimage",
      dockerArgs: ["-it"],
      command: ["bash"],
    });
  });

  it("recognizes --rm as boolean flag without consuming the image", () => {
    const result = parseDockerRunOptions(["--", "--rm", "myimage"]);

    expect(result).toMatchObject({
      image: "myimage",
      dockerArgs: ["--rm"],
    });
  });

  it("trims whitespace in --only values", () => {
    const result = parseDockerRunOptions([
      "--only", "KEY1, KEY2 , KEY3", "--", "myimage",
    ]);

    expect(result.only).toEqual(["KEY1", "KEY2", "KEY3"]);
  });
});

describe("formatEnvForStdin", () => {
  it("formats KEY=VALUE pairs separated by newlines", () => {
    const result = formatEnvForStdin({ FOO: "bar", BAZ: "qux" });
    expect(result).toBe("FOO=bar\nBAZ=qux");
  });

  it("returns empty string for empty object", () => {
    expect(formatEnvForStdin({})).toBe("");
  });

  it("preserves spaces in values", () => {
    const result = formatEnvForStdin({ MSG: "hello world" });
    expect(result).toBe("MSG=hello world");
  });

  it("preserves = characters in values", () => {
    const result = formatEnvForStdin({ EQ: "a=b=c" });
    expect(result).toBe("EQ=a=b=c");
  });

  it("preserves quote characters in values", () => {
    const result = formatEnvForStdin({ Q: '"quoted"' });
    expect(result).toBe('Q="quoted"');
  });

  it("formats a single entry without trailing newline", () => {
    const result = formatEnvForStdin({ ONLY: "value" });
    expect(result).toBe("ONLY=value");
    expect(result.endsWith("\n")).toBe(false);
  });

  it("throws when a value contains \\n (docker --env-file does not support multi-line values)", () => {
    expect(() => formatEnvForStdin({ PEM: "-----BEGIN-----\nABC\n-----END-----" })).toThrow(
      /Secret 'PEM' contains a newline character/
    );
  });

  it("throws when a value contains \\r", () => {
    expect(() => formatEnvForStdin({ KEY: "value\rmore" })).toThrow(
      /Secret 'KEY' contains a newline character/
    );
  });

  it("error message points users to 'vibelock run' as an alternative", () => {
    expect(() => formatEnvForStdin({ KEY: "a\nb" })).toThrow(/vibelock run/);
  });
});

describe("buildDockerRunArgs", () => {
  it("builds args with --env-file /dev/stdin first", () => {
    const args = buildDockerRunArgs([], "myimage", []);
    expect(args).toEqual(["run", "--env-file", "/dev/stdin", "myimage"]);
  });

  it("preserves docker args between --env-file and image", () => {
    const args = buildDockerRunArgs(["--rm", "-p", "8080:80"], "myimage", []);
    expect(args).toEqual([
      "run", "--env-file", "/dev/stdin",
      "--rm", "-p", "8080:80",
      "myimage",
    ]);
  });

  it("appends command after image", () => {
    const args = buildDockerRunArgs(["--rm"], "myimage", ["node", "server.js"]);
    expect(args).toEqual([
      "run", "--env-file", "/dev/stdin",
      "--rm",
      "myimage", "node", "server.js",
    ]);
  });
});

describe("spawnDockerRun", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "vibelock-spawn-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("spawns binary with run --env-file /dev/stdin and forwards stdin content", async () => {
    const { scriptPath, argsPath, stdinPath } = await writeFakeDocker(tempDir);

    const exitCode = await spawnDockerRun(
      ["--rm"],
      "myimage",
      ["echo", "hi"],
      "FOO=bar\nBAZ=qux",
      scriptPath
    );

    expect(exitCode).toBe(0);

    const args = (await readFile(argsPath, "utf8")).trim().split("\n");
    expect(args).toEqual([
      "run",
      "--env-file",
      "/dev/stdin",
      "--rm",
      "myimage",
      "echo",
      "hi",
    ]);

    const stdin = await readFile(stdinPath, "utf8");
    expect(stdin).toBe("FOO=bar\nBAZ=qux");
  });

  it("propagates non-zero exit code from spawned process", async () => {
    const scriptPath = join(tempDir, "fail-docker.sh");
    await writeFile(scriptPath, "#!/bin/sh\nexit 42\n");
    await chmod(scriptPath, 0o755);

    const exitCode = await spawnDockerRun([], "myimage", [], "", scriptPath);
    expect(exitCode).toBe(42);
  });

  it("rejects when binary does not exist", async () => {
    await expect(
      spawnDockerRun([], "myimage", [], "", "/no/such/binary-xyz123")
    ).rejects.toThrow();
  });
});

describe("CLI vibelock docker run - End-to-End", () => {
  let testVault: TestVaultContext;
  let fakeDockerDir: string;
  let fakeDockerPath: string;
  let originalPath: string | undefined;

  beforeEach(async () => {
    testVault = await createTestVault();

    fakeDockerDir = await mkdtemp(join(tmpdir(), "vibelock-fake-docker-"));
    fakeDockerPath = join(fakeDockerDir, "docker");
    const argsLog = join(fakeDockerDir, "args.log");
    const stdinLog = join(fakeDockerDir, "stdin.log");
    const script = `#!/bin/sh
printf '%s\\n' "$@" > "${argsLog}"
cat > "${stdinLog}"
exit 0
`;
    await writeFile(fakeDockerPath, script);
    await chmod(fakeDockerPath, 0o755);

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

  it("runs docker with secrets piped via stdin", async () => {
    const result = await runVibelockDockerRun(
      [
        "--project", testVault.projectId,
        "--vault", testVault.vaultPath,
        "--", "--rm", "alpine",
      ],
      testVault.tempDir
    );

    expect(result.code).toBe(0);

    const argsLog = await readFile(join(fakeDockerDir, "args.log"), "utf8");
    const argsLines = argsLog.trim().split("\n");
    expect(argsLines).toEqual([
      "run",
      "--env-file",
      "/dev/stdin",
      "--rm",
      "alpine",
    ]);

    const stdinLog = await readFile(join(fakeDockerDir, "stdin.log"), "utf8");
    expect(stdinLog).toContain("MY_KEY=my_secret_value");
    expect(stdinLog).toContain("API_KEY=api_123");
  });

  it("respects --only filter when piping secrets to docker", async () => {
    const result = await runVibelockDockerRun(
      [
        "--project", testVault.projectId,
        "--vault", testVault.vaultPath,
        "--only", "MY_KEY",
        "--", "alpine",
      ],
      testVault.tempDir
    );

    expect(result.code).toBe(0);

    const stdinLog = await readFile(join(fakeDockerDir, "stdin.log"), "utf8");
    expect(stdinLog).toContain("MY_KEY=my_secret_value");
    expect(stdinLog).not.toContain("API_KEY");
  });

  it("respects --prefix when piping secrets to docker", async () => {
    const result = await runVibelockDockerRun(
      [
        "--project", testVault.projectId,
        "--vault", testVault.vaultPath,
        "--prefix", "APP_",
        "--", "alpine",
      ],
      testVault.tempDir
    );

    expect(result.code).toBe(0);

    const stdinLog = await readFile(join(fakeDockerDir, "stdin.log"), "utf8");
    expect(stdinLog).toContain("APP_MY_KEY=my_secret_value");
    expect(stdinLog).toContain("APP_API_KEY=api_123");
  });

  it("forwards docker args, image and command in correct order", async () => {
    const result = await runVibelockDockerRun(
      [
        "--project", testVault.projectId,
        "--vault", testVault.vaultPath,
        "--", "--rm", "--name", "myapp", "-p", "8080:80",
        "myimage:latest", "node", "server.js",
      ],
      testVault.tempDir
    );

    expect(result.code).toBe(0);

    const argsLog = await readFile(join(fakeDockerDir, "args.log"), "utf8");
    const argsLines = argsLog.trim().split("\n");
    expect(argsLines).toEqual([
      "run",
      "--env-file",
      "/dev/stdin",
      "--rm",
      "--name",
      "myapp",
      "-p",
      "8080:80",
      "myimage:latest",
      "node",
      "server.js",
    ]);
  });

  it("errors when -- separator is missing", async () => {
    const result = await runVibelockDockerRun(
      [
        "--project", testVault.projectId,
        "--vault", testVault.vaultPath,
        "myimage",
      ],
      testVault.tempDir
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Missing '--' separator");
  });

  it("errors when image is missing after --", async () => {
    const result = await runVibelockDockerRun(
      [
        "--project", testVault.projectId,
        "--vault", testVault.vaultPath,
        "--",
      ],
      testVault.tempDir
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Missing docker image");
  });

  it("errors with a clear message when a secret contains a newline", async () => {
    await set("MULTILINE", "line1\nline2", {
      vaultPath: testVault.vaultPath,
      projectId: testVault.projectId,
    });

    const result = await runVibelockDockerRun(
      [
        "--project", testVault.projectId,
        "--vault", testVault.vaultPath,
        "--", "alpine",
      ],
      testVault.tempDir
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("MULTILINE");
    expect(result.stderr).toContain("newline character");
  });
});
