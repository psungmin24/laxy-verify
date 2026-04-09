/**
 * Pro+ multi-viewport Lighthouse checks.
 *
 * This runs one Lighthouse collection per viewport and summarizes the results
 * for desktop, tablet, and mobile. The median logic is kept so the output
 * shape stays compatible with the existing verification report flow.
 */
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";
import type { LighthouseScores } from "./grade.js";

const req = createRequire(__filename);

function resolveLhciBin(): string {
  return req.resolve("@lhci/cli/src/cli.js");
}

export interface ViewportScores {
  desktop: LighthouseScores | null;
  tablet: LighthouseScores | null;
  mobile: LighthouseScores | null;
}

interface ViewportDef {
  name: "desktop" | "tablet" | "mobile";
  preset: string;
  screenEmulation?: string;
}

const VIEWPORTS: ViewportDef[] = [
  { name: "desktop", preset: "desktop" },
  { name: "tablet", preset: "desktop", screenEmulation: "1024x768" },
  { name: "mobile", preset: "perf" },
];

async function runLighthouseForViewport(
  port: number,
  viewport: ViewportDef,
  outputDir: string
): Promise<LighthouseScores | null> {
  const lhciBin = resolveLhciBin();
  const vpDir = path.join(outputDir, viewport.name);
  if (!fs.existsSync(vpDir)) fs.mkdirSync(vpDir, { recursive: true });

  const args = [
    lhciBin,
    "collect",
    `--url=http://localhost:${port}`,
    "--numberOfRuns=1",
    `--outputDir=${vpDir}`,
    `--preset=${viewport.preset}`,
  ];

  const child = spawn("node", args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });

  child.stdout?.on("data", (chunk: Buffer) => {
    const lines = chunk.toString().split("\n").filter(Boolean);
    for (const line of lines) console.log(`    [lhci:${viewport.name}] ${line}`);
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    const lines = chunk.toString().split("\n").filter(Boolean);
    for (const line of lines) console.error(`    [lhci:${viewport.name}] ${line}`);
  });

  const code = await new Promise<number>((resolve) => child.on("exit", (exitCode) => resolve(exitCode ?? 1)));
  if (code !== 0) return null;

  try {
    const files = fs.readdirSync(vpDir).filter((file) => file.startsWith("lhr-") && file.endsWith(".json"));
    if (files.length === 0) return null;

    const scores: LighthouseScores[] = files.map((file) => {
      const lhr = JSON.parse(fs.readFileSync(path.join(vpDir, file), "utf-8")) as {
        categories: {
          performance?: { score: number };
          accessibility?: { score: number };
          seo?: { score: number };
          "best-practices"?: { score: number };
        };
      };
      return {
        performance: Math.round((lhr.categories.performance?.score ?? 0) * 100),
        accessibility: Math.round((lhr.categories.accessibility?.score ?? 0) * 100),
        seo: Math.round((lhr.categories.seo?.score ?? 0) * 100),
        bestPractices: Math.round((lhr.categories["best-practices"]?.score ?? 0) * 100),
      };
    });

    const median = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    return {
      performance: median(scores.map((score) => score.performance)),
      accessibility: median(scores.map((score) => score.accessibility)),
      seo: median(scores.map((score) => score.seo)),
      bestPractices: median(scores.map((score) => score.bestPractices)),
    };
  } catch {
    return null;
  }
}

export async function runMultiViewportLighthouse(port: number): Promise<ViewportScores> {
  console.log("\n  [Pro+] Running multi-viewport Lighthouse checks (desktop, tablet, mobile)...");

  const outputDir = ".lighthouseci-mvp";
  const results: ViewportScores = { desktop: null, tablet: null, mobile: null };

  for (const viewport of VIEWPORTS) {
    console.log(`\n    Viewport: ${viewport.name}`);
    results[viewport.name] = await runLighthouseForViewport(port, viewport, outputDir);
  }

  return results;
}

export function printMultiViewportResults(
  scores: ViewportScores,
  thresholds: { performance: number; accessibility: number; seo: number; bestPractices: number }
): void {
  const check = (passed: boolean) => (passed ? "OK" : "FAIL");
  const labels: (keyof ViewportScores)[] = ["desktop", "tablet", "mobile"];
  const viewportLabel: Record<string, string> = {
    desktop: "Desktop",
    tablet: "Tablet",
    mobile: "Mobile",
  };

  console.log("\n  [Pro+] Multi-viewport results:");
  for (const viewport of labels) {
    const score = scores[viewport];
    if (!score) {
      console.log(`    ${viewportLabel[viewport]}: missing`);
      continue;
    }

    const allPassed =
      score.performance >= thresholds.performance &&
      score.accessibility >= thresholds.accessibility &&
      score.seo >= thresholds.seo &&
      score.bestPractices >= thresholds.bestPractices;

    console.log(
      `    ${viewportLabel[viewport]}: P=${score.performance} A=${score.accessibility} SEO=${score.seo} BP=${score.bestPractices}  ${check(allPassed)}`
    );
  }
}

export function allViewportsPass(
  scores: ViewportScores,
  thresholds: { performance: number; accessibility: number; seo: number; bestPractices: number }
): boolean {
  return (["desktop", "tablet", "mobile"] as (keyof ViewportScores)[]).every((viewport) => {
    const score = scores[viewport];
    if (!score) return false;
    return (
      score.performance >= thresholds.performance &&
      score.accessibility >= thresholds.accessibility &&
      score.seo >= thresholds.seo &&
      score.bestPractices >= thresholds.bestPractices
    );
  });
}
