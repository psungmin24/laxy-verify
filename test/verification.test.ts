import { describe, it, expect } from "vitest";
import {
  getVerificationGrade,
  getLighthousePass,
  getImprovementRecommendations,
  LH_THRESHOLDS,
} from "../src/verification.js";

describe("getVerificationGrade", () => {
  it("returns gold when build + E2E + LH all pass", () => {
    expect(getVerificationGrade({
      buildSuccess: true,
      e2ePassed: 5,
      e2eTotal: 5,
      lighthouseScores: { performance: 90, accessibility: 90, seo: 90, bestPractices: 90 },
    })).toBe("gold");
  });

  it("returns silver when build + LH pass (no E2E)", () => {
    expect(getVerificationGrade({
      buildSuccess: true,
      lighthouseScores: { performance: 80, accessibility: 90, seo: 85, bestPractices: 85 },
    })).toBe("silver");
  });

  it("returns silver when build + E2E pass (LH missing)", () => {
    expect(getVerificationGrade({
      buildSuccess: true,
      e2ePassed: 3,
      e2eTotal: 3,
    })).toBe("silver");
  });

  it("returns bronze when only build passes", () => {
    expect(getVerificationGrade({ buildSuccess: true })).toBe("bronze");
  });

  it("returns bronze when build passes but LH fails", () => {
    expect(getVerificationGrade({
      buildSuccess: true,
      lighthouseScores: { performance: 30, accessibility: 90, seo: 85, bestPractices: 85 },
    })).toBe("bronze");
  });

  it("returns unverified when build fails", () => {
    expect(getVerificationGrade({ buildSuccess: false })).toBe("unverified");
  });

  it("returns unverified when build is undefined", () => {
    expect(getVerificationGrade({})).toBe("unverified");
  });
});

describe("getLighthousePass", () => {
  it("passes when all scores meet thresholds", () => {
    expect(getLighthousePass({
      performance: 70,
      accessibility: 85,
      seo: 80,
      bestPractices: 80,
    })).toBe(true);
  });

  it("fails when performance is below threshold", () => {
    expect(getLighthousePass({
      performance: 69,
      accessibility: 85,
      seo: 80,
      bestPractices: 80,
    })).toBe(false);
  });

  it("fails when accessibility is below threshold", () => {
    expect(getLighthousePass({
      performance: 70,
      accessibility: 84,
      seo: 80,
      bestPractices: 80,
    })).toBe(false);
  });

  it("returns false for undefined input", () => {
    expect(getLighthousePass(undefined)).toBe(false);
  });

  it("supports custom thresholds", () => {
    expect(getLighthousePass(
      { performance: 50, accessibility: 50, seo: 50, bestPractices: 50 },
      { performance: 50, accessibility: 50, seo: 50, bestPractices: 50 }
    )).toBe(true);
  });
});

describe("getImprovementRecommendations", () => {
  it("returns build error rules for TS errors", () => {
    const rules = getImprovementRecommendations({
      buildSuccess: false,
      buildErrors: ["error TS2345: Argument of type..."],
    });
    expect(rules.some((r) => r.title.includes("TypeScript"))).toBe(true);
    expect(rules[0].priority).toBe("critical");
  });

  it("returns module error rules", () => {
    const rules = getImprovementRecommendations({
      buildSuccess: false,
      buildErrors: ["Module not found: Error: Can't resolve 'foo'"],
    });
    expect(rules.some((r) => r.title.includes("Module"))).toBe(true);
  });

  it("returns LH recommendations for below-threshold scores", () => {
    const rules = getImprovementRecommendations({
      buildSuccess: true,
      lighthouseScores: { performance: 40, accessibility: 90, seo: 90, bestPractices: 90 },
    });
    expect(rules.some((r) => r.category === "performance")).toBe(true);
    expect(rules[0].priority).toBe("high"); // gap >= 20
  });

  it("returns empty array when everything passes", () => {
    const rules = getImprovementRecommendations({
      buildSuccess: true,
      lighthouseScores: { performance: 90, accessibility: 90, seo: 90, bestPractices: 90 },
    });
    expect(rules).toHaveLength(0);
  });

  it("returns generic build failure when no specific error matched", () => {
    const rules = getImprovementRecommendations({
      buildSuccess: false,
      buildErrors: ["something weird happened"],
    });
    expect(rules.some((r) => r.title === "Build failed")).toBe(true);
  });
});
