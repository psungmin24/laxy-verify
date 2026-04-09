import { describe, it, expect } from "vitest";
import { calculateGrade, isWorseOrEqual, type LighthouseScores } from "../src/grade.js";

const scores: LighthouseScores = {
  performance: 80,
  accessibility: 90,
  seo: 85,
  bestPractices: 85,
};

const thresholds = {
  performance: 70,
  accessibility: 85,
  seo: 80,
  bestPractices: 80,
};

describe("calculateGrade", () => {
  it("returns unverified when build fails", () => {
    const result = calculateGrade({
      buildSuccess: false,
      scores,
      thresholds,
      failOn: "bronze",
    });
    expect(result.grade).toBe("unverified");
    expect(result.exitCode).toBe(1);
  });

  it("returns bronze when build succeeds but no LH scores", () => {
    const result = calculateGrade({
      buildSuccess: true,
      scores: undefined,
      thresholds,
      failOn: "bronze",
    });
    expect(result.grade).toBe("bronze");
    expect(result.exitCode).toBe(0);
  });

  it("returns bronze when LH scores fail performance threshold", () => {
    const result = calculateGrade({
      buildSuccess: true,
      scores: { performance: 50, accessibility: 90, seo: 85, bestPractices: 85 },
      thresholds,
      failOn: "bronze",
    });
    expect(result.grade).toBe("bronze");
    expect(result.exitCode).toBe(0);
  });

  it("returns silver when build succeeds and LH passes", () => {
    const result = calculateGrade({
      buildSuccess: true,
      scores,
      thresholds,
      failOn: "bronze",
    });
    expect(result.grade).toBe("silver");
    expect(result.exitCode).toBe(0);
  });

  it("returns gold when goldEligible=true and LH passes", () => {
    const result = calculateGrade({
      buildSuccess: true,
      scores,
      thresholds,
      failOn: "bronze",
      goldEligible: true,
    });
    expect(result.grade).toBe("gold");
    expect(result.exitCode).toBe(0);
  });

  it("returns silver (not gold) when goldEligible=false and LH passes", () => {
    const result = calculateGrade({
      buildSuccess: true,
      scores,
      thresholds,
      failOn: "bronze",
      goldEligible: false,
    });
    expect(result.grade).toBe("silver");
    expect(result.exitCode).toBe(0);
  });

  it("returns bronze (not gold) when goldEligible=true but LH fails", () => {
    const result = calculateGrade({
      buildSuccess: true,
      scores: { performance: 50, accessibility: 90, seo: 85, bestPractices: 85 },
      thresholds,
      failOn: "bronze",
      goldEligible: true,
    });
    expect(result.grade).toBe("bronze");
    expect(result.exitCode).toBe(0);
  });

  it("returns unverified (not gold) when goldEligible=true but build fails", () => {
    const result = calculateGrade({
      buildSuccess: false,
      scores,
      thresholds,
      failOn: "unverified",
      goldEligible: true,
    });
    expect(result.grade).toBe("unverified");
    expect(result.exitCode).toBe(0);
  });

  it("exits 1 when gold required but only silver achieved", () => {
    const result = calculateGrade({
      buildSuccess: true,
      scores,
      thresholds,
      failOn: "gold",
      goldEligible: false,
    });
    expect(result.grade).toBe("silver");
    expect(result.exitCode).toBe(1);
  });

  it("exits 1 when grade worse than fail_on: silver", () => {
    const result = calculateGrade({
      buildSuccess: true,
      scores: undefined,
      thresholds,
      failOn: "silver",
    });
    expect(result.grade).toBe("bronze");
    expect(result.exitCode).toBe(1);
  });

  it("exits 0 when fail_on: unverified (informational only)", () => {
    const result = calculateGrade({
      buildSuccess: false,
      scores: undefined,
      thresholds,
      failOn: "unverified",
    });
    expect(result.grade).toBe("unverified");
    expect(result.exitCode).toBe(0);
  });

  it("applies CI mode performance offset", () => {
    const ciThresholds = {
      ...thresholds,
      performance: thresholds.performance - 10,
    };
    // Performance 65 would fail normally but passes in CI mode
    const result = calculateGrade({
      buildSuccess: true,
      scores: { performance: 65, accessibility: 90, seo: 85, bestPractices: 85 },
      thresholds: ciThresholds,
      failOn: "bronze",
    });
    expect(result.grade).toBe("silver");
    expect(result.exitCode).toBe(0);
  });
});

describe("isWorseOrEqual", () => {
  it("returns false for same grade", () => {
    expect(isWorseOrEqual("bronze", "bronze")).toBe(false);
  });

  it("returns true when unverified vs bronze", () => {
    expect(isWorseOrEqual("unverified", "bronze")).toBe(true);
  });

  it("returns false when silver vs bronze", () => {
    expect(isWorseOrEqual("silver", "bronze")).toBe(false);
  });

  it("returns true when bronze vs silver", () => {
    expect(isWorseOrEqual("bronze", "silver")).toBe(true);
  });
});
