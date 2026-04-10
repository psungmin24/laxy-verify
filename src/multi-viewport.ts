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

let puppeteerModule: typeof import("puppeteer") | null = null;
try {
  puppeteerModule = require("puppeteer") as typeof import("puppeteer");
} catch {
  // Puppeteer not available — screenshot comparison will be skipped
}

const LH_NODE_MODULES_DIR = path.resolve(__dirname, "..", "node_modules");

export interface ViewportScreenshotDiff {
  viewport: string;
  diffPercent: number;
  baselineCreated: boolean;
}

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
  const source = `"use strict";
const fs = require("node:fs/promises");
const _lhModule = require("lighthouse");
const lighthouse = _lhModule.default || _lhModule;
const _clModule = require("chrome-launcher");
const { launch } = _clModule.default || _clModule;

const [url, reportPath, chromeDir, formFactor, screenJson] = process.argv.slice(2);
const screen = JSON.parse(screenJson);

(async () => {
  const chrome = await launch({
    logLevel: "error",
    chromeFlags: [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--user-data-dir=" + chromeDir,
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

    if (!result || !result.lhr) {
      throw new Error("Lighthouse returned no report.");
    }

    await fs.writeFile(reportPath, JSON.stringify(result.lhr), "utf8");
  } finally {
    await chrome.kill();
  }
})().catch((err) => {
  process.stderr.write(err.message + "\\n");
  process.exit(1);
});
`;
  // .cjs 확장자로 저장해서 Node가 CommonJS로 실행하도록 함
  fs.writeFileSync(runnerPath, source, "utf-8");
}

async function runLighthouseForViewport(
  port: number,
  viewport: ViewportDef,
  tempRoot: string
): Promise<LighthouseScores | null> {
  const runnerPath = path.join(tempRoot, "run-viewport-lighthouse.cjs");
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
        NODE_PATH: [LH_NODE_MODULES_DIR, process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
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

function pixelDiff(buf1: Buffer, buf2: Buffer): number {
  if (buf1.length !== buf2.length) return 100;
  if (buf1.length === 0) return 0;
  let diff = 0;
  for (let i = 0; i < buf1.length; i++) {
    if (Math.abs(buf1[i] - buf2[i]) > 10) diff++;
  }
  return (diff / buf1.length) * 100;
}

async function captureViewportScreenshot(
  port: number,
  viewport: ViewportDef
): Promise<Buffer | null> {
  if (!puppeteerModule) return null;
  const puppeteer = puppeteerModule.default || puppeteerModule;
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setViewport({
      width: viewport.screen.width,
      height: viewport.screen.height,
      deviceScaleFactor: viewport.screen.deviceScaleFactor,
      isMobile: viewport.screen.mobile,
    });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle2", timeout: 20000 });
    await page.waitForSelector("body", { timeout: 5000 });
    const screenshot = await page.screenshot({ type: "png" });
    return Buffer.from(screenshot);
  } catch {
    return null;
  } finally {
    await browser?.close();
  }
}

function getBaselineDir(): string {
  return path.join(process.cwd(), ".laxy-baselines");
}

function compareWithBaseline(
  viewport: ViewportDef,
  screenshot: Buffer
): ViewportScreenshotDiff {
  const baselineDir = getBaselineDir();
  const baselinePath = path.join(baselineDir, `${viewport.name}-baseline.png`);

  if (!fs.existsSync(baselinePath)) {
    fs.mkdirSync(baselineDir, { recursive: true });
    fs.writeFileSync(baselinePath, screenshot);
    return { viewport: viewport.name, diffPercent: 0, baselineCreated: true };
  }

  const baseline = fs.readFileSync(baselinePath);
  const diff = pixelDiff(baseline, screenshot);
  return { viewport: viewport.name, diffPercent: Math.round(diff * 100) / 100, baselineCreated: false };
}

export async function runMultiViewportLighthouse(port: number): Promise<ViewportScores & { screenshotDiffs?: ViewportScreenshotDiff[] }> {
  console.log("\n  [Pro+] Running multi-viewport Lighthouse checks (desktop, tablet, mobile)...");

  const tempRoot = path.join(process.cwd(), ".laxy-tmp", `multi-viewport-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(tempRoot, { recursive: true });

  const results: ViewportScores & { screenshotDiffs?: ViewportScreenshotDiff[] } = { desktop: null, tablet: null, mobile: null };
  const screenshotDiffs: ViewportScreenshotDiff[] = [];

  try {
    for (const viewport of VIEWPORTS) {
      console.log(`\n    Viewport: ${viewport.name}`);
      results[viewport.name] = await runLighthouseForViewport(port, viewport, tempRoot);

      // Screenshot capture and baseline comparison
      const screenshot = await captureViewportScreenshot(port, viewport);
      if (screenshot) {
        const diff = compareWithBaseline(viewport, screenshot);
        screenshotDiffs.push(diff);
        if (diff.baselineCreated) {
          console.log(`    Screenshot: baseline created for ${viewport.name}`);
        } else if (diff.diffPercent > 10) {
          console.log(`    Screenshot: ${viewport.name} diff ${diff.diffPercent}% (> 10% threshold)`);
        } else {
          console.log(`    Screenshot: ${viewport.name} diff ${diff.diffPercent}% OK`);
        }
      }
    }

    if (screenshotDiffs.length > 0) {
      results.screenshotDiffs = screenshotDiffs;
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

/**
 * Pro-tier mobile Lighthouse check — single mobile run without
 * full multi-viewport overhead. Lets Pro users catch mobile regressions.
 */
export async function runMobileLighthouse(port: number): Promise<LighthouseScores | null> {
  console.log("\n  [Pro] Running mobile Lighthouse check...");
  const mobileViewport = VIEWPORTS.find((v) => v.name === "mobile")!;
  const tempRoot = path.join(
    process.cwd(),
    ".laxy-tmp",
    `mobile-lh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  fs.mkdirSync(tempRoot, { recursive: true });

  try {
    const scores = await runLighthouseForViewport(port, mobileViewport, tempRoot);
    if (scores) {
      console.log(
        `  [Pro] Mobile: P=${scores.performance} A=${scores.accessibility} SEO=${scores.seo} BP=${scores.bestPractices}`
      );
    } else {
      console.log("  [Pro] Mobile Lighthouse: failed to collect");
    }
    return scores;
  } finally {
    await removeDirWithRetries(tempRoot);
  }
}
