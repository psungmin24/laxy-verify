import { spawn, type ChildProcess } from "node:child_process";
import treeKill from "tree-kill";

export interface BuildResult {
  success: boolean;
  durationMs: number;
  errors: string[];
}

export class BuildError extends Error {
  constructor(
    message: string,
    public errors: string[],
    public timedOut: boolean = false
  ) {
    super(message);
    this.name = "BuildError";
  }
}

export function runBuild(
  command: string,
  timeoutSec: number
): Promise<BuildResult> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const stderrLines: string[] = [];
    const errorLines: string[] = [];

    console.log(`\n Building: ${command}`);

    const proc = spawn(command, { shell: true, stdio: ["ignore", "pipe", "pipe"] });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (proc.pid) {
        treeKill(proc.pid, "SIGKILL" as any);
      }
      reject(
        new BuildError(
          `Build timed out after ${timeoutSec}s`,
          errorLines,
          true
        )
      );
    }, timeoutSec * 1000);

    proc.stdout?.on("data", (chunk: Buffer) => {
      // Print build output to console
      const lines = chunk.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        console.log(`  ${line}`);
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      const lines = text.split("\n").filter(Boolean);
      stderrLines.push(...lines);
      errorLines.push(...lines);
      for (const line of lines) {
        console.error(`  ${line}`);
      }
    });

    proc.on("exit", (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;
      const success = code === 0;

      resolve({
        success,
        durationMs,
        errors: success ? [] : errorLines,
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(new BuildError(`Build process failed: ${err.message}`, errorLines));
    });
  });
}
