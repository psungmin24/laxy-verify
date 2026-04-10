/**
 * Runtime crawler — BFS page exploration via Puppeteer.
 * Discovers routes, forms, buttons, and interaction points to auto-generate
 * E2E scenarios that cover more of the app than DOM snapshot alone.
 */
import puppeteer from "puppeteer";
import type { E2EScenario, E2EStep } from "./e2e.js";
import type { VerificationTier } from "./verification-core/types.js";

export interface CrawlPage {
  url: string;
  path: string;
  title: string;
  forms: CrawlForm[];
  buttons: string[]; // selectors
  internalLinks: string[]; // href paths
  hasConsoleErrors: boolean;
}

export interface CrawlForm {
  selector: string;
  inputs: { selector: string; type: string; placeholder?: string }[];
  submitSelector?: string;
}

export interface CrawlResult {
  pages: CrawlPage[];
  totalLinks: number;
  crawledCount: number;
}

export interface CrawlOptions {
  maxDepth?: number;
  maxPages?: number;
  timeout?: number;
}

const DEFAULT_MAX_DEPTH = 3;
const DEFAULT_MAX_PAGES = 10;
const DEFAULT_TIMEOUT = 15000;

function isInternalPath(href: string, baseOrigin: string): boolean {
  if (!href) return false;
  if (href.startsWith("#") || href.startsWith("javascript:")) return false;
  if (href.startsWith("/")) {
    if (href.startsWith("/_next/") || href.startsWith("/api/")) return false;
    if (/\.[a-z0-9]{2,8}$/i.test(href)) return false;
    return true;
  }
  try {
    const url = new URL(href);
    return url.origin === baseOrigin && !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/_next/");
  } catch {
    return false;
  }
}

function normalizePath(href: string, _baseOrigin: string): string {
  if (href.startsWith("/")) return href.split("?")[0].split("#")[0];
  try {
    const url = new URL(href);
    return url.pathname;
  } catch {
    return href;
  }
}

export async function crawlApp(
  baseUrl: string,
  options?: CrawlOptions
): Promise<CrawlResult> {
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxPages = options?.maxPages ?? DEFAULT_MAX_PAGES;
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;

  const origin = new URL(baseUrl).origin;
  const visited = new Set<string>();
  const queue: { path: string; depth: number }[] = [{ path: "/", depth: 0 }];
  const pages: CrawlPage[] = [];

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    while (queue.length > 0 && pages.length < maxPages) {
      const item = queue.shift()!;
      // Normalize to avoid duplicates from trailing slashes
      const normalizedPath = item.path.replace(/\/$/, "") || "/";
      if (visited.has(normalizedPath)) continue;
      if (item.depth > maxDepth) continue;
      visited.add(normalizedPath);

      const page = await browser.newPage();
      const consoleErrors: string[] = [];

      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });

      try {
        await page.setViewport({ width: 1280, height: 720 });
        const targetUrl = new URL(normalizedPath, baseUrl).href;
        await page.goto(targetUrl, { waitUntil: "networkidle2", timeout });
        await page.waitForSelector("body", { timeout: 5000 });
        await new Promise((r) => setTimeout(r, 800));

        const pageInfo = await page.evaluate((baseOrigin: string) => {
          const title = document.title || "";
          const links: string[] = [];
          const buttons: string[] = [];
          const forms: {
            selector: string;
            inputs: { selector: string; type: string; placeholder?: string }[];
            submitSelector?: string;
          }[] = [];

          // Collect internal links
          for (const a of Array.from(document.querySelectorAll("a[href]"))) {
            const href = a.getAttribute("href");
            if (href) links.push(href);
          }

          // Collect buttons (non-form)
          for (const btn of Array.from(document.querySelectorAll("button, [role='button']"))) {
            const el = btn as HTMLElement;
            const ariaLabel = el.getAttribute("aria-label");
            const text = el.textContent?.trim().slice(0, 30);
            if (ariaLabel) {
              buttons.push(`button[aria-label='${ariaLabel}']`);
            } else if (el.getAttribute("data-testid")) {
              buttons.push(`[data-testid='${el.getAttribute("data-testid")}']`);
            } else if (el.getAttribute("type") === "submit") {
              buttons.push("button[type='submit']");
            } else if (text) {
              buttons.push("button");
            }
          }

          // Collect forms
          const formElements = document.querySelectorAll("form");
          for (let i = 0; i < formElements.length; i++) {
            const form = formElements[i];
            const formSelector = form.getAttribute("data-testid")
              ? `form[data-testid='${form.getAttribute("data-testid")}']`
              : form.getAttribute("aria-label")
                ? `form[aria-label='${form.getAttribute("aria-label")}']`
                : formElements.length === 1
                  ? "form"
                  : `form:nth-of-type(${i + 1})`;

            const inputs: { selector: string; type: string; placeholder?: string }[] = [];
            for (const input of Array.from(form.querySelectorAll("input, textarea, select"))) {
              const el = input as HTMLInputElement;
              const type = el.type || "text";
              if (["hidden", "submit"].includes(type)) continue;

              let sel = "";
              if (el.getAttribute("name")) sel = `${el.tagName.toLowerCase()}[name='${el.getAttribute("name")}']`;
              else if (el.getAttribute("placeholder")) sel = `${el.tagName.toLowerCase()}[placeholder='${el.getAttribute("placeholder")}']`;
              else if (el.getAttribute("aria-label")) sel = `${el.tagName.toLowerCase()}[aria-label='${el.getAttribute("aria-label")}']`;
              else if (el.id) sel = `#${el.id}`;
              else sel = el.tagName.toLowerCase();

              inputs.push({ selector: sel, type, placeholder: el.placeholder || undefined });
            }

            let submitSelector: string | undefined;
            const submitBtn = form.querySelector("button[type='submit'], input[type='submit']");
            if (submitBtn) {
              submitSelector = submitBtn.getAttribute("type") === "submit"
                ? `${submitBtn.tagName.toLowerCase()}[type='submit']`
                : "button";
            }

            if (inputs.length > 0) {
              forms.push({ selector: formSelector, inputs, submitSelector });
            }
          }

          // Also detect standalone inputs (not in a form)
          const standaloneInputs = document.querySelectorAll("input:not(form input), textarea:not(form textarea)");
          if (standaloneInputs.length > 0 && formElements.length === 0) {
            const inputs: { selector: string; type: string; placeholder?: string }[] = [];
            for (const input of Array.from(standaloneInputs)) {
              const el = input as HTMLInputElement;
              const type = el.type || "text";
              if (["hidden", "submit"].includes(type)) continue;

              let sel = "";
              if (el.getAttribute("placeholder")) sel = `${el.tagName.toLowerCase()}[placeholder='${el.getAttribute("placeholder")}']`;
              else if (el.getAttribute("name")) sel = `${el.tagName.toLowerCase()}[name='${el.getAttribute("name")}']`;
              else sel = el.tagName.toLowerCase();

              inputs.push({ selector: sel, type, placeholder: el.placeholder || undefined });
            }

            const nearbyBtn = document.querySelector("button, [role='button']");
            if (inputs.length > 0) {
              forms.push({
                selector: "body",
                inputs,
                submitSelector: nearbyBtn ? "button" : undefined,
              });
            }
          }

          return { title, links, buttons: Array.from(new Set(buttons)), forms };
        }, origin);

        const internalLinks = pageInfo.links
          .filter((href) => isInternalPath(href, origin))
          .map((href) => normalizePath(href, origin));

        const crawlPage: CrawlPage = {
          url: new URL(normalizedPath, baseUrl).href,
          path: normalizedPath,
          title: pageInfo.title,
          forms: pageInfo.forms,
          buttons: pageInfo.buttons.slice(0, 10),
          internalLinks: Array.from(new Set(internalLinks)),
          hasConsoleErrors: consoleErrors.length > 0,
        };

        pages.push(crawlPage);

        // Queue discovered internal links
        for (const linkPath of crawlPage.internalLinks) {
          if (!visited.has(linkPath.replace(/\/$/, "") || "/")) {
            queue.push({ path: linkPath, depth: item.depth + 1 });
          }
        }
      } catch {
        // Page failed to load — skip
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  return {
    pages,
    totalLinks: pages.reduce((sum, p) => sum + p.internalLinks.length, 0),
    crawledCount: pages.length,
  };
}

/**
 * Generate E2E scenarios from crawl results.
 */
export function buildScenariosFromCrawl(
  crawlResult: CrawlResult,
  tier: VerificationTier
): E2EScenario[] {
  const scenarios: E2EScenario[] = [];
  const limit = tier === "pro_plus" ? 6 : tier === "pro" ? 4 : 2;

  // Scenario 1: Root page render
  const rootPage = crawlResult.pages.find((p) => p.path === "/");
  if (rootPage) {
    scenarios.push({
      name: "Root page render",
      steps: [
        { type: "check_visible", selector: "body", description: "Body should render" },
        { type: "check_healthy_page", description: "Page should not be an error screen" },
        { type: "scroll", description: "Page should scroll" },
        { type: "check_visible", selector: "body", description: "Page should remain stable" },
      ],
    });
  }

  // Scenario 2+: Form interactions (one per discovered form, across pages)
  for (const page of crawlResult.pages) {
    if (scenarios.length >= limit) break;

    for (const form of page.forms) {
      if (scenarios.length >= limit) break;

      const steps: E2EStep[] = [];

      // If form is on a non-root page, start from that route
      if (page.path !== "/") {
        steps.push({
          type: "goto",
          gotoUrl: page.path,
          description: `Navigate to ${page.path}`,
        });
      }

      // Fill inputs
      for (const input of form.inputs.slice(0, 3)) {
        const fillValue = getSmartFillValue(input.type, input.placeholder);
        steps.push({
          type: "clear_fill",
          selector: input.selector,
          value: fillValue,
          description: `Fill ${input.selector}`,
        });
      }

      // Submit
      if (form.submitSelector) {
        steps.push({
          type: "click",
          selector: form.submitSelector,
          description: "Submit the form",
        });
        steps.push({
          type: "wait",
          duration: 800,
          description: "Wait for response",
        });
      }

      // Check page still healthy after submit
      steps.push({
        type: "check_visible",
        selector: "body",
        description: "Page should remain stable after interaction",
      });

      const scenarioName = page.path === "/"
        ? "Primary form interaction"
        : `Form interaction on ${page.path}`;

      scenarios.push({
        name: scenarioName,
        steps: steps.slice(0, 5),
        initialUrl: page.path !== "/" ? page.path : undefined,
      });
    }
  }

  // Scenario: Navigation between pages
  const navPages = crawlResult.pages
    .filter((p) => p.path !== "/" && p.internalLinks.length > 0)
    .slice(0, 2);

  for (const navPage of navPages) {
    if (scenarios.length >= limit) break;

    scenarios.push({
      name: `Navigation to ${navPage.path}`,
      steps: [
        {
          type: "click",
          selector: `a[href='${navPage.path}']`,
          description: `Navigate to ${navPage.path}`,
        },
        { type: "wait", duration: 1000, description: "Wait for navigation" },
        { type: "check_healthy_page", description: "Destination should not be error" },
        { type: "check_visible", selector: "body", description: "Destination should render" },
      ],
    });
  }

  // Scenario: Button interactions (Pro+ only)
  if (tier === "pro_plus") {
    for (const page of crawlResult.pages) {
      if (scenarios.length >= limit) break;

      const nonFormButtons = page.buttons.filter(
        (b) => !b.includes("submit")
      ).slice(0, 1);

      for (const btnSelector of nonFormButtons) {
        if (scenarios.length >= limit) break;

        const steps: E2EStep[] = [];
        if (page.path !== "/") {
          steps.push({
            type: "goto",
            gotoUrl: page.path,
            description: `Navigate to ${page.path}`,
          });
        }

        steps.push(
          { type: "check_visible", selector: btnSelector, description: `Button should be visible` },
          { type: "click", selector: btnSelector, description: `Click ${btnSelector}` },
          { type: "wait", duration: 800, description: "Wait for response" },
          { type: "check_visible", selector: "body", description: "Page should remain stable" }
        );

        scenarios.push({
          name: `Button interaction on ${page.path}`,
          steps: steps.slice(0, 5),
          initialUrl: page.path !== "/" ? page.path : undefined,
        });
      }
    }
  }

  return scenarios.slice(0, limit);
}

function getSmartFillValue(inputType: string, placeholder?: string): string {
  if (inputType === "email" || placeholder?.toLowerCase().includes("email")) return "test@laxy.dev";
  if (inputType === "password") return "Test1234!";
  if (inputType === "number") return "42";
  if (inputType === "tel" || placeholder?.toLowerCase().includes("phone")) return "010-1234-5678";
  if (inputType === "url") return "https://example.com";
  if (placeholder?.toLowerCase().includes("search") || placeholder?.toLowerCase().includes("검색")) return "laxy verify";
  if (placeholder?.toLowerCase().includes("name") || placeholder?.toLowerCase().includes("이름")) return "Laxy User";
  return "laxy-verify-test";
}
