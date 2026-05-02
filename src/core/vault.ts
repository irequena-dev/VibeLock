import { promises as fs } from "node:fs";
import { writeFileSecure, writeFileAtomic } from "./permissions.js";

const REQUIRED_SECRET_FIELDS = ["iv", "tag", "ciphertext", "salt"] as const;
const HEX_FIELD_LENGTHS: Record<string, number> = {
  iv: 24,
  tag: 32,
  salt: 32,
};

export interface EncryptedSecret {
  iv: string;
  tag: string;
  ciphertext: string;
  salt: string;
}

export interface VaultData {
  version: 1;
  projectId?: string;
  keysPath?: string;
  env?: Record<string, string>;
  secrets: Record<string, EncryptedSecret>;
}

export class VaultVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultVersionError";
  }
}

export class VaultSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultSchemaError";
  }
}

function validateSecret(entry: unknown, key: string): void {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    throw new VaultSchemaError(`Secret "${key}" must be an object`);
  }
  const obj = entry as Record<string, unknown>;
  const fields = Object.keys(obj);
  if (fields.length !== REQUIRED_SECRET_FIELDS.length) {
    throw new VaultSchemaError(
      `Secret "${key}" must have exactly ${REQUIRED_SECRET_FIELDS.length} fields (iv, tag, ciphertext, salt)`,
    );
  }
  for (const field of REQUIRED_SECRET_FIELDS) {
    if (typeof obj[field] !== "string") {
      throw new VaultSchemaError(`Secret "${key}": field "${field}" must be a string`);
    }
  }
  for (const [field, expectedLen] of Object.entries(HEX_FIELD_LENGTHS)) {
    const value = obj[field] as string;
    if (value.length !== expectedLen) {
      throw new VaultSchemaError(
        `Secret "${key}": field "${field}" must be ${expectedLen} hex characters, got ${value.length}`,
      );
    }
    if (!/^[0-9a-fA-F]+$/.test(value)) {
      throw new VaultSchemaError(
        `Secret "${key}": field "${field}" must be valid hex`,
      );
    }
  }
  const ciphertext = obj.ciphertext as string;
  if (ciphertext.length === 0) {
    throw new VaultSchemaError(`Secret "${key}": field "ciphertext" must be non-empty`);
  }
}

function validateVaultData(data: unknown): asserts data is VaultData {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new VaultSchemaError("Vault file must contain a JSON object");
  }
  const obj = data as Record<string, unknown>;
  if (obj.version !== 1) {
    throw new VaultVersionError(
      `Unsupported vault version: ${obj.version}. Expected 1`,
    );
  }
  if (obj.projectId !== undefined && typeof obj.projectId !== "string") {
    throw new VaultSchemaError(`"projectId" must be a string`);
  }
  if (obj.keysPath !== undefined && typeof obj.keysPath !== "string") {
    throw new VaultSchemaError(`"keysPath" must be a string`);
  }
  if (obj.env !== undefined && (typeof obj.env !== "object" || obj.env === null || Array.isArray(obj.env))) {
    throw new VaultSchemaError(`"env" must be an object`);
  }
  if (typeof obj.secrets !== "object" || obj.secrets === null || Array.isArray(obj.secrets)) {
    throw new VaultSchemaError(`"secrets" must be an object`);
  }
  for (const [key, entry] of Object.entries(obj.secrets as Record<string, unknown>)) {
    validateSecret(entry, key);
  }
}

export async function create(vaultPath: string, projectId?: string, keysPath?: string): Promise<void> {
  const data: VaultData = { version: 1, secrets: {}, env: {} };
  if (projectId) {
    data.projectId = projectId;
  }
  if (keysPath) {
    data.keysPath = keysPath;
  }
  const json = JSON.stringify(data, null, 2) + "\n";
  await writeFileSecure(vaultPath, json, { flag: "wx" });
}

export async function load(vaultPath: string): Promise<VaultData> {
  const raw = await fs.readFile(vaultPath, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new VaultSchemaError("Vault file contains invalid JSON");
  }
  validateVaultData(parsed);
  return parsed;
}

export async function save(vaultPath: string, data: VaultData): Promise<void> {
  let mode = 0o600;
  try {
    const stat = await fs.stat(vaultPath);
    mode = stat.mode & 0o777;
  } catch {
    mode = 0o600;
  }
  const json = JSON.stringify(data, null, 2) + "\n";
  await writeFileAtomic(vaultPath, json, mode);
}

export async function addSecret(
  vaultPath: string,
  name: string,
  payload: EncryptedSecret,
): Promise<void> {
  const vault = await load(vaultPath);
  vault.secrets[name] = payload;
  await save(vaultPath, vault);
}

export async function getSecret(
  vaultPath: string,
  name: string,
): Promise<EncryptedSecret> {
  const vault = await load(vaultPath);
  const secret = vault.secrets[name];
  if (!secret) {
    throw new VaultSchemaError(`Secret "${name}" not found in vault`);
  }
  return secret;
}

export async function removeSecret(
  vaultPath: string,
  name: string,
): Promise<void> {
  const vault = await load(vaultPath);
  if (!(name in vault.secrets)) {
    throw new VaultSchemaError(`Secret "${name}" not found in vault`);
  }
  delete vault.secrets[name];
  await save(vaultPath, vault);
}

export async function listSecrets(vaultPath: string): Promise<string[]> {
  const vault = await load(vaultPath);
  return Object.keys(vault.secrets);
}

export async function exists(vaultPath: string): Promise<boolean> {
  try {
    await fs.access(vaultPath);
    return true;
  } catch {
    return false;
  }
}

export async function getVaultProjectId(vaultPath: string): Promise<string | undefined> {
  try {
    const vault = await load(vaultPath);
    return vault.projectId;
  } catch {
    return undefined;
  }
}

export async function getVaultKeysPath(vaultPath: string): Promise<string | undefined> {
  try {
    const vault = await load(vaultPath);
    return vault.keysPath;
  } catch {
    return undefined;
  }
}

export async function getVaultEnv(vaultPath: string): Promise<Record<string, string> | undefined> {
  try {
    const vault = await load(vaultPath);
    return vault.env;
  } catch {
    return undefined;
  }
}
