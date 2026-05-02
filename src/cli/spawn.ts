import { spawn } from "node:child_process";

export async function spawnCommand(
  command: string,
  args: string[],
  env: Record<string, string>
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: "inherit"
    });

    child.on("exit", (code) => {
      resolve(code ?? 0);
    });

    child.on("error", (error) => {
      reject(error);
    });
  });
}
