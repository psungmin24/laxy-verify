import { execFileSync } from "child_process";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { startDevServer, stopDevServer, type DevServerHandle } from "./dev-server.js";
import type { LighthouseScores } from "./verification.js";

export interface LighthouseResult {
  scores: LighthouseScores | null;
  error?: string;
}

function findLhciManifest(tmpDir: string): string | null {
  // lhci stores results in .lighthouseci/ directory
  const lhciDir = join(tmpDir, ".lighthouseci");
  if (!existsSync(lhciDir)) return null;

  const manifest = join(lhciDir, "manifest.json");
  if (existsSync(manifest)) return manifest;
  return null;
}

function parseLhciResults(projectPath: string): LighthouseScores | null {
  const manifest = findLhciManifest(projectPath);
  if (!manifest) return null;

  try {
    const entries = JSON.parse(readFileSync(manifest, "utf-8"));
    if (!Array.isArray(entries) || entries.length === 0) return null;

    // Use the median run (middle entry) or last entry
    const entry = entries[Math.floor(entries.length / 2)];
    const reportPath = join(projectPath, ".lighthouseci", entry.jsonPath || "");

    if (!existsSync(reportPath)) return null;

    const report = JSON.parse(readFileSync(reportPath, "utf-8"));
    const cat = report.categories;
    if (!cat) return null;

    const score = (key: string) => Math.round((cat[key]?.score ?? 0) * 100);

    return {
      performance: score("performance"),
      accessibility: score("accessibility"),
      bestPractices: score("best-practices"),
      seo: score("seo"),
    };
  } catch {
    return null;
  }
}

export async function runLighthouse(
  projectPath: string,
  options: { port?: number; runs?: number; ciMode?: boolean } = {}
): Promise<LighthouseResult> {
  const port = options.port ?? 3000;
  const runs = options.runs ?? (options.ciMode ? 3 : 1);

  let serverHandle: DevServerHandle | null = null;

  try {
    // Start dev server
    serverHandle = await startDevServer(projectPath, port);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Dev server failed to start";
    return { scores: null, error: msg };
  }

  try {
    const url = `http://localhost:${port}`;

    // Run lhci collect
    const npx = process.platform === "win32" ? "npx.cmd" : "npx";
    const lhciArgs = [
      "-y", "@lhci/cli", "collect",
      `--url=${url}`,
      `--numberOfRuns=${runs}`,
      "--settings.formFactor=desktop",
      "--settings.screenEmulation.disabled=true",
      "--settings.throttlingMethod=provided",
      "--settings.onlyCategories=performance,accessibility,best-practices,seo",
    ];

    if (process.env.CI) {
      lhciArgs.push("--settings.chromeFlags=--no-sandbox --disable-gpu --headless");
    }

    try {
      execFileSync(npx, lhciArgs, {
        cwd: projectPath,
        timeout: 120000,
        stdio: "pipe",
        env: { ...process.env, LHCI_BUILD_CONTEXT__CURRENT_HASH: "cli" },
      });
    } catch (err) {
      // lhci collect may exit non-zero even on success, check for results
      const scores = parseLhciResults(projectPath);
      if (scores) return { scores };
      const msg = err instanceof Error ? err.message : "Lighthouse execution failed";
      return { scores: null, error: `Lighthouse failed: ${msg.slice(0, 200)}` };
    }

    const scores = parseLhciResults(projectPath);
    if (!scores) {
      return { scores: null, error: "Lighthouse completed but produced no parseable results" };
    }

    return { scores };
  } finally {
    if (serverHandle) stopDevServer(serverHandle);
  }
}
