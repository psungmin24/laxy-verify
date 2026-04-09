import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { LighthouseScores } from "./grade.js";

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeDirWithRetries(dirPath: string, retries = 5): Promise<void> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
      return;
    } catch {
      if (attempt === retries - 1) return;
      await sleep(250);
    }
  }
}

function writeRunnerScript(runnerPath: string): void {
  const source = `import fs from "node:fs/promises";
import lighthouse from "lighthouse";
import { launch } from "chrome-launcher";

const [url, reportPath, chromeDir] = process.argv.slice(2);

const chrome = await launch({
  logLevel: "error",
  chromeFlags: [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    \`--user-data-dir=\${chromeDir}\`,
  ],
});

try {
  const result = await lighthouse(url, {
    port: chrome.port,
    output: "json",
    logLevel: "error",
    onlyCategories: ["performance", "accessibility", "seo", "best-practices"],
  });

  if (!result?.lhr) {
    throw new Error("Lighthouse returned no report.");
  }

  await fs.writeFile(reportPath, JSON.stringify(result.lhr), "utf8");
} finally {
  await chrome.kill();
}
`;

  fs.writeFileSync(runnerPath, source, "utf-8");
}

interface LhResult {
  scores: LighthouseScores | null;
  errors: string[];
}

export async function runLighthouse(port: number, runs: number): Promise<LhResult> {
  const baseTmpDir = path.join(process.cwd(), ".laxy-tmp", `lighthouse-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const reportsDir = path.join(baseTmpDir, "reports");
  const runnerPath = path.join(baseTmpDir, "run-lighthouse.mjs");

  fs.mkdirSync(reportsDir, { recursive: true });
  writeRunnerScript(runnerPath);

  console.log(`\n  Running Lighthouse (${runs} run${runs > 1 ? "s" : ""})...`);

  const errors: string[] = [];
  const allScores: LighthouseScores[] = [];

  for (let runIndex = 0; runIndex < runs; runIndex++) {
    const runNumber = runIndex + 1;
    const reportPath = path.join(reportsDir, `lhr-${runNumber}.json`);
    const chromeDir = path.join(baseTmpDir, `chrome-${runNumber}`);
    fs.mkdirSync(chromeDir, { recursive: true });

    console.log(`  [lh] Run ${runNumber}/${runs}`);

    const child = spawn(
      "node",
      [runnerPath, `http://127.0.0.1:${port}/`, reportPath, chromeDir],
      {
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          TEMP: baseTmpDir,
          TMP: baseTmpDir,
          TMPDIR: baseTmpDir,
        },
      }
    );

    child.stdout?.on("data", (chunk: Buffer) => {
      const lines = chunk.toString().split("\n").filter(Boolean);
      for (const line of lines) console.log(`  [lh] ${line}`);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const lines = chunk.toString().split("\n").filter(Boolean);
      errors.push(...lines);
      for (const line of lines) console.error(`  [lh] ${line}`);
    });

    const exitCode = await new Promise<number>((resolve) => {
      child.on("exit", (code) => resolve(code ?? 1));
    });

    try {
      if (!fs.existsSync(reportPath)) {
        errors.push(`Run ${runNumber}: Lighthouse exited with code ${exitCode} and produced no JSON report.`);
        continue;
      }

      const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
      allScores.push({
        performance: Math.round((report.categories.performance?.score ?? 0) * 100),
        accessibility: Math.round((report.categories.accessibility?.score ?? 0) * 100),
        seo: Math.round((report.categories.seo?.score ?? 0) * 100),
        bestPractices: Math.round((report.categories["best-practices"]?.score ?? 0) * 100),
      });

      if (exitCode !== 0) {
        errors.push(`Run ${runNumber}: Lighthouse exited with code ${exitCode}, but the JSON report was recovered.`);
      }
    } catch (error) {
      errors.push(`Run ${runNumber}: Failed to read Lighthouse report: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await removeDirWithRetries(chromeDir);
    }
  }

  try {
    if (allScores.length === 0) {
      console.error("  Lighthouse exited without usable reports.");
      return { scores: null, errors };
    }

    const scores: LighthouseScores = {
      performance: Math.round(median(allScores.map((score) => score.performance))),
      accessibility: Math.round(median(allScores.map((score) => score.accessibility))),
      seo: Math.round(median(allScores.map((score) => score.seo))),
      bestPractices: Math.round(median(allScores.map((score) => score.bestPractices))),
    };

    console.log(
      `  Lighthouse median: P=${scores.performance} A=${scores.accessibility} S=${scores.seo} BP=${scores.bestPractices}`
    );

    return { scores, errors };
  } finally {
    await removeDirWithRetries(baseTmpDir);
  }
}
