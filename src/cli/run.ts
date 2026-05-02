import { loadSecrets } from "./load-secrets.js";
import { spawnCommand } from "./spawn.js";

export interface RunOptions {
  project?: string;
  only?: string[];
  vaultPath?: string;
  prefix?: string;
  command: string;
  args: string[];
  keysPath?: string;
}

export function parseRunOptions(argv: string[]): RunOptions {
  const options: RunOptions = {
    command: "",
    args: []
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
        options.only = argv[i + 1].split(",").map(s => s.trim());
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
    throw new Error("Missing '--' separator before command");
  }

  if (i >= argv.length) {
    throw new Error("Missing command after '--'");
  }

  options.command = argv[i];
  options.args = argv.slice(i + 1);

  return options;
}

export async function runCommand(options: RunOptions): Promise<number> {
  const secrets = await loadSecrets(options);
  const exitCode = await spawnCommand(options.command, options.args, secrets);
  return exitCode;
}
