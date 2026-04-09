import * as fs from "node:fs";
import * as path from "node:path";
import puppeteer from "puppeteer";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

export interface VisualDiffResult {
  hasBaseline: boolean;
  diffPercentage: number;
  verdict: "pass" | "warn" | "rollback";
  diffPixels: number;
  totalPixels: number;
  baselinePath: string;
  currentPath: string;
  diffPath: string;
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

async function captureScreenshot(url: string, outputPath: string): Promise<void> {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 960 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });
    await page.waitForSelector("body", { timeout: 5000 });
    await page.screenshot({ path: outputPath, fullPage: true, type: "png" });
  } finally {
    await browser.close();
  }
}

function compareImages(
  baselinePath: string,
  currentPath: string,
  diffOutputPath: string
): { diffPixels: number; totalPixels: number; diffPercentage: number } {
  const baselinePng = PNG.sync.read(fs.readFileSync(baselinePath));
  const currentPng = PNG.sync.read(fs.readFileSync(currentPath));

  const width = Math.min(baselinePng.width, currentPng.width);
  const height = Math.min(baselinePng.height, currentPng.height);

  const cropData = (png: PNG, w: number, h: number) => {
    if (png.width === w && png.height === h) return png.data;
    const cropped = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      png.data.copy(cropped, y * w * 4, y * png.width * 4, y * png.width * 4 + w * 4);
    }
    return cropped;
  };

  const baseData = cropData(baselinePng, width, height);
  const currData = cropData(currentPng, width, height);
  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(baseData, currData, diff.data, width, height, { threshold: 0.1 });

  ensureDir(path.dirname(diffOutputPath));
  fs.writeFileSync(diffOutputPath, PNG.sync.write(diff));

  const totalPixels = width * height;
  const diffPercentage = Math.round((diffPixels / totalPixels) * 10000) / 100;
  return { diffPixels, totalPixels, diffPercentage };
}

export async function runVisualDiff(projectDir: string, url: string, label = "current"): Promise<VisualDiffResult> {
  const dir = path.join(projectDir, ".laxy-verify", "visual");
  ensureDir(dir);

  const baselinePath = path.join(dir, "baseline.png");
  const currentPath = path.join(dir, `${label}.png`);
  const diffPath = path.join(dir, `${label}.diff.png`);

  await captureScreenshot(url, currentPath);

  if (!fs.existsSync(baselinePath)) {
    fs.copyFileSync(currentPath, baselinePath);
    return {
      hasBaseline: false,
      diffPercentage: 0,
      verdict: "pass",
      diffPixels: 0,
      totalPixels: 0,
      baselinePath,
      currentPath,
      diffPath: "",
    };
  }

  const comparison = compareImages(baselinePath, currentPath, diffPath);
  let verdict: "pass" | "warn" | "rollback" = "pass";
  if (comparison.diffPercentage >= 60) {
    verdict = "rollback";
  } else if (comparison.diffPercentage >= 30) {
    verdict = "warn";
  }

  if (verdict === "pass") {
    fs.copyFileSync(currentPath, baselinePath);
  }

  return {
    hasBaseline: true,
    diffPercentage: comparison.diffPercentage,
    verdict,
    diffPixels: comparison.diffPixels,
    totalPixels: comparison.totalPixels,
    baselinePath,
    currentPath,
    diffPath,
  };
}
