import { randomBytes } from "node:crypto"
import { getMasterKeyProvider } from "../core/masterkey.js"
import type { MasterKeyProvider } from "../core/masterkey.js"
import { create, addSecret, getSecret, removeSecret, listSecrets, exists, getVaultProjectId, getVaultKeysPath, getVaultEnv } from "../core/vault.js"
import { deriveKey, encrypt, decrypt, SALT_LENGTH } from "../core/crypto.js"

export interface VibeLockOptions {
  vaultPath?: string
}

export interface VibeLockInitOptions extends VibeLockOptions {
  projectId?: string
  keysPath?: string
}

export const DEFAULT_VAULT_PATH = "./secrets.vibe"

function resolveVaultPath(options?: VibeLockOptions): string {
  return options?.vaultPath ?? process.env.VIBELOCK_VAULT_PATH ?? DEFAULT_VAULT_PATH
}

async function resolveProjectId(vaultPath: string): Promise<string> {
  const vaultProject = await getVaultProjectId(vaultPath)
  return vaultProject ?? "default"
}

async function resolveKeysPath(vaultPath: string): Promise<string | undefined> {
  if (process.env.VIBELOCK_KEYS_PATH) return process.env.VIBELOCK_KEYS_PATH
  return getVaultKeysPath(vaultPath)
}

async function getProvider(vaultPath: string): Promise<MasterKeyProvider> {
  const projectId = await resolveProjectId(vaultPath)
  const keysPath = await resolveKeysPath(vaultPath)
  return getMasterKeyProvider(projectId, { keysPath })
}

export async function init(options?: VibeLockInitOptions): Promise<void> {
  const vaultPath = resolveVaultPath(options)
  const projectId = options?.projectId ?? "default"
  const keysPath = options?.keysPath ?? process.env.VIBELOCK_KEYS_PATH
  const provider = getMasterKeyProvider(projectId, { keysPath })

  if (await exists(vaultPath)) {
    throw new Error(`Vault already exists: ${vaultPath}`)
  }

  if (await provider.exists()) {
    throw new Error(`Master key already exists for project: ${projectId}`)
  }

  const key = randomBytes(32)
  await provider.write(key)
  await create(vaultPath, projectId, keysPath)
}

export async function set(key: string, value: string, options?: VibeLockOptions): Promise<void> {
  const vaultPath = resolveVaultPath(options)
  const provider = await getProvider(vaultPath)
  const masterKey = await provider.read()
  const salt = randomBytes(SALT_LENGTH)
  const derivedKey = deriveKey(masterKey, salt)
  const { iv, tag, ciphertext } = encrypt(derivedKey, value)
  await addSecret(vaultPath, key, { iv, tag, ciphertext, salt: salt.toString("hex") })
}

export async function get(key: string, options?: VibeLockOptions): Promise<string> {
  const vaultPath = resolveVaultPath(options)
  const provider = await getProvider(vaultPath)
  const masterKey = await provider.read()
  const secret = await getSecret(vaultPath, key)
  const derivedKey = deriveKey(masterKey, Buffer.from(secret.salt, "hex"))
  return decrypt(derivedKey, secret.iv, secret.tag, secret.ciphertext)
}

export async function list(options?: VibeLockOptions): Promise<string[]> {
  const vaultPath = resolveVaultPath(options)
  return listSecrets(vaultPath)
}

export async function remove(key: string, options?: VibeLockOptions): Promise<void> {
  const vaultPath = resolveVaultPath(options)
  await removeSecret(vaultPath, key)
}

export async function getEnv(key?: string, options?: VibeLockOptions): Promise<string | Record<string, string> | undefined> {
  const vaultPath = resolveVaultPath(options)
  const env = await getVaultEnv(vaultPath)
  if (!env) return undefined
  if (key) return env[key]
  return env
}
