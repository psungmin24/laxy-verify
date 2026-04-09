import puppeteer from "puppeteer";
import type { VerificationTier } from "./verification-core/types.js";

export interface E2EStep {
  type: "click" | "fill" | "check_visible" | "wait" | "scroll" | "clear_fill" | "check_validation" | "check_healthy_page";
  selector?: string;
  value?: string;
  duration?: number;
  description: string;
}

export interface E2EScenario {
  name: string;
  steps: E2EStep[];
}

export interface E2EStepResult {
  description: string;
  passed: boolean;
  error?: string;
}

export interface E2EScenarioResult {
  name: string;
  passed: boolean;
  steps: E2EStepResult[];
  error?: string;
}

interface DomSnapshot {
  selectors: string[];
  structures: string[];
}

export function isNavigableInternalHref(href: string): boolean {
  if (!href.startsWith("/")) return false;
  if (href.startsWith("/_next/")) return false;
  if (href.startsWith("/api/")) return false;
  if (href === "/" || href.startsWith("/#")) return false;
  if (href.includes("?")) return false;
  if (/\.[a-z0-9]{2,8}$/i.test(href)) return false;
  return true;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function pickSelector(candidates: string[], patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = candidates.find((candidate) => pattern.test(normalize(candidate)));
    if (match) return match;
  }
  return undefined;
}

function getScenarioLimit(tier: VerificationTier): number {
  switch (tier) {
    case "pro":
      return 4;
    case "pro_plus":
      return 5;
    default:
      return 2;
  }
}

function getVisibleAnchor(selectors: string[]): string {
  return pickSelector(selectors, [/^main$/, /^form$/, /^section$/, /^h1$/, /^h2$/, /^button/, /^a\[href/]) || "body";
}

function getClickTarget(selectors: string[]): string | undefined {
  return pickSelector(selectors, [
    /^button\[type=['"]submit['"]\]/,
    /^input\[type=['"]submit['"]\]/,
    /^button\[aria-label.*(submit|continue|login|sign in|save|start|search|next)/,
    /^input\[type=['"]checkbox['"]\]/,
    /^\[role=['"]checkbox['"]\]$/,
    /^a\[href=['"]\//,
    /^button/,
    /^\[role=['"]button['"]\]$/,
  ]);
}

function getFillTarget(selectors: string[]): string | undefined {
  return pickSelector(selectors, [
    /^input\[type=['"]email['"]\]/,
    /^input\[type=['"]text['"]\]/,
    /^input\[name.*(email|query|search|name)/,
    /^input\[placeholder.*(email|search|name|message|title)/,
    /^textarea$/,
    /^input/,
  ]);
}

function getFeedbackTarget(selectors: string[]): string | undefined {
  return pickSelector(selectors, [
    /^\[role=['"]status['"]\]$/,
    /^\[aria-live=['"](polite|assertive)['"]\]$/,
    /^\[role=['"]alert['"]\]$/,
    /^\[data-testid.*(error|success|toast|alert|notice|result)/,
    /^\.(error|alert|toast|notice|success|status)/,
  ]);
}

function getRequiredFillTarget(selectors: string[]): string | undefined {
  return pickSelector(selectors, [
    /^input\[required\]$/,
    /^textarea\[required\]$/,
    /^input\[aria-required=['"]true['"]\]$/,
    /^textarea\[aria-required=['"]true['"]\]$/,
  ]);
}

export function getVerificationCoverageGaps(
  scenarios: E2EScenario[],
  tier: VerificationTier
): string[] {
  const names = new Set(scenarios.map((scenario) => scenario.name));
  const gaps: string[] = [];

  const hasPrimaryAction =
    names.has("Primary form interaction") || names.has("Primary CTA interaction");

  if (tier !== "free" && !hasPrimaryAction) {
    gaps.push(
      "No primary action scenario was detected, so the verify run could not validate a real user action."
    );
  }

  if (tier === "pro_plus" && scenarios.length < 4) {
    gaps.push(
      "Too few meaningful scenarios were detected for a release-confidence pass, so this run stayed shallower than Pro+ expects."
    );
  }

  return gaps;
}

export function buildVerifyScenarios(snapshot: DomSnapshot, tier: VerificationTier): E2EScenario[] {
  const selectors = [...snapshot.selectors, ...snapshot.structures];
  const visibleAnchor = getVisibleAnchor(selectors);
  const fillTarget = getFillTarget(selectors);
  const clickTarget = getClickTarget(selectors);
  const feedbackTarget = getFeedbackTarget(selectors);
  const requiredFillTarget = getRequiredFillTarget(selectors);
  const localLinkTarget = pickSelector(selectors, [/^a\[href=['"]\//]);
  const likelyFormSurface =
    selectors.some((selector) => /^form$/.test(normalize(selector))) ||
    selectors.some((selector) => /^input|^textarea/.test(normalize(selector)));

  const scenarios: E2EScenario[] = [
    {
      name: "Initial render",
      steps: [
        { type: "wait", duration: 1200, description: "Wait for hydration" },
        { type: "check_visible", selector: "body", description: "Body should render" },
        { type: "check_healthy_page", description: "Page should not be an error screen" },
        { type: "check_visible", selector: visibleAnchor, description: "Core UI should stay visible" },
      ],
    },
  ];

  if (fillTarget && likelyFormSurface) {
    const formScenario: E2EScenario = {
      name: "Primary form interaction",
      steps: [
        { type: "check_visible", selector: fillTarget, description: "Input surface should be visible" },
        { type: "clear_fill", selector: fillTarget, value: "laxy verify", description: "Fill a core input field" },
      ],
    };

    if (clickTarget) {
      formScenario.steps.push(
        { type: "click", selector: clickTarget, description: "Trigger the primary CTA" },
        { type: "wait", duration: 800, description: "Wait for UI response" },
        { type: "check_visible", selector: feedbackTarget || visibleAnchor, description: "Feedback or surface should remain visible" }
      );
    }

    scenarios.push(formScenario);
  } else if (clickTarget) {
    scenarios.push({
      name: "Primary CTA interaction",
      steps: [
        { type: "check_visible", selector: clickTarget, description: "CTA should be visible" },
        { type: "click", selector: clickTarget, description: "Trigger the primary CTA" },
        { type: "wait", duration: 800, description: "Wait for UI response" },
        { type: "check_visible", selector: feedbackTarget || visibleAnchor, description: "Core surface should stay visible" },
      ],
    });
  }

  if (tier !== "free" && fillTarget && clickTarget && (requiredFillTarget || feedbackTarget)) {
    scenarios.push({
      name: "Validation feedback",
      steps: [
        { type: "clear_fill", selector: requiredFillTarget || fillTarget, value: "", description: "Clear the required input" },
        { type: "click", selector: clickTarget, description: "Try the CTA without valid input" },
        { type: "wait", duration: 700, description: "Wait for validation" },
        { type: "check_validation", selector: requiredFillTarget || fillTarget, description: "Validation feedback should appear" },
      ],
    });
  }

  if (tier !== "free" && localLinkTarget) {
    scenarios.push({
      name: "Internal navigation",
      steps: [
        { type: "check_visible", selector: localLinkTarget, description: "Internal link should be visible" },
        { type: "click", selector: localLinkTarget, description: "Navigate using an internal link" },
        { type: "wait", duration: 1000, description: "Wait for navigation" },
        { type: "check_healthy_page", description: "Destination should not be an error screen" },
        { type: "check_visible", selector: "body", description: "Destination page should render" },
      ],
    });
  }

  if (tier === "pro_plus" && clickTarget && fillTarget && clickTarget !== fillTarget) {
    scenarios.push({
      name: "Repeated interaction stability",
      steps: [
        { type: "check_visible", selector: fillTarget, description: "Input surface should still exist" },
        { type: "clear_fill", selector: fillTarget, value: "release confidence", description: "Repeat the core input" },
        { type: "click", selector: clickTarget, description: "Trigger the CTA again" },
        { type: "wait", duration: 800, description: "Wait for repeated interaction response" },
        { type: "check_visible", selector: feedbackTarget || visibleAnchor, description: "Surface should still hold after repeat" },
      ],
    });
  }

  scenarios.push({
    name: "Scroll stability",
    steps: [
      { type: "check_visible", selector: visibleAnchor, description: "Initial content should render" },
      { type: "scroll", selector: "body", description: "Page should scroll" },
      { type: "wait", duration: 500, description: "Wait after scrolling" },
      { type: "check_visible", selector: "body", description: "Page should remain stable after scroll" },
    ],
  });

  return scenarios.slice(0, getScenarioLimit(tier));
}

async function captureDomSnapshot(url: string): Promise<DomSnapshot> {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });
    await page.waitForSelector("body", { timeout: 5000 });
    const snapshot = await page.evaluate(() => {
      const isNavigableInternalHref = (href: string): boolean => {
        if (!href.startsWith("/")) return false;
        if (href.startsWith("/_next/")) return false;
        if (href.startsWith("/api/")) return false;
        if (href === "/" || href.startsWith("/#")) return false;
        if (href.includes("?")) return false;
        if (/\.[a-z0-9]{2,8}$/i.test(href)) return false;
        return true;
      };

      const selectors: string[] = [];
      const structures: string[] = [];

      const nodes = Array.from(document.querySelectorAll("*")).slice(0, 250);
      for (const node of nodes) {
        const tag = node.tagName.toLowerCase();
        const role = node.getAttribute("role");
        const type = node.getAttribute("type");
        const name = node.getAttribute("name");
        const placeholder = node.getAttribute("placeholder");
        const href = node.getAttribute("href");
        const ariaLabel = node.getAttribute("aria-label");
        const dataTestId = node.getAttribute("data-testid");
        const ariaLive = node.getAttribute("aria-live");

        if (["main", "form", "section", "header", "nav", "footer", "h1", "h2"].includes(tag)) {
          structures.push(tag);
        }

        if (tag === "button") selectors.push("button");
        if (role === "button") selectors.push("[role='button']");
        if (type === "submit") selectors.push(`${tag}[type='submit']`);
        if (type === "checkbox") selectors.push(`${tag}[type='checkbox']`);
        if (tag === "input" || tag === "textarea") selectors.push(tag);
        if (type) selectors.push(`${tag}[type='${type}']`);
        if (name) selectors.push(`${tag}[name='${name}']`);
        if (placeholder) selectors.push(`${tag}[placeholder='${placeholder}']`);
        if (href && isNavigableInternalHref(href)) selectors.push(`a[href='${href}']`);
        if (ariaLabel) selectors.push(`${tag}[aria-label='${ariaLabel}']`);
        if (role === "alert" || role === "status") selectors.push(`[role='${role}']`);
        if (ariaLive) selectors.push(`[aria-live='${ariaLive}']`);
        if (dataTestId) selectors.push(`[data-testid='${dataTestId}']`);
        if ((tag === "input" || tag === "textarea") && node.hasAttribute("required")) {
          selectors.push(`${tag}[required]`);
        }
        if ((tag === "input" || tag === "textarea") && node.getAttribute("aria-required") === "true") {
          selectors.push(`${tag}[aria-required='true']`);
        }
      }

      return {
        selectors: Array.from(new Set(selectors)),
        structures: Array.from(new Set(structures)),
      };
    });
    return snapshot;
  } finally {
    await browser.close();
  }
}

async function executeScenario(url: string, scenario: E2EScenario): Promise<E2EScenarioResult> {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const stepResults: E2EStepResult[] = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });
    await page.waitForSelector("body", { timeout: 5000 });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    for (const step of scenario.steps) {
      const result: E2EStepResult = { description: step.description, passed: false };
      try {
        switch (step.type) {
          case "click":
            if (!step.selector) throw new Error("Missing selector");
            await page.waitForSelector(step.selector, { visible: true, timeout: 8000 });
            await page.click(step.selector);
            break;
          case "fill":
          case "clear_fill":
            if (!step.selector) throw new Error("Missing selector");
            await page.waitForSelector(step.selector, { visible: true, timeout: 8000 });
            await page.click(step.selector, { clickCount: 3 });
            await page.keyboard.press("Backspace");
            if (step.value) {
              await page.type(step.selector, step.value);
            }
            break;
          case "check_visible":
            if (!step.selector) throw new Error("Missing selector");
            await page.waitForSelector(step.selector, { visible: true, timeout: 8000 });
            break;
          case "check_healthy_page":
            const hasErrorPageSignals = await page.evaluate(() => {
              const title = document.title ?? "";
              const h1 = document.querySelector("h1")?.textContent ?? "";
              const bodyText = document.body?.innerText?.slice(0, 1200) ?? "";
              const haystack = `${title}\n${h1}\n${bodyText}`.toLowerCase();

              const patterns = [
                /internal server error/,
                /application error/,
                /unexpected application error/,
                /this page could not be found/,
                /\b404\b/,
                /\b500\b/,
                /server error/,
                /something went wrong/,
              ];

              return patterns.some((pattern) => pattern.test(haystack));
            });

            if (hasErrorPageSignals) {
              throw new Error("The page looks like an error screen, not a healthy app surface.");
            }
            break;
          case "check_validation":
            if (!step.selector) throw new Error("Missing selector");
            await page.waitForSelector(step.selector, { visible: true, timeout: 8000 });
            const hasValidationEvidence = await page.$eval(step.selector, (element) => {
              const field = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
              const feedbackSelectors = [
                "[role='alert']",
                "[role='status']",
                "[aria-live='polite']",
                "[aria-live='assertive']",
                "[data-testid*='error']",
                "[data-testid*='success']",
                "[data-testid*='toast']",
                "[data-testid*='notice']",
                ".error",
                ".alert",
                ".toast",
                ".notice",
                ".success",
                ".status",
              ];

              const hasVisibleFeedback = feedbackSelectors.some((selector) =>
                Array.from(document.querySelectorAll(selector)).some((node) => {
                  const el = node as HTMLElement;
                  const style = window.getComputedStyle(el);
                  const text = el.textContent?.trim() ?? "";
                  return style.display !== "none" && style.visibility !== "hidden" && text.length > 0;
                })
              );

              const validity = "validity" in field ? field.validity : null;
              const invalidField = !!validity && !validity.valid;
              const validationMessage = "validationMessage" in field ? field.validationMessage?.trim().length > 0 : false;
              const ariaInvalid = field.getAttribute("aria-invalid") === "true";

              return hasVisibleFeedback || invalidField || validationMessage || ariaInvalid;
            });

            if (!hasValidationEvidence) {
              throw new Error(`No validation evidence found for ${step.selector}`);
            }
            break;
          case "wait":
            await new Promise((resolve) => setTimeout(resolve, step.duration ?? 1000));
            break;
          case "scroll":
            if (step.selector && step.selector !== "body") {
              await page.$eval(step.selector, (element) => {
                element.scrollIntoView({ behavior: "instant", block: "center" });
              });
            } else {
              await page.evaluate(() => window.scrollBy(0, 300));
            }
            break;
        }
        result.passed = true;
      } catch (error) {
        result.passed = false;
        result.error = error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200);
      }

      stepResults.push(result);
      if (!result.passed) break;
    }

    return {
      name: scenario.name,
      passed: stepResults.every((step) => step.passed),
      steps: stepResults,
    };
  } catch (error) {
    return {
      name: scenario.name,
      passed: false,
      steps: stepResults,
      error: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
    };
  } finally {
    await browser.close();
  }
}

export async function runVerifyE2E(
  url: string,
  tier: VerificationTier
): Promise<{
  scenarios: E2EScenario[];
  results: E2EScenarioResult[];
  passed: number;
  failed: number;
  coverageGaps: string[];
}> {
  const snapshot = await captureDomSnapshot(url);
  const scenarios = buildVerifyScenarios(snapshot, tier);
  const coverageGaps = getVerificationCoverageGaps(scenarios, tier);
  const results: E2EScenarioResult[] = [];

  for (const scenario of scenarios) {
    results.push(await executeScenario(url, scenario));
  }

  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;

  return { scenarios, results, passed, failed, coverageGaps };
}
