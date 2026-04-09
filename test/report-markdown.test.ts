import { describe, expect, it } from "vitest";
import { buildMarkdownReport, shouldWriteMarkdownReport } from "../src/report-markdown.js";

describe("report markdown", () => {
  it("only enables markdown export for paid verification tiers", () => {
    expect(
      shouldWriteMarkdownReport({
        grade: "Bronze",
        timestamp: "2026-04-09T12:00:00.000Z",
        build: { success: true, durationMs: 1000, errors: [] },
        lighthouse: null,
        thresholds: { performance: 70, accessibility: 85, seo: 80, bestPractices: 80 },
        framework: "nextjs",
        verification: {
          tier: "free",
          report: {
            tier: "free",
            verdict: "quick-pass",
            confidence: "low",
            summary: "ok",
            grade: "bronze",
            blockers: [],
            warnings: [],
            passes: [],
            nextActions: [],
            failureEvidence: [],
            evidence: {
              input: {},
              thresholds: { performance: 70, accessibility: 85, seo: 80, bestPractices: 80 },
              buildPassed: true,
              e2ePassedAll: false,
              hasE2EData: false,
              hasLighthouseData: false,
              lighthouseSkipped: false,
              hasMultiViewportData: false,
              multiViewportPassed: false,
              hasVisualDiffData: false,
              visualDiffPassed: false,
              lighthousePassed: false,
            },
          },
          view: {
            tier: "free",
            question: "Is this likely to break right now?",
            verdict: "quick-pass",
            confidence: "low",
            summary: "ok",
            grade: "bronze",
            blockers: [],
            warnings: [],
            passes: [],
            nextActions: [],
            failureEvidence: [],
            showDetailedLighthouse: false,
            showDetailedE2E: false,
            showReportExport: false,
          },
        },
      })
    ).toBe(false);
  });

  it("renders a delivery-oriented Pro report with client handoff language", () => {
    const markdown = buildMarkdownReport("C:\\workspace\\contents-factory", {
      grade: "Bronze",
      timestamp: "2026-04-09T12:00:00.000Z",
      build: { success: true, durationMs: 1200, errors: [] },
      e2e: {
        passed: 2,
        failed: 2,
        total: 4,
        results: [
          {
            name: "Primary CTA interaction",
            passed: false,
            error: "Button click did not change the page",
            steps: [{ description: "Click CTA", passed: false, error: "Timed out" }],
          },
        ],
      },
      lighthouse: { performance: 72, accessibility: 96, seo: 100, bestPractices: 96, runs: 3 },
      thresholds: { performance: 70, accessibility: 85, seo: 80, bestPractices: 80 },
      framework: "nextjs",
      _plan: "pro",
      verification: {
        tier: "pro",
        report: {
          tier: "pro",
          verdict: "hold",
          confidence: "medium",
          summary: "Blocking verification issues were found. Hold release until the blockers are fixed.",
          grade: "bronze",
          blockers: [
            {
              category: "e2e",
              severity: "high",
              title: "E2E failures (2/4)",
              description: "One or more verification scenarios failed.",
              action: "Fix the broken user flow and rerun the verification scenarios.",
            },
          ],
          warnings: [],
          passes: [{ key: "build", label: "Production build", passed: true }],
          nextActions: ["Fix the broken user flow and rerun the verification scenarios."],
          failureEvidence: ["E2E: Primary CTA interaction - Timed out"],
          evidence: {
            input: { e2ePassed: 2, e2eTotal: 4 },
            thresholds: { performance: 70, accessibility: 85, seo: 80, bestPractices: 80 },
            buildPassed: true,
            e2ePassedAll: false,
            hasE2EData: true,
            hasLighthouseData: true,
            lighthouseSkipped: false,
            hasMultiViewportData: false,
            multiViewportPassed: false,
            hasVisualDiffData: false,
            visualDiffPassed: false,
            lighthousePassed: true,
          },
        },
        view: {
          tier: "pro",
          question: "Is this strong enough to send to a client?",
          verdict: "hold",
          confidence: "medium",
          summary: "Blocking verification issues were found. Hold release until the blockers are fixed.",
          grade: "bronze",
          blockers: [
            {
              category: "e2e",
              severity: "high",
              title: "E2E failures (2/4)",
              description: "One or more verification scenarios failed.",
              action: "Fix the broken user flow and rerun the verification scenarios.",
            },
          ],
          warnings: [],
          passes: [{ key: "build", label: "Production build", passed: true }],
          nextActions: ["Fix the broken user flow and rerun the verification scenarios."],
          failureEvidence: ["E2E: Primary CTA interaction - Timed out"],
          showDetailedLighthouse: true,
          showDetailedE2E: true,
          showReportExport: true,
        },
      },
    });

    expect(markdown).toContain("# Laxy Verify Delivery Report");
    expect(markdown).toContain("Question: Is this strong enough to send to a client?");
    expect(markdown).toContain("## Client Delivery Call");
    expect(markdown).toContain("Client delivery recommendation: Hold");
    expect(markdown).toContain("## Client-Facing Blockers");
    expect(markdown).toContain("## Fix Before Sending");
    expect(markdown).toContain("## Failed E2E Scenarios");
    expect(markdown).toContain("## Copy For AI");
    expect(markdown).toContain("Use this delivery report to fix the project before sending it to a client.");
    expect(markdown).toContain("Goal: remove client-visible blockers and reach a confident delivery call.");
    expect(markdown).toContain("Fix the broken user flow and rerun the verification scenarios.");
  });

  it("renders a release-oriented Pro+ report with stronger approval language", () => {
    const markdown = buildMarkdownReport("C:\\workspace\\contents-factory", {
      grade: "Gold",
      timestamp: "2026-04-09T12:00:00.000Z",
      build: { success: true, durationMs: 1400, errors: [] },
      e2e: { passed: 5, failed: 0, total: 5, results: [] },
      lighthouse: { performance: 82, accessibility: 96, seo: 100, bestPractices: 96, runs: 3 },
      visualDiff: { verdict: "pass", diffPercentage: 0, hasBaseline: true },
      thresholds: { performance: 70, accessibility: 85, seo: 80, bestPractices: 80 },
      framework: "nextjs",
      _plan: "pro_plus",
      verification: {
        tier: "pro_plus",
        report: {
          tier: "pro_plus",
          verdict: "release-ready",
          confidence: "high",
          summary: "Core verification checks passed. This run supports a release-ready call.",
          grade: "gold",
          blockers: [],
          warnings: [],
          passes: [
            { key: "build", label: "Production build", passed: true },
            { key: "viewport", label: "Viewport 0 issues", passed: true },
            { key: "visual", label: "Visual diff 0%", passed: true },
          ],
          nextActions: [],
          failureEvidence: ["Viewport: all checked viewports passed", "Visual diff: 0% (pass)"],
          evidence: {
            input: {
              viewportIssues: 0,
              multiViewportPassed: true,
              multiViewportSummary: "All checked viewports passed.",
              visualDiffVerdict: "pass",
              visualDiffPercentage: 0,
            },
            thresholds: { performance: 70, accessibility: 85, seo: 80, bestPractices: 80 },
            buildPassed: true,
            e2ePassedAll: true,
            hasE2EData: true,
            hasLighthouseData: true,
            lighthouseSkipped: false,
            hasMultiViewportData: true,
            multiViewportPassed: true,
            hasVisualDiffData: true,
            visualDiffPassed: true,
            lighthousePassed: true,
          },
        },
        view: {
          tier: "pro_plus",
          question: "Can I call this release-ready with confidence?",
          verdict: "release-ready",
          confidence: "high",
          summary: "Core verification checks passed. This run supports a release-ready call.",
          grade: "gold",
          blockers: [],
          warnings: [],
          passes: [
            { key: "build", label: "Production build", passed: true },
            { key: "viewport", label: "Viewport 0 issues", passed: true },
            { key: "visual", label: "Visual diff 0%", passed: true },
          ],
          nextActions: [],
          failureEvidence: ["Viewport: all checked viewports passed", "Visual diff: 0% (pass)"],
          showDetailedLighthouse: true,
          showDetailedE2E: true,
          showReportExport: true,
        },
      },
    });

    expect(markdown).toContain("# Laxy Verify Release Report");
    expect(markdown).toContain("Plan: Pro+");
    expect(markdown).toContain("Short answer: Yes. This run collected enough evidence to support a release-ready call.");
    expect(markdown).toContain("## Release Call");
    expect(markdown).toContain("Release recommendation: Release Ready");
    expect(markdown).toContain("## Release Evidence");
    expect(markdown).toContain("## Evidence Pack");
    expect(markdown).toContain("| Multi-viewport | Passed");
    expect(markdown).toContain("| Visual diff | 0% (pass) |");
    expect(markdown).toContain("Use this release report to decide whether the project is truly ready to ship.");
    expect(markdown).toContain("Goal: reach a release-ready verdict with strong viewport, visual, and user-flow evidence.");
    expect(markdown).toContain("Use this as release evidence, or rerun after any code change that could affect quality.");
  });
});
