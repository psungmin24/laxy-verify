import { spawn } from "node:child_process";
import * as http from "node:http";
import treeKill from "tree-kill";

export class PortConflictError extends Error {
  constructor(port: number) {
    super(`Port ${port} is already in use — please free the port or configure a different one in .laxy.yml`);
    this.name = "PortConflictError";
  }
}

export class DevServerTimeoutError extends Error {
  constructor(port: number, timeoutSec: number) {
    super(`Dev server did not respond on port ${port} within ${timeoutSec}s`);
    this.name = "DevServerTimeoutError";
  }
}

export interface ServeResult {
  pid: number;
  port: number;
}

function httpGet(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    http
      .get(url, { timeout: 2000 }, (res) => {
        resolve(res.statusCode ?? null);
      })
      .on("error", () => {
        resolve(null);
      });
  });
}

export function probeServerStatus(port: number): Promise<number | null> {
  return httpGet(`http://localhost:${port}/`);
}

export async function startDevServer(
  command: string,
  port: number,
  timeoutSec: number,
  cwd?: string
): Promise<ServeResult> {
  return new Promise((resolve, reject) => {
    console.log(`Starting dev server: ${command}${cwd ? ` (cwd: ${cwd})` : ""}`);

    const proc = spawn(command, {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PORT: String(port) },
      cwd,
    });

    // Pipe output to console
    proc.stdout?.on("data", (chunk: Buffer) => {
      const lines = chunk.toString().split("\n").filter(Boolean);
      for (const line of lines) console.log(`  [dev] ${line}`);
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      const lines = chunk.toString().split("\n").filter(Boolean);
      for (const line of lines) console.error(`  [dev] ${line}`);
    });

    proc.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(new PortConflictError(port));
      } else {
        reject(new Error(`Dev server error: ${err.message}`));
      }
    });

    // Poll healthcheck
    const deadline = Date.now() + timeoutSec * 1000;

    const poll = async () => {
      if (Date.now() >= deadline) {
        if (proc.pid) treeKill(proc.pid, "SIGKILL" as any);
        reject(new DevServerTimeoutError(port, timeoutSec));
        return;
      }

      const status = await probeServerStatus(port);
      if (status !== null) {
        if (status === 200) {
          console.log(`Dev server ready on port ${port} (HTTP ${status})`);
          resolve({ pid: proc.pid!, port });
        } else {
          console.log(`Dev server returned HTTP ${status} — continuing anyway`);
          resolve({ pid: proc.pid!, port });
        }
        return;
      }

      setTimeout(poll, 500);
    };

    poll();
  });
}

export function stopDevServer(pid: number): void {
  console.log(`Stopping dev server (PID ${pid})`);
  treeKill(pid, "SIGKILL" as any);
}
