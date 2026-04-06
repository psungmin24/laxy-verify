import { spawn } from "child_process";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import {
  detectRuntimeFromFiles,
  getBuildCommandCandidates,
  parseProjectPackageJson,
  type CommandSpec,
} from "./project-runtime.js";

export interface BuildError {
  file?: string;
  line?: number;
  col?: number;
  code?: string;
  message: string;
  raw: string;
}

export interface BuildCheckResult {
  success: boolean;
  errors: string[];
  structuredErrors: BuildError[];
  warnings: string[];
  duration: number;
  output: string;
}

function parseErrorLine(raw: string): BuildError | null {
  const clean = raw.trim();
  if (!clean) return null;

  const tsMatch = clean.match(/^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/);
  if (tsMatch) {
    return {
      file: tsMatch[1].trim(),
      line: parseInt(tsMatch[2], 10),
      col: parseInt(tsMatch[3], 10),
      code: tsMatch[4],
      message: tsMatch[5].slice(0, 200),
      raw: clean.slice(0, 250),
    };
  }

  if (/error TS\d+:|Module not found|Cannot find module|Failed to resolve|SyntaxError:|Unexpected token|Build error occurred|Failed to compile/i.test(clean)) {
    return { message: clean.slice(0, 200), raw: clean.slice(0, 250) };
  }

  return null;
}

export function parseBuildOutput(output: string): {
  errors: string[];
  structuredErrors: BuildError[];
  warnings: string[];
} {
  const errors: string[] = [];
  const structuredErrors: BuildError[] = [];
  const warnings: string[] = [];

  for (const line of output.split("\n")) {
    const clean = line.trim();
    if (!clean) continue;

    const structured = parseErrorLine(clean);
    if (structured) {
      errors.push(structured.raw);
      structuredErrors.push(structured);
    } else if (/^warn|warning:/i.test(clean)) {
      warnings.push(clean.slice(0, 150));
    }
  }

  return {
    errors: errors.slice(0, 20),
    structuredErrors: structuredErrors.slice(0, 20),
    warnings: warnings.slice(0, 10),
  };
}

function extractFallbackBuildErrors(output: string, exitCode: number | null): string[] {
  const meaningfulLines = output
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^warn|warning:|^> |^npm notice/i.test(l));

  const likelyErrorLines = meaningfulLines.filter((l) =>
    /error|failed|unable|cannot|missing|unexpected|resolve|exception|ELIFECYCLE|ERR!/i.test(l)
  );

  const selected = (likelyErrorLines.length > 0 ? likelyErrorLines : meaningfulLines)
    .slice(-5)
    .map((l) => l.slice(0, 200));

  if (selected.length > 0) return Array.from(new Set(selected));
  return [`Build failed with exit code ${exitCode ?? "unknown"} but produced no parsed diagnostics.`];
}

function runBuildCommand(command: CommandSpec, projectPath: string): Promise<BuildCheckResult> {
  const startTime = Date.now();
  return new Promise<BuildCheckResult>((resolve) => {
    const cmd = process.platform === "win32" ? `chcp 65001 > nul && ${command.cmd}` : command.cmd;
    const child = spawn(cmd, command.args, {
      cwd: projectPath,
      shell: true,
      env: { ...process.env, CI: "true", NODE_ENV: "production" },
    });

    let output = "";
    child.stdout?.on("data", (d) => { output += d.toString(); });
    child.stderr?.on("data", (d) => { output += d.toString(); });

    const timeout = setTimeout(() => {
      child.kill();
      resolve({
        success: false,
        errors: ["Build timed out after 90s"],
        structuredErrors: [{ message: "Build timed out after 90s", raw: "Build timed out after 90s" }],
        warnings: [],
        duration: 90000,
        output: output.slice(-1000),
      });
    }, 90000);

    child.on("close", (code) => {
      clearTimeout(timeout);
      const duration = Date.now() - startTime;
      let { errors, structuredErrors, warnings } = parseBuildOutput(output);
      if (code !== 0 && errors.length === 0) {
        const fallback = extractFallbackBuildErrors(output, code);
        errors = fallback;
        structuredErrors = fallback.map((raw) => ({ message: raw.slice(0, 200), raw }));
      }
      resolve({ success: code === 0, errors, structuredErrors, warnings, duration, output: output.slice(-2000) });
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      resolve({
        success: false,
        errors: [`Build process error: ${err.message}`],
        structuredErrors: [{ message: `Build process error: ${err.message}`, raw: err.message }],
        warnings: [],
        duration: Date.now() - startTime,
        output: "",
      });
    });
  });
}

export async function runBuild(projectPath: string): Promise<BuildCheckResult> {
  const packageJsonPath = join(projectPath, "package.json");
  if (!existsSync(packageJsonPath)) {
    return {
      success: false,
      errors: ["Not a Node.js project: package.json not found"],
      structuredErrors: [{ message: "Not a Node.js project", raw: "package.json not found" }],
      warnings: [],
      duration: 0,
      output: "",
    };
  }

  const pkgContent = readFileSync(packageJsonPath, "utf-8");
  const packageJson = parseProjectPackageJson(pkgContent);

  const candidateFiles = readdirSync(projectPath).filter((f) => !f.startsWith("."));
  const runtime = detectRuntimeFromFiles(candidateFiles, packageJson);

  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const buildCommands = getBuildCommandCandidates(runtime, { npmCommand: npm, npxCommand: npx });

  if (buildCommands.length === 0) {
    return {
      success: false,
      errors: ["No build command found in package.json"],
      structuredErrors: [{ message: "No build command found", raw: "No build script in package.json" }],
      warnings: [],
      duration: 0,
      output: "",
    };
  }

  for (const command of buildCommands) {
    const result = await runBuildCommand(command, projectPath);
    if (result.success) return result;
    // If this wasn't a "command not found" error, stop trying
    if (!/missing script|command not found|is not recognized/i.test(result.output)) {
      return result;
    }
  }

  return {
    success: false,
    errors: ["All build commands failed"],
    structuredErrors: [{ message: "All build commands failed", raw: "No build command succeeded" }],
    warnings: [],
    duration: 0,
    output: "",
  };
}
