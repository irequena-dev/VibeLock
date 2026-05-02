import { promises as fs } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { writeFileSecure } from "./permissions.js";

export interface MasterKeyProvider {
  exists(): Promise<boolean>;
  read(): Promise<Buffer>;
  write(key: Buffer): Promise<void>;
  delete(): Promise<void>;
}

export class FileMasterKeyProvider implements MasterKeyProvider {
  private projectId: string;
  private basePath?: string;

  constructor(projectId: string, basePath?: string) {
    this.projectId = projectId;
    this.basePath = basePath;
  }

  private get filePath(): string {
    const base = this.basePath ?? path.join(homedir(), ".vibelock", "keys");
    return path.join(base, this.projectId, "master.key");
  }

  get keyPath(): string {
    return this.filePath;
  }

  get keyDir(): string {
    return path.dirname(this.filePath);
  }

  async exists(): Promise<boolean> {
    try {
      const stat = await fs.stat(this.filePath);
      return stat.size === 32;
    } catch {
      return false;
    }
  }

  async read(): Promise<Buffer> {
    let data: Buffer;
    try {
      data = await fs.readFile(this.filePath);
    } catch {
      throw new Error(`Master key file not found: ${this.filePath}`);
    }
    if (data.length !== 32) {
      throw new Error(
        `Invalid master key length: expected 32 bytes, got ${data.length}`
      );
    }
    return data;
  }

  async write(key: Buffer): Promise<void> {
    await writeFileSecure(this.filePath, key);
  }

  async delete(): Promise<void> {
    await fs.rm(this.filePath);
  }
}

export function getMasterKeyProvider(
  projectId?: string,
  options?: { keysPath?: string }
): MasterKeyProvider {
  const id = projectId ?? "default";
  const basePath = options?.keysPath ?? process.env.VIBELOCK_KEYS_PATH;
  return new FileMasterKeyProvider(id, basePath);
}
