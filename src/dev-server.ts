import { spawn, type ChildProcess } from "child_process";
import http from "http";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import {
  detectRuntimeFromFiles,
  getDevCommandCandidates,
  parseProjectPackageJson,
} from "./project-runtime.js";

export interface DevServerHandle {
  process: ChildProcess;
  port: number;
  url: string;
}

function waitForPort(port: number, timeoutMs = 30000): Promise<number> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(`http://localhost:${port}`, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Dev server did not respond on port ${port} within ${timeoutMs / 1000}s`));
        } else {
          setTimeout(check, 1000);
        }
      });
      req.setTimeout(3000, () => {
        req.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Dev server timed out on port ${port}`));
        } else {
          setTimeout(check, 1000);
        }
      });
    };
    check();
  });
}

export async function startDevServer(
  projectPath: string,
  port: number
): Promise<DevServerHandle> {
  const pkgContent = readFileSync(join(projectPath, "package.json"), "utf-8");
  const packageJson = parseProjectPackageJson(pkgContent);
  const candidateFiles = readdirSync(projectPath).filter((f) => !f.startsWith("."));
  const runtime = detectRuntimeFromFiles(candidateFiles, packageJson);

  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const devCommands = getDevCommandCandidates(runtime, { port, npmCommand: npm, npxCommand: npx });

  if (devCommands.length === 0) {
    throw new Error("No dev server command found");
  }

  const command = devCommands[0];
  const cmd = process.platform === "win32" ? `chcp 65001 > nul && ${command.cmd}` : command.cmd;

  const child = spawn(cmd, command.args, {
    cwd: projectPath,
    shell: true,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Drain stdout/stderr to prevent buffer blocking
  child.stdout?.resume();
  child.stderr?.resume();

  const statusCode = await waitForPort(port);
  if (statusCode !== 200 && statusCode !== 304) {
    child.kill();
    throw new Error(`Dev server returned HTTP ${statusCode}. Check environment variables.`);
  }

  return {
    process: child,
    port,
    url: `http://localhost:${port}`,
  };
}

export function stopDevServer(handle: DevServerHandle): void {
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(handle.process.pid), "/f", "/t"], { shell: true });
    } else {
      handle.process.kill("SIGTERM");
    }
  } catch {
    // already dead
  }
}
