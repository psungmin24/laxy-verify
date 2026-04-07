import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";
import type { LighthouseScores } from "./grade.js";

const req = createRequire(__filename);

function resolveLhciBin(): string {
  try {
    return req.resolve("@lhci/cli/src/cli.js");
  } catch {
    throw new Error(
      "@lhci/cli not found — make sure it is installed in laxy-verify's node_modules"
    );
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

interface LhResult {
  scores: LighthouseScores | null;
  errors: string[];
}

export async function runLighthouse(
  port: number,
  runs: number
): Promise<LhResult> {
  const lhciBin = resolveLhciBin();

  console.log(`\n Running Lighthouse (${runs} run${runs > 1 ? "s" : ""})…`);

  const lhciDir = ".lighthouseci";
  if (!fs.existsSync(lhciDir)) {
    fs.mkdirSync(lhciDir, { recursive: true });
  }

  const child = spawn(
    "node",
    [
      lhciBin,
      "collect",
      `--url=http://localhost:${port}`,
      `--numberOfRuns=${runs}`,
      `--outputDir=${lhciDir}`,
    ],
    { shell: false, stdio: ["ignore", "pipe", "pipe"] }
  );

  const errors: string[] = [];

  child.stdout?.on("data", (chunk: Buffer) => {
    const lines = chunk.toString().split("\n").filter(Boolean);
    for (const line of lines) console.log(`  [lhci] ${line}`);
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    const lines = chunk.toString().split("\n").filter(Boolean);
    errors.push(...lines);
    for (const line of lines) console.error(`  [lhci] ${line}`);
  });

  const exitCode = await new Promise<number>((resolve) => {
    child.on("exit", (code) => resolve(code ?? 1));
  });

  if (exitCode !== 0) {
    console.error("  Lighthouse exited with an error");
    return { scores: null, errors };
  }

  // Extract median scores from .lighthouseci/lhr-*.json
  try {
    if (!fs.existsSync(lhciDir)) {
      return { scores: null, errors: ["No .lighthouseci/ directory found"] };
    }

    const lhrFiles = fs
      .readdirSync(lhciDir)
      .filter((f) => f.startsWith("lhr-") && f.endsWith(".json"));

    if (lhrFiles.length === 0) {
      return { scores: null, errors: ["No lhr JSON files found in .lighthouseci/"] };
    }

    const allScores = lhrFiles.map((f) => {
      const report = JSON.parse(fs.readFileSync(path.join(lhciDir, f), "utf8"));
      return {
        performance: (report.categories.performance?.score ?? 0) * 100,
        accessibility: (report.categories.accessibility?.score ?? 0) * 100,
        seo: (report.categories.seo?.score ?? 0) * 100,
        bestPractices: (report.categories["best-practices"]?.score ?? 0) * 100,
      };
    });

    const scores: LighthouseScores = {
      performance: Math.round(median(allScores.map((s) => s.performance))),
      accessibility: Math.round(median(allScores.map((s) => s.accessibility))),
      seo: Math.round(median(allScores.map((s) => s.seo))),
      bestPractices: Math.round(median(allScores.map((s) => s.bestPractices))),
    };

    console.log(
      `  Lighthouse median: P=${scores.performance} A=${scores.accessibility} S=${scores.seo} BP=${scores.bestPractices}`
    );

    return { scores, errors: [] };
  } finally {
    // Cleanup .lighthouseci/
    try {
      if (fs.existsSync(lhciDir)) {
        fs.rmSync(lhciDir, { recursive: true, force: true });
      }
    } catch {
      // ignore cleanup errors
    }
  }
}
