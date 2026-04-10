/**
 * Playwright-based E2E runner for cross-browser testing.
 * Only activated when browsers other than "chromium" are configured.
 * Falls back gracefully if playwright is not installed.
 */
import type { E2EScenario, E2EScenarioResult, E2EStepResult } from "./e2e.js";

type PlaywrightModule = typeof import("playwright");

let _playwright: PlaywrightModule | null | undefined;

async function loadPlaywright(): Promise<PlaywrightModule | null> {
  if (_playwright !== undefined) return _playwright;
  try {
    _playwright = await import("playwright");
    return _playwright;
  } catch {
    _playwright = null;
    return null;
  }
}

export async function isPlaywrightAvailable(): Promise<boolean> {
  return (await loadPlaywright()) !== null;
}

export type BrowserName = "chromium" | "firefox" | "webkit";

export interface CrossBrowserResult {
  browser: BrowserName;
  results: E2EScenarioResult[];
  passed: number;
  failed: number;
  consoleErrors: string[];
}

export async function runPlaywrightE2E(
  url: string,
  scenarios: E2EScenario[],
  browsers: BrowserName[]
): Promise<CrossBrowserResult[]> {
  const pw = await loadPlaywright();
  if (!pw) {
    throw new Error("playwright is not installed. Run: npm install -D playwright && npx playwright install");
  }

  const allResults: CrossBrowserResult[] = [];

  for (const browserName of browsers) {
    const browserType = pw[browserName];
    if (!browserType) {
      console.error(`  Unknown browser: ${browserName}, skipping`);
      continue;
    }

    console.log(`  Running E2E on ${browserName}...`);
    const browser = await browserType.launch({ headless: true });

    try {
      const results: E2EScenarioResult[] = [];

      for (const scenario of scenarios) {
        const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        const page = await context.newPage();
        const stepResults: E2EStepResult[] = [];
        const consoleErrors: string[] = [];

        page.on("console", (msg) => {
          if (msg.type() === "error") {
            consoleErrors.push(`Console error: ${msg.text().slice(0, 200)}`);
          }
        });

        page.on("pageerror", (err) => {
          consoleErrors.push(`Uncaught error: ${err.message.slice(0, 200)}`);
        });

        try {
          const targetUrl = scenario.initialUrl
            ? new URL(scenario.initialUrl, url).href
            : url;
          await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 20000 });
          await page.waitForSelector("body", { timeout: 5000 });
          await page.waitForTimeout(1000);

          for (const step of scenario.steps) {
            const result: E2EStepResult = { description: step.description, passed: false };
            try {
              switch (step.type) {
                case "click":
                  if (!step.selector) throw new Error("Missing selector");
                  await page.locator(step.selector).first().click({ timeout: 8000 });
                  break;
                case "fill":
                case "clear_fill":
                  if (!step.selector) throw new Error("Missing selector");
                  await page.locator(step.selector).first().click({ timeout: 8000 });
                  await page.locator(step.selector).first().fill(step.value || "");
                  break;
                case "check_visible":
                  if (!step.selector) throw new Error("Missing selector");
                  await page.locator(step.selector).first().waitFor({ state: "visible", timeout: 8000 });
                  break;
                case "check_text": {
                  if (!step.expectedText) throw new Error("Missing expectedText");
                  const bodyText = await page.locator("body").innerText();
                  if (!bodyText.includes(step.expectedText)) {
                    throw new Error(`Expected text "${step.expectedText}" not found`);
                  }
                  break;
                }
                case "check_healthy_page": {
                  const bodyText = await page.locator("body").innerText();
                  const title = await page.title();
                  const haystack = `${title}\n${bodyText.slice(0, 1200)}`.toLowerCase();
                  const errorPatterns = [
                    /internal server error/,
                    /application error/,
                    /\b404\b/,
                    /\b500\b/,
                    /server error/,
                    /something went wrong/,
                  ];
                  if (errorPatterns.some((p) => p.test(haystack))) {
                    throw new Error("Page looks like an error screen");
                  }
                  break;
                }
                case "check_validation":
                  // Simplified check: look for any aria-invalid or role=alert
                  if (!step.selector) throw new Error("Missing selector");
                  await page.locator(step.selector).first().waitFor({ state: "visible", timeout: 8000 });
                  break;
                case "wait":
                  await page.waitForTimeout(step.duration ?? 1000);
                  break;
                case "scroll":
                  if (step.selector && step.selector !== "body") {
                    await page.locator(step.selector).first().scrollIntoViewIfNeeded();
                  } else {
                    await page.evaluate(() => window.scrollBy(0, 300));
                  }
                  break;
                case "goto": {
                  if (!step.gotoUrl) throw new Error("Missing gotoUrl");
                  const gotoTarget = new URL(step.gotoUrl, page.url()).href;
                  await page.goto(gotoTarget, { waitUntil: "networkidle", timeout: 20000 });
                  await page.waitForSelector("body", { timeout: 5000 });
                  break;
                }
              }
              result.passed = true;
            } catch (error) {
              result.passed = false;
              result.error = error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200);
            }

            stepResults.push(result);
            if (!result.passed) break;
          }

          results.push({
            name: scenario.name,
            passed: stepResults.every((s) => s.passed),
            steps: stepResults,
            consoleErrors,
          });
        } catch (error) {
          results.push({
            name: scenario.name,
            passed: false,
            steps: stepResults,
            error: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
            consoleErrors,
          });
        } finally {
          await context.close();
        }
      }

      const passed = results.filter((r) => r.passed).length;
      const allConsoleErrors = Array.from(
        new Set(results.flatMap((r) => r.consoleErrors ?? []))
      ).slice(0, 10);

      allResults.push({
        browser: browserName,
        results,
        passed,
        failed: results.length - passed,
        consoleErrors: allConsoleErrors,
      });
    } finally {
      await browser.close();
    }
  }

  return allResults;
}
