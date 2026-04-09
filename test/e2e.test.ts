import { describe, expect, it } from "vitest";

import { buildVerifyScenarios, getVerificationCoverageGaps, isNavigableInternalHref } from "../src/e2e.js";
import type { VerificationTier } from "../src/verification-core/types.js";

function buildSnapshot(selectors: string[]) {
  return {
    selectors,
    structures: ["main", "form", "h1"],
  };
}

function getScenarioNames(tier: VerificationTier, selectors: string[]) {
  return buildVerifyScenarios(buildSnapshot(selectors), tier).map((scenario) => scenario.name);
}

describe("verify e2e builder", () => {
  it("filters non-page internal hrefs", () => {
    expect(isNavigableInternalHref("/details")).toBe(true);
    expect(isNavigableInternalHref("/_next/static/chunks/webpack.js")).toBe(false);
    expect(isNavigableInternalHref("/robots.txt")).toBe(false);
    expect(isNavigableInternalHref("/?email=")).toBe(false);
    expect(isNavigableInternalHref("/#section")).toBe(false);
  });

  it("skips validation feedback scenario when there is no required field or feedback surface", () => {
    const names = getScenarioNames("pro", [
      "input[type='email']",
      "input[name='email']",
      "button[type='submit']",
      "a[href='/details']",
    ]);

    expect(names).toContain("Primary form interaction");
    expect(names).toContain("Internal navigation");
    expect(names).not.toContain("Validation feedback");
  });

  it("keeps validation feedback scenario when a required field exists", () => {
    const names = getScenarioNames("pro", [
      "input[type='email']",
      "input[required]",
      "button[type='submit']",
      "a[href='/details']",
    ]);

    expect(names).toContain("Validation feedback");
  });

  it("prefers status surfaces over alert surfaces for primary success feedback", () => {
    const scenarios = buildVerifyScenarios(
      buildSnapshot([
        "input[type='email']",
        "input[required]",
        "button[type='submit']",
        "[role='alert']",
        "[role='status']",
      ]),
      "pro_plus"
    );

    const primary = scenarios.find((scenario) => scenario.name === "Primary form interaction");
    expect(primary?.steps.at(-1)?.selector).toBe("[role='status']");
  });

  it("flags coverage gaps when paid verification cannot find a primary action", () => {
    const scenarios = buildVerifyScenarios(buildSnapshot([]), "pro");
    const gaps = getVerificationCoverageGaps(scenarios, "pro");

    expect(gaps[0]).toContain("No primary action scenario was detected");
  });

  it("adds an error-page health check to the initial render scenario", () => {
    const scenarios = buildVerifyScenarios(buildSnapshot(["button[type='submit']"]), "pro");
    const initial = scenarios.find((scenario) => scenario.name === "Initial render");

    expect(initial?.steps.some((step) => step.type === "check_healthy_page")).toBe(true);
  });

  it("checks that internal navigation does not land on an error page", () => {
    const scenarios = buildVerifyScenarios(
      buildSnapshot(["input[type='email']", "input[required]", "button[type='submit']", "a[href='/missing-page']"]),
      "pro_plus"
    );
    const navigation = scenarios.find((scenario) => scenario.name === "Internal navigation");

    expect(navigation?.steps.some((step) => step.description === "Destination should not be an error screen")).toBe(true);
  });
});
