import { describe, it, expect } from "vitest";
import { formatReport, type VerifyReport } from "../src/reporter.js";

const silverReport: VerifyReport = {
  grade: "silver",
  build: { success: true, errors: [], duration: 5000 },
  lighthouse: {
    scores: { performance: 85, accessibility: 92, seo: 88, bestPractices: 90 },
  },
  thresholds: { performance: 70, accessibility: 85, seo: 80, bestPractices: 80 },
  recommendations: [],
};

const unverifiedReport: VerifyReport = {
  grade: "unverified",
  build: { success: false, errors: ["error TS2345: type mismatch"], duration: 3000 },
  lighthouse: { scores: null },
  thresholds: { performance: 70, accessibility: 85, seo: 80, bestPractices: 80 },
  recommendations: [{
    category: "build",
    priority: "critical",
    title: "TypeScript type error",
    description: "TS errors",
    action: "Fix types",
  }],
};

describe("formatReport", () => {
  describe("console format", () => {
    it("includes grade for silver", () => {
      const output = formatReport(silverReport, "console");
      expect(output).toContain("Silver");
      expect(output).toContain("PASS");
    });

    it("includes errors for unverified", () => {
      const output = formatReport(unverifiedReport, "console");
      expect(output).toContain("Unverified");
      expect(output).toContain("FAIL");
      expect(output).toContain("TS2345");
    });
  });

  describe("json format", () => {
    it("outputs valid JSON", () => {
      const output = formatReport(silverReport, "json");
      const parsed = JSON.parse(output);
      expect(parsed.grade).toBe("silver");
      expect(parsed.lighthouse.scores.performance).toBe(85);
    });
  });

  describe("md format", () => {
    it("includes laxy-verify marker", () => {
      const output = formatReport(silverReport, "md");
      expect(output).toContain("<!-- laxy-verify -->");
    });

    it("includes grade in heading", () => {
      const output = formatReport(silverReport, "md");
      expect(output).toContain("Silver");
    });

    it("includes score table", () => {
      const output = formatReport(silverReport, "md");
      expect(output).toContain("| Performance | 85 | 70 |");
    });

    it("includes Gold upsell for non-gold grades", () => {
      const output = formatReport(silverReport, "md");
      expect(output).toContain("Want Gold?");
    });

    it("includes recommendations for failing reports", () => {
      const output = formatReport(unverifiedReport, "md");
      expect(output).toContain("TypeScript type error");
    });
  });
});
