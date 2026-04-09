import { describe, expect, it } from "vitest";

import { applyPlanOverride, normalizePlan, type EntitlementFeatures } from "../src/entitlement.js";

const proPlusFeatures: EntitlementFeatures = {
  plan: "pro_plus",
  gold_grade: true,
  lighthouse_runs_3: true,
  verbose_failure: true,
  multi_viewport: true,
  failure_analysis: true,
  fast_lane: true,
};

describe("entitlement overrides", () => {
  it("normalizes team-like plans to pro_plus", () => {
    expect(normalizePlan("team")).toBe("pro_plus");
    expect(normalizePlan("enterprise")).toBe("pro_plus");
    expect(normalizePlan("pro")).toBe("pro");
    expect(normalizePlan("free")).toBe("free");
  });

  it("lets a pro_plus account downgrade to pro for testing", () => {
    const overridden = applyPlanOverride(proPlusFeatures, "pro");

    expect(overridden.plan).toBe("pro");
    expect(overridden.lighthouse_runs_3).toBe(true);
    expect(overridden.multi_viewport).toBe(false);
    expect(overridden.failure_analysis).toBe(false);
  });

  it("lets a pro_plus account downgrade to free for testing", () => {
    const overridden = applyPlanOverride(proPlusFeatures, "free");

    expect(overridden.plan).toBe("free");
    expect(overridden.lighthouse_runs_3).toBe(false);
    expect(overridden.multi_viewport).toBe(false);
    expect(overridden.fast_lane).toBe(false);
  });

  it("rejects upgrades above the active entitlement", () => {
    const freeFeatures: EntitlementFeatures = {
      plan: "free",
      gold_grade: false,
      lighthouse_runs_3: false,
      verbose_failure: false,
      multi_viewport: false,
      failure_analysis: false,
      fast_lane: false,
    };

    expect(() => applyPlanOverride(freeFeatures, "pro_plus")).toThrow(/Downgrade overrides are allowed/);
  });
});
