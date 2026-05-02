#!/usr/bin/env node

import { Command } from "commander";
import { deriveKey, encrypt, decrypt, SALT_LENGTH } from "../core/crypto.js";
import { getMasterKeyProvider } from "../core/masterkey.js";
import { create, addSecret, getSecret, removeSecret, listSecrets, exists, load, getVaultKeysPath } from "../core/vault.js";
import { promptSecret, promptConfirm, promptInput } from "./prompt.js";
import { parseRunOptions, runCommand } from "./run.js";
import { grant } from "./grant.js";
import { addEnvCommands } from "./env.js";
import { randomBytes } from "node:crypto";
import { readFileSync, promises as fs } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkg = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf-8"));

async function resolveKeysPath(opts: { keysPath?: string }, vaultPath: string): Promise<string | undefined> {
  if (opts.keysPath) return opts.keysPath;
  if (process.env.VIBELOCK_KEYS_PATH) return process.env.VIBELOCK_KEYS_PATH;
  return getVaultKeysPath(vaultPath);
}

async function resolveContext(opts: { project?: string; vault?: string; keysPath?: string }) {
  const vaultPath = opts.vault ? resolve(process.cwd(), opts.vault) : resolve(process.cwd(), "secrets.vibe");
  
  let projectId = opts.project;
  
  if (!projectId) {
    const { getVaultProjectId } = await import("../core/vault.js");
    const vaultProject = await getVaultProjectId(vaultPath);
    if (vaultProject) {
      projectId = vaultProject;
    }
  }
  
  projectId = projectId ?? "default";
  
  const keysPath = await resolveKeysPath(opts, vaultPath);
  const provider = getMasterKeyProvider(projectId, { keysPath });
  
  return { projectId, vaultPath, provider, keysPath };
}

const program = new Command();

program
  .name("vibelock")
  .version(pkg.version)
  .description("VibeLock CLI - Secure secret management")
  .option("-p, --project <id>", "Project ID")
  .option("-v, --vault <path>", "Vault file path", "secrets.vibe")
  .option("-k, --keys-path <path>", "Custom master key storage directory")
  .showHelpAfterError()
  .showSuggestionAfterError();

program
  .command("init")
  .description("Initialize a new vault and master key")
  .option("-f, --force", "Force overwrite existing master key and vault (requires --project)")
  .option("-y, --yes", "Skip interactive prompts and use defaults")
  .action(async (opts) => {
    const globalOpts = program.opts();
    const mergedOpts = { ...globalOpts, ...opts };
    const interactive = process.stdin.isTTY === true && !opts.yes;

    if (opts.force && !mergedOpts.project) {
      console.error("Error: --force requires --project to prevent accidental overwrite of the default project.");
      process.exit(1);
    }

    // 1. Project name
    let projectId: string;
    if (mergedOpts.project) {
      projectId = mergedOpts.project;
    } else if (interactive) {
      projectId = await promptInput("Project name:", "default");
    } else {
      projectId = "default";
    }

    // 2. Vault directory (filename is always secrets.vibe)
    let vaultPath: string;
    if (mergedOpts.vault && mergedOpts.vault !== "secrets.vibe") {
      vaultPath = resolve(process.cwd(), mergedOpts.vault);
    } else if (interactive) {
      const vaultDir = await promptInput("Vault directory:", "./");
      vaultPath = resolve(process.cwd(), vaultDir, "secrets.vibe");
    } else {
      vaultPath = resolve(process.cwd(), "secrets.vibe");
    }

    // 3. Keys directory (default includes project name)
    let keysPath: string | undefined;
    if (mergedOpts.keysPath) {
      keysPath = mergedOpts.keysPath;
    } else if (process.env.VIBELOCK_KEYS_PATH) {
      keysPath = process.env.VIBELOCK_KEYS_PATH;
    } else if (interactive) {
      const defaultKeysDir = resolve(homedir(), ".vibelock/keys") + "/";
      const keysDir = await promptInput("Keys directory:", defaultKeysDir);
      const normalizedInput = resolve(keysDir);
      const normalizedDefault = resolve(homedir(), ".vibelock/keys");
      if (normalizedInput === normalizedDefault) {
        keysPath = undefined;
      } else {
        keysPath = keysDir;
      }
    }

    const provider = getMasterKeyProvider(projectId, { keysPath });
    
    if (await provider.exists() && !opts.force) {
      console.error(`Error: Master key already exists for project "${projectId}".`);
      console.error("Use --force --project <id> to overwrite.");
      process.exit(1);
    }
    
    if (await exists(vaultPath) && !opts.force) {
      console.error(`Error: Vault already exists at "${vaultPath}".`);
      process.exit(1);
    }
    
    if (opts.force) {
      if (await exists(vaultPath)) {
        await fs.unlink(vaultPath);
      }
      if (await provider.exists()) {
        await provider.delete();
      }
    }
    
    console.log(`Initializing vault for project "${projectId}"...`);
    
    try {
      const masterKey = randomBytes(32);
      await provider.write(masterKey);
      await create(vaultPath, projectId, keysPath);
      
      const resolvedKeysDir = keysPath ?? resolve(homedir(), ".vibelock/keys");
      console.log(`✓ Vault initialized successfully`);
      console.log(`  Project:    ${projectId}`);
      console.log(`  Vault:      ${vaultPath}`);
      console.log(`  Master key: ${resolve(resolvedKeysDir, projectId, "master.key")}`);
    } catch (error) {
      console.error(`Error initializing vault: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

program
  .command("set")
  .argument("<key>", "Secret key name")
  .description("Set a secret value")
  .action(async (key, opts) => {
    const globalOpts = program.opts();
    const mergedOpts = { ...globalOpts, ...opts };
    const { vaultPath, provider } = await resolveContext(mergedOpts);
    
    try {
      if (!await provider.exists()) {
        console.error("Error: Missing master key. Run `vibelock init` first.");
        process.exit(1);
      }
      
      if (!await exists(vaultPath)) {
        console.error("Error: No vault found. Run `vibelock init`.");
        process.exit(1);
      }
      
      console.log(`Enter secret value for "${key}":`);
      const secretValue = await promptSecret();
      
      const masterKey = await provider.read();
      const salt = randomBytes(SALT_LENGTH);
      const derivedKey = deriveKey(masterKey, salt);
      
      const encrypted = encrypt(derivedKey, secretValue);
      
      await addSecret(vaultPath, key, {
        ...encrypted,
        salt: salt.toString("hex")
      });
      
      console.log(`✓ Secret "${key}" saved successfully`);
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

program
  .command("get")
  .argument("<key>", "Secret key name")
  .description("Get and decrypt a secret value")
  .action(async (key, opts) => {
    const globalOpts = program.opts();
    const mergedOpts = { ...globalOpts, ...opts };
    const { vaultPath, provider } = await resolveContext(mergedOpts);
    
    try {
      if (!await provider.exists()) {
        console.error("Error: Missing master key. Run `vibelock init` first.");
        process.exit(1);
      }
      
      if (!await exists(vaultPath)) {
        console.error("Error: No vault found. Run `vibelock init`.");
        process.exit(1);
      }
      
      const secret = await getSecret(vaultPath, key);
      const masterKey = await provider.read();
      const salt = Buffer.from(secret.salt, "hex");
      const derivedKey = deriveKey(masterKey, salt);
      
      const decrypted = decrypt(derivedKey, secret.iv, secret.tag, secret.ciphertext);
      console.log(decrypted);
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        console.error(`Error: Secret '${key}' not found.`);
      } else {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }
      process.exit(1);
    }
  });

program
  .command("list")
  .description("List all secret keys")
  .action(async (opts) => {
    const globalOpts = program.opts();
    const mergedOpts = { ...globalOpts, ...opts };
    const { vaultPath, provider } = await resolveContext(mergedOpts);
    
    try {
      if (!await provider.exists()) {
        console.error("Error: Missing master key. Run `vibelock init` first.");
        process.exit(1);
      }
      
      if (!await exists(vaultPath)) {
        console.error("Error: No vault found. Run `vibelock init`.");
        process.exit(1);
      }
      
      const keys = await listSecrets(vaultPath);
      keys.forEach(key => console.log(key));
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

program
  .command("secrets")
  .description("List all secret keys (alias for list)")
  .action(async (opts) => {
    const globalOpts = program.opts();
    const mergedOpts = { ...globalOpts, ...opts };
    const { vaultPath, provider } = await resolveContext(mergedOpts);
    
    try {
      if (!await provider.exists()) {
        console.error("Error: Missing master key. Run `vibelock init` first.");
        process.exit(1);
      }
      
      if (!await exists(vaultPath)) {
        console.error("Error: No vault found. Run `vibelock init`.");
        process.exit(1);
      }
      
      const keys = await listSecrets(vaultPath);
      keys.forEach(key => console.log(key));
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

program
  .command("remove")
  .argument("<key>", "Secret key name")
  .description("Remove a secret")
  .action(async (key, opts) => {
    const globalOpts = program.opts();
    const mergedOpts = { ...globalOpts, ...opts };
    const { vaultPath, provider } = await resolveContext(mergedOpts);
    
    try {
      if (!await provider.exists()) {
        console.error("Error: Missing master key. Run `vibelock init` first.");
        process.exit(1);
      }
      
      if (!await exists(vaultPath)) {
        console.error("Error: No vault found. Run `vibelock init`.");
        process.exit(1);
      }
      
      await removeSecret(vaultPath, key);
      console.log(`✓ Secret "${key}" removed successfully`);
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        console.error(`Error: Secret '${key}' not found.`);
      } else {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }
      process.exit(1);
    }
  });

program
  .command("status")
  .description("Show vault information")
  .action(async (opts) => {
    const globalOpts = program.opts();
    const mergedOpts = { ...globalOpts, ...opts };
    const { projectId, vaultPath, provider, keysPath } = await resolveContext(mergedOpts);
    
    try {
      const masterKeyExists = await provider.exists();
      const vaultExists = await exists(vaultPath);
      
      const keysDir = keysPath ?? resolve(homedir(), ".vibelock/keys");
      console.log(`Project: ${projectId}`);
      console.log(`Vault: ${vaultPath}`);
      console.log(`Keys: ${keysDir}`);
      console.log(`Master key: ${masterKeyExists ? "exists" : "missing"}`);
      console.log(`Vault file: ${vaultExists ? "exists" : "missing"}`);
      
      if (vaultExists && masterKeyExists) {
        try {
          const vault = await load(vaultPath);
          const secretCount = Object.keys(vault.secrets).length;
          console.log(`Secrets: ${secretCount}`);
          
          if (vault.env) {
            const envCount = Object.keys(vault.env).length;
            console.log(`Environment variables: ${envCount}`);
          }
        } catch (error) {
          console.log(`Vault: corrupted`);
        }
      }
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

program
  .command("cleanup")
  .description("Delete master key and vault file for current project")
  .option("-f, --force", "Skip confirmation (DANGEROUS)")
  .action(async (opts) => {
    const globalOpts = program.opts();
    const mergedOpts = { ...globalOpts, ...opts };
    const { projectId, vaultPath, provider } = await resolveContext(mergedOpts);
    
    try {
      const masterKeyExists = await provider.exists();
      const vaultExists = await exists(vaultPath);
      
      if (!masterKeyExists && !vaultExists) {
        console.error("Error: Nothing to clean up. Master key and vault file do not exist.");
        process.exit(1);
      }
      
      if (!masterKeyExists) {
        console.error("Error: Master key not found for project.");
        process.exit(1);
      }
      
      if (!vaultExists) {
        console.log(`Warning: Vault file not found at "${vaultPath}".`);
      }
      
      console.log(`This will delete:`);
      console.log(`  - Master key: ${projectId}`);
      if (vaultExists) {
        console.log(`  - Vault file: ${vaultPath}`);
      }
      
      if (!opts.force) {
        const confirmed = await promptConfirm("Are you sure?");
        if (!confirmed) {
          console.log("Cleanup cancelled.");
          process.exit(0);
        }
      }
      
      if (vaultExists) {
        await fs.unlink(vaultPath);
        console.log(`✓ Vault file deleted`);
      }
      
      await provider.delete();
      console.log(`✓ Master key deleted`);
      
      console.log(`Cleanup completed successfully for project "${projectId}".`);
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

program
  .command("grant <username>")
  .description("Transfer vault and key ownership to a system user (requires sudo)")
  .action(async (username) => {
    const globalOpts = program.opts();
    try {
      await grant(username, globalOpts);
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

program
  .command("run")
  .argument("[args...]", "")
  .description("Run a command with secrets injected as environment variables\nUsage: vibelock run [options] -- <command> [args...]")
  .allowUnknownOption()
  .action(async () => {
    try {
      const runArgs = process.argv.slice(3);
      const runOptions = parseRunOptions(runArgs);
      const exitCode = await runCommand(runOptions);
      process.exit(exitCode);
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

// Add new commands
addEnvCommands(program);

await program.parseAsync(process.argv);
