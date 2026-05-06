import { spawn } from "node:child_process";
import { loadSecrets } from "./load-secrets.js";

export interface DockerComposeOptions {
  // VibeLock options
  project?: string;
  only?: string[];
  vaultPath?: string;
  prefix?: string;
  keysPath?: string;
  // Compose args (everything after --)
  composeArgs: string[];
}

export function parseDockerComposeOptions(argv: string[]): DockerComposeOptions {
  const options: DockerComposeOptions = {
    composeArgs: [],
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
      case "-v":
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
    throw new Error("Missing '--' separator before compose arguments");
  }

  const composeArgs = argv.slice(i);
  if (composeArgs.length === 0) {
    throw new Error("Missing compose arguments after '--' (e.g., 'up', 'down', 'build')");
  }

  options.composeArgs = composeArgs;
  return options;
}

export async function spawnDockerCompose(
  composeArgs: string[],
  secrets: Record<string, string>,
  binary: string = "docker"
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ["compose", ...composeArgs], {
      env: { ...process.env, ...secrets },
      stdio: "inherit",
    });

    child.on("exit", (code) => resolve(code ?? 0));
    child.on("error", (error) => reject(error));
  });
}

export async function dockerComposeCommand(options: DockerComposeOptions): Promise<number> {
  const secrets = await loadSecrets(options);
  return spawnDockerCompose(options.composeArgs, secrets);
}
