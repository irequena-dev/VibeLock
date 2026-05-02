import { Command } from "commander";
import { load, exists, save } from "../core/vault.js";

export function addEnvCommands(program: Command): void {
  program
    .command("env [key]")
    .description("Get environment variables (non-secrets) from vault")
    .option("-a, --all", "List all environment variables")
    .option("--values", "Show values with keys")
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
        
        const vault = await load(vaultPath);
        
        if (opts.all) {
          if (vault.env) {
            Object.entries(vault.env).forEach(([k, v]) => {
              console.log(`${k}=${v}`);
            });
          } else {
            console.log("No environment variables defined in vault.");
          }
        } else if (key) {
          if (!vault.env || !(key in vault.env)) {
            console.error(`Error: Environment variable '${key}' not found.`);
            process.exit(1);
          }
          console.log(vault.env[key]);
        } else {
          if (vault.env) {
            if (opts.values) {
              Object.entries(vault.env).forEach(([k, v]) => {
                console.log(`${k}=${v}`);
              });
            } else {
              console.log("Environment variables:");
              Object.keys(vault.env).forEach(key => {
                console.log(`  ${key}`);
              });
            }
          } else {
            console.log("No environment variables defined in vault.");
          }
        }
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });

  program
    .command("set-env <key> <value>")
    .description("Set an environment variable (non-secret) in vault")
    .action(async (key, value) => {
      const globalOpts = program.opts();
      try {
        const { vaultPath, provider } = await resolveContext(globalOpts);
        
        if (!await provider.exists()) {
          console.error("Error: Missing master key. Run `vibelock init` first.");
          process.exit(1);
        }
        
        const vault = await load(vaultPath);
        if (!vault.env) {
          vault.env = {};
        }
        
        vault.env[key] = value;
        
        // Update vault with modified data
        await save(vaultPath, vault);
        
        console.log(`✓ Environment variable "${key}" set to "${value}"`);
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });

  program
    .command("remove-env <key>")
    .description("Remove an environment variable from vault")
    .action(async (key) => {
      const globalOpts = program.opts();
      try {
        const { vaultPath, provider } = await resolveContext(globalOpts);
        
        if (!await provider.exists()) {
          console.error("Error: Missing master key. Run `vibelock init` first.");
          process.exit(1);
        }
        
        const vault = await load(vaultPath);
        if (!vault.env || !(key in vault.env)) {
          console.error(`Error: Environment variable '${key}' not found.`);
          process.exit(1);
        }
        
        delete vault.env[key];
        
        await save(vaultPath, vault);
        
        console.log(`✓ Environment variable "${key}" removed`);
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });

  // Import utilities
  async function resolveContext(opts: { project?: string; vault?: string; keysPath?: string }) {
    const { getMasterKeyProvider } = await import("../core/masterkey.js");
    const { resolve } = await import("node:path");
    
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
    
    let keysPath = opts.keysPath;
    if (!keysPath && process.env.VIBELOCK_KEYS_PATH) {
      keysPath = process.env.VIBELOCK_KEYS_PATH;
    } else if (!keysPath) {
      const { getVaultKeysPath } = await import("../core/vault.js");
      const vaultKeysPath = await getVaultKeysPath(vaultPath);
      if (vaultKeysPath) {
        keysPath = vaultKeysPath;
      }
    }
    
    const provider = getMasterKeyProvider(projectId, { keysPath });
    
    return { projectId, vaultPath, provider, keysPath };
  }
}