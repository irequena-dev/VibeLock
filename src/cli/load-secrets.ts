import type { RunOptions } from "./run.js";
import { getMasterKeyProvider } from "../core/masterkey.js";
import { getVaultKeysPath, load } from "../core/vault.js";
import { list as listSecrets } from "../sdk/index.js";
import { get as sdkGet } from "../sdk/index.js";

export async function loadSecrets(
  options: Pick<RunOptions, "project" | "vaultPath" | "only" | "prefix" | "keysPath">
): Promise<Record<string, string>> {
  let projectId = options.project;

  const vaultPath = options.vaultPath ?? "./secrets.vibe";

  if (!projectId) {
    const { getVaultProjectId } = await import("../core/vault.js");
    const vaultProject = await getVaultProjectId(vaultPath);
    if (vaultProject) {
      projectId = vaultProject;
    }
  }

  projectId = projectId ?? "default";

  let keysPath = options.keysPath;
  if (!keysPath && process.env.VIBELOCK_KEYS_PATH) {
    keysPath = process.env.VIBELOCK_KEYS_PATH;
  }
  if (!keysPath) {
    keysPath = await getVaultKeysPath(vaultPath);
  }

  const provider = getMasterKeyProvider(projectId, { keysPath });

  if (!(await provider.exists())) {
    throw new Error(`Master key not found for project: ${projectId}`);
  }

  const sdkOptions = {
    projectId: projectId,
    vaultPath: options.vaultPath,
    keysPath: keysPath,
  };

  const secretNames = await listSecrets(sdkOptions);

  let secrets: Record<string, string> = {};

  const vault = await load(vaultPath);
  if (vault.env) {
    secrets = { ...vault.env };
  }

  for (const name of secretNames) {
    const value = await sdkGet(name, sdkOptions);
    secrets[name] = value;
  }

  if (options.only) {
    const filteredSecrets: Record<string, string> = {};
    for (const key of options.only) {
      if (key in secrets) {
        filteredSecrets[key] = secrets[key];
      }
    }
    secrets = filteredSecrets;
  }

  if (options.prefix) {
    const prefixedSecrets: Record<string, string> = {};
    for (const [key, value] of Object.entries(secrets)) {
      prefixedSecrets[options.prefix + key] = value;
    }
    secrets = prefixedSecrets;
  }

  return secrets;
}
