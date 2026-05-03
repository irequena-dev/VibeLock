import { spawn } from "node:child_process";
import { loadSecrets } from "./load-secrets.js";

export interface DockerRunOptions {
  // VibeLock options (mirrored from RunOptions)
  project?: string;
  only?: string[];
  vaultPath?: string;
  prefix?: string;
  keysPath?: string;
  // Docker options
  image: string;
  dockerArgs: string[];
  command: string[];
}

const DOCKER_BOOLEAN_FLAGS = new Set<string>([
  "-d", "--detach",
  "-i", "--interactive",
  "-t", "--tty",
  "-it", "-ti", "-itd", "-tid", "-dit", "-dti", "-idt", "-tdi",
  "--rm",
  "--init",
  "--privileged",
  "--read-only",
  "-P", "--publish-all",
  "-q", "--quiet",
  "--no-healthcheck",
  "--oom-kill-disable",
  "--help",
]);

export function parseDockerRunOptions(argv: string[]): DockerRunOptions {
  const options: DockerRunOptions = {
    image: "",
    dockerArgs: [],
    command: [],
  };

  let i = 0;
  let foundSeparator = false;

  while (i < argv.length) {
    const arg = argv[i];

    if (arg === "--") {
      foundSeparator = true;
      i++;
      break;
    }

    switch (arg) {
      case "--project":
      case "-p":
        options.project = argv[i + 1];
        i += 2;
        break;

      case "--only":
        options.only = argv[i + 1].split(",").map((s) => s.trim());
        i += 2;
        break;

      case "--vault":
        options.vaultPath = argv[i + 1];
        i += 2;
        break;

      case "--prefix":
        options.prefix = argv[i + 1];
        i += 2;
        break;

      case "--keys-path":
      case "-k":
        options.keysPath = argv[i + 1];
        i += 2;
        break;

      default:
        i++;
        break;
    }
  }

  if (!foundSeparator) {
    throw new Error("Missing '--' separator before docker arguments");
  }

  const dockerSection = argv.slice(i);
  let imageIndex = -1;
  let j = 0;

  while (j < dockerSection.length) {
    const arg = dockerSection[j];

    if (!arg.startsWith("-")) {
      imageIndex = j;
      break;
    }

    if (arg.includes("=")) {
      // Self-contained flag like --name=foo, --env=KEY=value
      options.dockerArgs.push(arg);
      j++;
      continue;
    }

    if (DOCKER_BOOLEAN_FLAGS.has(arg)) {
      options.dockerArgs.push(arg);
      j++;
      continue;
    }

    const next = dockerSection[j + 1];
    if (next === undefined || next.startsWith("-")) {
      // No value follows: treat as boolean flag
      options.dockerArgs.push(arg);
      j++;
      continue;
    }

    // Flag with value
    options.dockerArgs.push(arg, next);
    j += 2;
  }

  if (imageIndex === -1) {
    throw new Error("Missing docker image after '--'");
  }

  options.image = dockerSection[imageIndex];
  options.command = dockerSection.slice(imageIndex + 1);

  return options;
}

export function formatEnvForStdin(secrets: Record<string, string>): string {
  for (const [key, value] of Object.entries(secrets)) {
    if (/[\r\n]/.test(value)) {
      throw new Error(
        `Secret '${key}' contains a newline character, which is not supported by 'docker --env-file'. ` +
          `Use 'vibelock run' instead, or remove newlines from the value.`
      );
    }
  }
  return Object.entries(secrets)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

export function buildDockerRunArgs(
  dockerArgs: string[],
  image: string,
  command: string[]
): string[] {
  return ["run", "--env-file", "/dev/stdin", ...dockerArgs, image, ...command];
}

export async function spawnDockerRun(
  dockerArgs: string[],
  image: string,
  command: string[],
  envContent: string,
  binary: string = "docker"
): Promise<number> {
  return new Promise((resolve, reject) => {
    const args = buildDockerRunArgs(dockerArgs, image, command);

    const child = spawn(binary, args, {
      stdio: ["pipe", "inherit", "inherit"],
    });

    if (!child.stdin) {
      reject(new Error("Failed to open stdin for docker process"));
      return;
    }

    // Ignore EPIPE if the child exits before reading stdin — the exit code
    // it surfaces (or the spawn 'error' event) is the source of truth.
    child.stdin.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPIPE") {
        reject(error);
      }
    });

    child.stdin.write(envContent);
    child.stdin.end();

    child.on("exit", (code) => resolve(code ?? 0));
    child.on("error", (error) => reject(error));
  });
}

export async function dockerRunCommand(options: DockerRunOptions): Promise<number> {
  const secrets = await loadSecrets(options);
  const envContent = formatEnvForStdin(secrets);
  return spawnDockerRun(
    options.dockerArgs,
    options.image,
    options.command,
    envContent
  );
}
