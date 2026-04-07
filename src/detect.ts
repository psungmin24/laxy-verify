import * as fs from "node:fs";
import * as path from "node:path";

export type Framework = "nextjs" | "vite" | "cra" | "sveltekit";
export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

const FRAMEWORK_DEFAULT_PORTS: Record<Framework, number> = {
  nextjs: 3000,
  vite: 5173,
  cra: 3000,
  sveltekit: 5173,
};

export interface DetectResult {
  framework: Framework | null;
  packageManager: PackageManager;
  buildCmd: string;
  devCmd: string;
  port: number;
}

function detectPackageManager(dir: string): PackageManager {
  if (fs.existsSync(path.join(dir, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(dir, "yarn.lock"))) return "yarn";
  if (
    fs.existsSync(path.join(dir, "bun.lockb")) ||
    fs.existsSync(path.join(dir, "bun.lock"))
  )
    return "bun";
  return "npm";
}

function detectFramework(packageJson: {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}): Framework | null {
  const allDeps = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
  };
  const scripts = packageJson.scripts ?? {};
  const startScript = scripts.start ?? scripts.dev ?? "";

  if (allDeps["next"]) return "nextjs";
  if (allDeps["@sveltejs/kit"] || allDeps["svelte-kit"]) return "sveltekit";

  // CRA: react-scripts or @craco/craco with react-scripts
  if (allDeps["react-scripts"]) return "cra";

  // Vite
  if (allDeps["vite"]) return "vite";

  // Fallback: check start script heuristics
  if (startScript.includes("next")) return "nextjs";
  if (startScript.includes("vite")) return "vite";
  if (startScript.includes("react-scripts")) return "cra";

  return null;
}

function getBuildCommand(
  framework: Framework | null,
  packageManager: PackageManager,
  scripts: Record<string, string>
): string {
  if (scripts.build) {
    const pmRun = packageManager === "npm" ? "npm run" : packageManager;
    return `${pmRun} build`;
  }

  // Framework defaults
  const pmRun = packageManager === "npm" ? "npm run" : packageManager;
  return `${pmRun} build`;
}

function getDevCommand(
  framework: Framework | null,
  packageManager: PackageManager,
  scripts: Record<string, string>
): string {
  const pmRun = packageManager === "npm" ? "npm run" : packageManager;

  if (scripts.dev) return `${pmRun} dev`;
  if (scripts.start) return `${pmRun} start`;
  if (scripts.serve) return `${pmRun} serve`;

  // Framework defaults
  switch (framework) {
    case "nextjs":
      return "next dev";
    case "vite":
      return "vite";
    case "cra":
      return "react-scripts start";
    case "sveltekit":
      return "vite dev";
  }

  return `${pmRun} dev`;
}

export function detect(dir: string): DetectResult {
  const pkgPath = path.join(dir, "package.json");
  if (!fs.existsSync(pkgPath)) {
    throw new Error(
      `Not a Node.js project: no package.json found at ${pkgPath}`
    );
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

  if (!pkg.scripts || !pkg.scripts.build) {
    throw new Error("No 'build' script found in package.json");
  }

  const framework = detectFramework(pkg);
  const packageManager = detectPackageManager(dir);
  const scripts = pkg.scripts ?? {};
  const buildCmd = getBuildCommand(framework, packageManager, scripts);
  const devCmd = getDevCommand(framework, packageManager, scripts);

  const defaultPort = framework ? FRAMEWORK_DEFAULT_PORTS[framework] : 3000;

  return {
    framework,
    packageManager,
    buildCmd,
    devCmd,
    port: defaultPort,
  };
}
