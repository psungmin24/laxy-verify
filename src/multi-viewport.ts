/**
 * Pro+ multi-viewport Lighthouse checks.
 *
 * Each viewport runs through the same direct Lighthouse execution path used by
 * the main verify flow so Windows cleanup behavior is consistent.
 */
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { LighthouseScores } from "./grade.js";

export interface ViewportScores {
  desktop: LighthouseScores | null;
  tablet: LighthouseScores | null;
  mobile: LighthouseScores | null;
}

interface ViewportDef {
  name: "desktop" | "tablet" | "mobile";
  formFactor: "desktop" | "mobile";
  screen: {
    mobile: boolean;
    width: number;
    height: number;
    deviceScaleFactor: number;
    disabled: boolean;
  };
}

const VIEWPORTS: ViewportDef[] = [
  {
    name: "desktop",
    formFactor: "desktop",
    screen: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false },
  },
  {
    name: "tablet",
    formFactor: "desktop",
    screen: { mobile: false, width: 1024, height: 768, deviceScaleFactor: 1, disabled: false },
  },
  {
    name: "mobile",
    formFactor: "mobile",
    screen: { mobile: true, width: 390, height: 844, deviceScaleFactor: 2, disabled: false },
  },
];

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

function writeViewportRunnerScript(runnerPath: string): void {
  const source = `import fs from "node:fs/promises";
import lighthouse from "lighthouse";
import { launch } from "chrome-launcher";

const [url, reportPath, chromeDir, formFactor, screenJson] = process.argv.slice(2);
const screen = JSON.parse(screenJson);

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
  const result = await lighthouse(
    url,
    {
      port: chrome.port,
      output: "json",
      logLevel: "error",
      onlyCategories: ["performance", "accessibility", "seo", "best-practices"],
    },
    {
      extends: "lighthouse:default",
      settings: {
        formFactor,
        screenEmulation: screen,
      },
    }
  );

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

async function runLighthouseForViewport(
  port: number,
  viewport: ViewportDef,
  tempRoot: string
): Promise<LighthouseScores | null> {
  const runnerPath = path.join(tempRoot, "run-viewport-lighthouse.mjs");
  const reportPath = path.join(tempRoot, `${viewport.name}.json`);
  const chromeDir = path.join(tempRoot, `chrome-${viewport.name}`);

  writeViewportRunnerScript(runnerPath);
  fs.mkdirSync(chromeDir, { recursive: true });

  const child = spawn(
    "node",
    [
      runnerPath,
      `http://127.0.0.1:${port}/`,
      reportPath,
      chromeDir,
      viewport.formFactor,
      JSON.stringify(viewport.screen),
    ],
    {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        TEMP: tempRoot,
        TMP: tempRoot,
        TMPDIR: tempRoot,
      },
    }
  );

  child.stdout?.on("data", (chunk: Buffer) => {
    const lines = chunk.toString().split("\n").filter(Boolean);
    for (const line of lines) console.log(`    [lh:${viewport.name}] ${line}`);
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    const lines = chunk.toString().split("\n").filter(Boolean);
    for (const line of lines) console.error(`    [lh:${viewport.name}] ${line}`);
  });

  const code = await new Promise<number>((resolve) => child.on("exit", (exitCode) => resolve(exitCode ?? 1)));
  if (code !== 0 || !fs.existsSync(reportPath)) {
    await removeDirWithRetries(chromeDir);
    return null;
  }

  try {
    const lhr = JSON.parse(fs.readFileSync(reportPath, "utf-8")) as {
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
  } catch {
    return null;
  } finally {
    await removeDirWithRetries(chromeDir);
  }
}

export async function runMultiViewportLighthouse(port: number): Promise<ViewportScores> {
  console.log("\n  [Pro+] Running multi-viewport Lighthouse checks (desktop, tablet, mobile)...");

  const tempRoot = path.join(process.cwd(), ".laxy-tmp", `multi-viewport-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(tempRoot, { recursive: true });

  const results: ViewportScores = { desktop: null, tablet: null, mobile: null };

  try {
    for (const viewport of VIEWPORTS) {
      console.log(`\n    Viewport: ${viewport.name}`);
      results[viewport.name] = await runLighthouseForViewport(port, viewport, tempRoot);
    }

    return results;
  } finally {
    await removeDirWithRetries(tempRoot);
  }
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
