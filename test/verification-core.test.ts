import { describe, expect, it } from "vitest";
import {
  buildVerificationReport,
  getTierVerificationView,
  planToVerificationTier,
} from "../src/verification-core/index.js";

const thresholds = {
  performance: 70,
  accessibility: 85,
  seo: 80,
  bestPractices: 80,
};

describe("verification core", () => {
  it("maps paid plans to verification tiers", () => {
    expect(planToVerificationTier("free")).toBe("free");
    expect(planToVerificationTier("pro")).toBe("pro");
    expect(planToVerificationTier("pro_plus")).toBe("pro_plus");
    expect(planToVerificationTier("team")).toBe("pro_plus");
  });

  it("returns quick-pass for a healthy free verification run", () => {
    const report = buildVerificationReport(
      {
        buildSuccess: true,
        lighthouseScores: { performance: 80, accessibility: 90, seo: 88, bestPractices: 86 },
      },
      { tier: "free", thresholds }
    );

    expect(report.verdict).toBe("quick-pass");
    expect(report.blockers).toHaveLength(0);
  });

  it("returns hold for pro when lighthouse blockers exist", () => {
    const report = buildVerificationReport(
      {
        buildSuccess: true,
        lighthouseScores: { performance: 40, accessibility: 90, seo: 88, bestPractices: 86 },
      },
      { tier: "pro", thresholds }
    );

    expect(report.verdict).toBe("hold");
    expect(report.blockers[0]?.category).toBe("performance");
  });

  it("returns client-ready for pro with clean core checks", () => {
    const report = buildVerificationReport(
      {
        buildSuccess: true,
        e2ePassed: 2,
        e2eTotal: 2,
        lighthouseScores: { performance: 82, accessibility: 90, seo: 88, bestPractices: 86 },
      },
      { tier: "pro", thresholds }
    );

    expect(report.verdict).toBe("client-ready");
  });

  it("does not treat skipped lighthouse as a failed check", () => {
    const report = buildVerificationReport(
      {
        buildSuccess: true,
        e2ePassed: 1,
        e2eTotal: 1,
        lighthouseSkipped: true,
      },
      { tier: "pro", thresholds }
    );

    expect(report.verdict).toBe("investigate");
    expect(report.passes.some((check) => check.key === "lighthouse")).toBe(false);
  });

  it("returns investigate for pro_plus without viewport evidence", () => {
    const report = buildVerificationReport(
      {
        buildSuccess: true,
        e2ePassed: 1,
        e2eTotal: 1,
        lighthouseScores: { performance: 80, accessibility: 90, seo: 88, bestPractices: 86 },
      },
      { tier: "pro_plus", thresholds }
    );

    expect(report.verdict).toBe("investigate");
  });

  it("requires comparable visual diff evidence before calling pro_plus release-ready", () => {
    const report = buildVerificationReport(
      {
        buildSuccess: true,
        e2ePassed: 1,
        e2eTotal: 1,
        multiViewportPassed: true,
        viewportIssues: 0,
        visualDiffVerdict: "pass",
        hasVisualBaseline: false,
        lighthouseScores: { performance: 80, accessibility: 90, seo: 88, bestPractices: 86 },
      },
      { tier: "pro_plus", thresholds }
    );

    expect(report.verdict).toBe("investigate");
  });

  it("returns hold when paid verification could not cover a real user action", () => {
    const report = buildVerificationReport(
      {
        buildSuccess: true,
        e2ePassed: 2,
        e2eTotal: 2,
        e2eCoverageGaps: [
          "No primary action scenario was detected, so the verify run could not validate a real user action.",
        ],
        lighthouseScores: { performance: 80, accessibility: 90, seo: 88, bestPractices: 86 },
      },
      { tier: "pro", thresholds }
    );

    expect(report.verdict).toBe("hold");
    expect(report.blockers[0]?.title).toContain("Verification coverage gaps");
  });

  it("returns release-ready for pro_plus with full clean evidence", () => {
    const report = buildVerificationReport(
      {
        buildSuccess: true,
        e2ePassed: 1,
        e2eTotal: 1,
        multiViewportPassed: true,
        viewportIssues: 0,
        visualDiffVerdict: "pass",
        hasVisualBaseline: true,
        lighthouseScores: { performance: 80, accessibility: 90, seo: 88, bestPractices: 86 },
      },
      { tier: "pro_plus", thresholds }
    );

    expect(report.verdict).toBe("release-ready");
    expect(getTierVerificationView(report).showReportExport).toBe(true);
  });

  it("returns investigate for pro_plus when warning-level runtime risk exists", () => {
    const report = buildVerificationReport(
      {
        buildSuccess: true,
        e2ePassed: 1,
        e2eTotal: 1,
        e2eConsoleErrorCount: 1,
        multiViewportPassed: true,
        viewportIssues: 0,
        visualDiffVerdict: "pass",
        hasVisualBaseline: true,
        lighthouseScores: { performance: 80, accessibility: 90, seo: 88, bestPractices: 86 },
      },
      { tier: "pro_plus", thresholds }
    );

    expect(report.verdict).toBe("investigate");
  });
});
