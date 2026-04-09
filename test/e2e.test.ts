import { describe, expect, it } from "vitest";

import { buildVerifyScenarios, isNavigableInternalHref } from "../src/e2e.js";
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
});
