import { promises as fs } from "node:fs";
import path from "node:path";

export class PermissionDeniedError extends Error {
  constructor(dirPath: string) {
    const msg =
      `Cannot create ${dirPath} (permission denied).\n\n` +
      `System directories require sudo. Run:\n` +
      `  sudo mkdir -p ${dirPath}\n` +
      `  sudo chown $(whoami) ${dirPath}\n\n` +
      `Then retry your vibelock command.`;
    super(msg);
    this.name = "PermissionDeniedError";
  }
}

export async function writeFileSecure(
  filePath: string,
  data: string | Buffer,
  writeOpts?: { flag?: string }
): Promise<void> {
  const dir = path.dirname(filePath);
  try {
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "EACCES") {
      throw new PermissionDeniedError(dir);
    }
    throw err;
  }
  await fs.writeFile(filePath, data, writeOpts);
  await fs.chmod(filePath, 0o600);
}

export async function writeFileAtomic(
  filePath: string,
  data: string | Buffer,
  mode?: number
): Promise<void> {
  const tmpPath = filePath + ".tmp";
  await fs.writeFile(tmpPath, data);
  await fs.chmod(tmpPath, mode ?? 0o600);
  await fs.rename(tmpPath, filePath);
}
