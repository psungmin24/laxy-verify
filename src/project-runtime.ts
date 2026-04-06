export interface ProjectPackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

export interface RuntimeDetection {
  packageJson: ProjectPackageJson | null;
  hasPackageJson: boolean;
  hasNext: boolean;
  hasVite: boolean;
  hasReactScripts: boolean;
  hasIndexHtml: boolean;
  hasNextConfig: boolean;
  hasViteConfig: boolean;
}

export interface CommandSpec {
  label: string;
  cmd: string;
  args: string[];
}

function hasFile(fileNames: string[], matcher: RegExp | string): boolean {
  if (typeof matcher === "string") {
    return fileNames.some((f) => f === matcher || f.endsWith(`/${matcher}`));
  }
  return fileNames.some((f) => matcher.test(f));
}

function getAllDependencies(pkg: ProjectPackageJson | null): Record<string, string> {
  return { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
}

function hasScript(script: string | undefined): boolean {
  return typeof script === "string" && script.trim().length > 0;
}

function addCommand(commands: CommandSpec[], seen: Set<string>, label: string, cmd: string, args: string[]) {
  const key = [cmd, ...args].join("\0");
  if (seen.has(key)) return;
  seen.add(key);
  commands.push({ label, cmd, args });
}

export function parseProjectPackageJson(content: string | null | undefined): ProjectPackageJson | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as ProjectPackageJson;
  } catch {
    return null;
  }
}

export function detectRuntimeFromFiles(
  fileNamesInput: Iterable<string>,
  packageJson: ProjectPackageJson | null
): RuntimeDetection {
  const fileNames = Array.from(fileNamesInput);
  const allDeps = getAllDependencies(packageJson);
  const hasNextConfig = hasFile(fileNames, /(^|\/)next\.config\.(js|mjs|ts|cjs)$/);
  const hasViteConfig = hasFile(fileNames, /(^|\/)vite\.config\.(js|mjs|ts|cjs)$/);

  return {
    packageJson,
    hasPackageJson: hasFile(fileNames, "package.json") || packageJson !== null,
    hasNextConfig,
    hasViteConfig,
    hasIndexHtml: hasFile(fileNames, "index.html"),
    hasNext: hasNextConfig || Boolean(allDeps.next),
    hasVite: hasViteConfig || Boolean(allDeps.vite),
    hasReactScripts: Boolean(allDeps["react-scripts"]),
  };
}

export function getBuildCommandCandidates(
  runtime: RuntimeDetection,
  options: { npmCommand: string; npxCommand: string }
): CommandSpec[] {
  const commands: CommandSpec[] = [];
  const seen = new Set<string>();
  const scripts = runtime.packageJson?.scripts || {};

  if (hasScript(scripts.build)) {
    addCommand(commands, seen, "npm run build", options.npmCommand, ["run", "build"]);
  }
  if (runtime.hasNext) {
    addCommand(commands, seen, "npx next build", options.npxCommand, ["-y", "next", "build"]);
  }
  if (runtime.hasVite) {
    addCommand(commands, seen, "npx vite build", options.npxCommand, ["-y", "vite", "build"]);
  }
  if (runtime.hasReactScripts) {
    addCommand(commands, seen, "npx react-scripts build", options.npxCommand, ["-y", "react-scripts", "build"]);
  }
  return commands;
}

export function getDevCommandCandidates(
  runtime: RuntimeDetection,
  options: { port: number; npmCommand: string; npxCommand: string }
): CommandSpec[] {
  const commands: CommandSpec[] = [];
  const seen = new Set<string>();
  const scripts = runtime.packageJson?.scripts || {};
  const port = String(options.port);
  const devScript = scripts.dev;
  const startScript = scripts.start;

  if (hasScript(devScript)) {
    if (runtime.hasNext || /\bnext\b/i.test(devScript!)) {
      addCommand(commands, seen, "npm run dev", options.npmCommand, ["run", "dev", "--", "-H", "0.0.0.0", "-p", port]);
    } else if (runtime.hasVite || /\bvite\b/i.test(devScript!)) {
      addCommand(commands, seen, "npm run dev", options.npmCommand, ["run", "dev", "--", "--host", "0.0.0.0", "--port", port]);
    } else {
      addCommand(commands, seen, "npm run dev", options.npmCommand, ["run", "dev"]);
    }
  }

  if (!hasScript(devScript) && hasScript(startScript)) {
    addCommand(commands, seen, "npm run start", options.npmCommand, ["run", "start"]);
  }

  if (runtime.hasNext) {
    addCommand(commands, seen, "npx next dev", options.npxCommand, ["-y", "next", "dev", "-H", "0.0.0.0", "-p", port]);
  }
  if (runtime.hasVite) {
    addCommand(commands, seen, "npx vite", options.npxCommand, ["-y", "vite", "--host", "0.0.0.0", "--port", port]);
  }
  if (runtime.hasIndexHtml) {
    addCommand(commands, seen, "npx serve", options.npxCommand, ["-y", "serve", "-l", port, "--no-clipboard"]);
  }

  return commands;
}
