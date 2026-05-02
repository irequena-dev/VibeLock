import { promises as fs } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { load, exists } from "../core/vault.js";
import { FileMasterKeyProvider, getMasterKeyProvider } from "../core/masterkey.js";
import { resolve as resolvePath } from "node:path";

interface ResolveResult {
  vaultPath: string;
  keyDir: string;
  keyPath: string;
}

async function resolvePaths(
  opts: { project?: string; vault?: string; keysPath?: string }
): Promise<ResolveResult> {
  const vaultPath = opts.vault
    ? resolvePath(process.cwd(), opts.vault)
    : resolvePath(process.cwd(), "secrets.vibe");

  if (!(await exists(vaultPath))) {
    throw new Error(`Vault not found: ${vaultPath}`);
  }

  const vault = await load(vaultPath);
  const projectId = opts.project ?? vault.projectId ?? "default";
  const keysPath =
    opts.keysPath ??
    vault.keysPath ??
    process.env.VIBELOCK_KEYS_PATH;

  const provider = getMasterKeyProvider(projectId, { keysPath }) as FileMasterKeyProvider;

  return {
    vaultPath,
    keyDir: provider.keyDir,
    keyPath: provider.keyPath,
  };
}

function resolveUser(username: string): { uid: number; gid: number } {
  let uidResult: string;
  try {
    uidResult = execFileSync("id", ["-u", username], {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
  } catch {
    throw new Error(`User "${username}" not found.`);
  }

  let gidResult: string;
  try {
    gidResult = execFileSync("id", ["-g", username], {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
  } catch {
    throw new Error(`Could not resolve group for user "${username}".`);
  }

  return { uid: parseInt(uidResult, 10), gid: parseInt(gidResult, 10) };
}

async function checkTraversability(
  dirPath: string,
  uid: number,
  gid: number
): Promise<string[]> {
  const warnings: string[] = [];
  const parts = dirPath.split(path.sep);
  let current = "";

  for (let i = 1; i < parts.length; i++) {
    current += path.sep + parts[i];
    if (!current) continue;

    try {
      const stat = await fs.stat(current);
      const othersExec = (stat.mode & 0o001) !== 0;
      const isOwner = stat.uid === uid;
      const ownerExec = (stat.mode & 0o100) !== 0;
      const isGroup = stat.gid === gid;
      const groupExec = (stat.mode & 0o010) !== 0;

      const canTraverse = othersExec || (isOwner && ownerExec) || (isGroup && groupExec);
      if (!canTraverse) {
        warnings.push(current);
      }
    } catch {
      break;
    }
  }

  return warnings;
}

export async function grant(
  username: string,
  opts: { project?: string; vault?: string; keysPath?: string }
): Promise<void> {
  if (process.getuid?.() !== 0) {
    throw new Error("grant requires root. Run with sudo.");
  }

  const { vaultPath, keyDir, keyPath } = await resolvePaths(opts);
  const { uid, gid } = resolveUser(username);

  await fs.chown(keyDir, uid, gid);
  await fs.chmod(keyDir, 0o700);

  await fs.chown(keyPath, uid, gid);
  await fs.chmod(keyPath, 0o600);

  await fs.chown(vaultPath, uid, gid);
  await fs.chmod(vaultPath, 0o600);

  console.log(`✓ Ownership transferred to ${username}`);
  console.log(`  Vault:      ${vaultPath}`);
  console.log(`  Master key: ${keyPath}`);

  const warnings = await checkTraversability(keyDir, uid, gid);
  if (warnings.length > 0) {
    console.warn(`\n⚠ Warning: ${username} cannot traverse these directories:`);
    for (const dir of warnings) {
      console.warn(`  ${dir}`);
    }
    console.warn(`\n  Fix: sudo chmod o+x ${warnings.join(" ")}`);
  }
}
