import { getTierVerificationView } from "./tier-policy.js";
import type {
  LighthouseThresholds,
  TierVerificationView,
  VerificationCheck,
  VerificationEvidence,
  VerificationFinding,
  VerificationGrade,
  VerificationInput,
  VerificationReport,
  VerificationTier,
} from "./types.js";

export const DEFAULT_LH_THRESHOLDS: LighthouseThresholds = {
  performance: 70,
  accessibility: 85,
  seo: 80,
  bestPractices: 80,
};

export function getLighthousePass(
  lighthouseScores?: VerificationInput["lighthouseScores"],
  thresholds: LighthouseThresholds = DEFAULT_LH_THRESHOLDS
): boolean {
  if (!lighthouseScores) return false;

  return (
    lighthouseScores.performance >= thresholds.performance &&
    lighthouseScores.accessibility >= thresholds.accessibility &&
    lighthouseScores.seo >= thresholds.seo &&
    lighthouseScores.bestPractices >= thresholds.bestPractices
  );
}

export function getVerificationGrade(
  input: VerificationInput,
  thresholds: LighthouseThresholds = DEFAULT_LH_THRESHOLDS
): VerificationGrade {
  const buildPassed = input.buildSuccess === true;
  const e2ePassedAll =
    typeof input.e2ePassed === "number" &&
    typeof input.e2eTotal === "number" &&
    input.e2eTotal > 0 &&
    input.e2ePassed === input.e2eTotal;
  const lighthousePassed = getLighthousePass(input.lighthouseScores, thresholds);

  if (buildPassed && e2ePassedAll && lighthousePassed) return "gold";
  if (buildPassed && e2ePassedAll) return "silver";
  if (buildPassed) return "bronze";
  return "unverified";
}

export function buildVerificationEvidence(
  input: VerificationInput,
  thresholds: LighthouseThresholds = DEFAULT_LH_THRESHOLDS
): VerificationEvidence {
  const buildPassed = input.buildSuccess === true;
  const hasE2EData = typeof input.e2eTotal === "number" && input.e2eTotal > 0;
  const hasLighthouseData = !!input.lighthouseScores;
  const lighthouseSkipped = input.lighthouseSkipped === true;
  const e2ePassedAll =
    hasE2EData &&
    typeof input.e2ePassed === "number" &&
    typeof input.e2eTotal === "number" &&
    input.e2ePassed === input.e2eTotal;
  const hasMultiViewportData =
    typeof input.viewportIssues === "number" || typeof input.multiViewportPassed === "boolean";
  const multiViewportPassed = hasMultiViewportData
    ? input.multiViewportPassed === true ||
      (input.multiViewportPassed !== false && (input.viewportIssues ?? 0) <= 0)
    : false;
  const hasVisualDiffData = typeof input.visualDiffVerdict === "string";
  const visualDiffPassed =
    hasVisualDiffData &&
    input.visualDiffVerdict !== "warn" &&
    input.visualDiffVerdict !== "rollback";
  const lighthousePassed = getLighthousePass(input.lighthouseScores, thresholds);

  return {
    input,
    thresholds,
    buildPassed,
    hasE2EData,
    e2ePassedAll,
    hasLighthouseData,
    lighthouseSkipped,
    hasMultiViewportData,
    multiViewportPassed,
    hasVisualDiffData,
    visualDiffPassed,
    lighthousePassed,
  };
}

export function getImprovementRecommendations(
  input: VerificationInput,
  thresholds: LighthouseThresholds = DEFAULT_LH_THRESHOLDS
): VerificationFinding[] {
  const findings: VerificationFinding[] = [];
  const errors = input.buildErrors ?? [];

  if (input.buildSuccess === false) {
    if (errors.some((error) => /TS\d+|type/i.test(error))) {
      findings.push({
        category: "build",
        severity: "critical",
        title: "TypeScript build errors",
        description: "Type errors are blocking a clean production build.",
        action: "Fix the TypeScript errors first, then rerun verification.",
      });
    }

    if (errors.some((error) => /Module not found|Cannot find module|Failed to resolve/i.test(error))) {
      findings.push({
        category: "build",
        severity: "critical",
        title: "Missing or unresolved modules",
        description: "The build cannot resolve one or more imports or packages.",
        action: "Check import paths, package installation, and package.json consistency.",
      });
    }

    if (errors.some((error) => /SyntaxError|Unexpected token/i.test(error))) {
      findings.push({
        category: "build",
        severity: "critical",
        title: "Syntax errors in source code",
        description: "The code contains syntax issues that stop the build from completing.",
        action: "Fix the syntax errors, then rerun the build verification.",
      });
    }

    if (findings.every((finding) => finding.category !== "build")) {
      findings.push({
        category: "build",
        severity: "critical",
        title: "Build failed",
        description: "Production build verification did not pass.",
        action: "Inspect the build logs and resolve the blocking errors before release.",
      });
    }
  }

  if (
    typeof input.e2ePassed === "number" &&
    typeof input.e2eTotal === "number" &&
    input.e2eTotal > 0 &&
    input.e2ePassed < input.e2eTotal
  ) {
    findings.push({
      category: "e2e",
      severity: "high",
      title: `E2E failures (${input.e2ePassed}/${input.e2eTotal})`,
      description: "One or more verification scenarios failed.",
      action: "Fix the broken user flow and rerun the verification scenarios.",
    });
  }

  const hasMultiViewportData =
    typeof input.viewportIssues === "number" || typeof input.multiViewportPassed === "boolean";
  const multiViewportPassed =
    input.multiViewportPassed === true ||
    (input.multiViewportPassed !== false && (input.viewportIssues ?? 0) <= 0);

  if (hasMultiViewportData && !multiViewportPassed) {
    findings.push({
      category: "viewport",
      severity: "high",
      title: `Multi-viewport issues detected (${input.viewportIssues ?? 0})`,
      description:
        input.multiViewportSummary ||
        "One or more responsive layout or viewport-specific verification issues were found.",
      action: "Fix the responsive layout issues and rerun the multi-viewport verification pass.",
    });
  }

  if (input.visualDiffVerdict === "rollback") {
    findings.push({
      category: "visual",
      severity: "high",
      title: `Visual regression detected (${input.visualDiffPercentage ?? 0}%)`,
      description: "The visual diff is large enough to recommend a rollback or release hold.",
      action: "Review the visual diff artifacts and fix the unintended UI regression before release.",
    });
  } else if (input.visualDiffVerdict === "warn") {
    findings.push({
      category: "visual",
      severity: "medium",
      title: `Visual change needs review (${input.visualDiffPercentage ?? 0}%)`,
      description: "The visual diff changed enough to require a manual review before release.",
      action: "Check the visual diff and confirm the UI change is intentional.",
    });
  }

  const lighthouseScores = input.lighthouseScores;
  if (!lighthouseScores) {
    return findings;
  }

  const lighthouseFinding = (
    category: VerificationFinding["category"],
    actual: number,
    required: number,
    title: string,
    description: string,
    action: string
  ): VerificationFinding => ({
    category,
    severity: required - actual >= 20 ? "high" : "medium",
    title: `${title} (${actual} / ${required})`,
    description,
    action,
  });

  if (lighthouseScores.performance < thresholds.performance) {
    findings.push(
      lighthouseFinding(
        "performance",
        lighthouseScores.performance,
        thresholds.performance,
        "Performance below threshold",
        "Runtime performance is below the minimum verification threshold.",
        "Reduce heavy assets, expensive scripts, and blocking work on initial load."
      )
    );
  }

  if (lighthouseScores.accessibility < thresholds.accessibility) {
    findings.push(
      lighthouseFinding(
        "accessibility",
        lighthouseScores.accessibility,
        thresholds.accessibility,
        "Accessibility below threshold",
        "Accessibility checks are below the minimum verification threshold.",
        "Fix labels, semantics, contrast, and keyboard accessibility issues."
      )
    );
  }

  if (lighthouseScores.seo < thresholds.seo) {
    findings.push(
      lighthouseFinding(
        "seo",
        lighthouseScores.seo,
        thresholds.seo,
        "SEO below threshold",
        "SEO checks are below the minimum verification threshold.",
        "Fix title, description, crawl settings, and indexable metadata."
      )
    );
  }

  if (lighthouseScores.bestPractices < thresholds.bestPractices) {
    findings.push(
      lighthouseFinding(
        "bestPractices",
        lighthouseScores.bestPractices,
        thresholds.bestPractices,
        "Best practices below threshold",
        "Best practices checks are below the minimum verification threshold.",
        "Fix browser warnings, unsafe patterns, and platform-level issues."
      )
    );
  }

  return findings.sort((a, b) => {
    const priority = { critical: 0, high: 1, medium: 2 };
    return priority[a.severity] - priority[b.severity];
  });
}

export function buildVerificationReport(
  input: VerificationInput,
  options?: {
    tier?: VerificationTier;
    thresholds?: LighthouseThresholds;
  }
): VerificationReport {
  const thresholds = options?.thresholds ?? DEFAULT_LH_THRESHOLDS;
  const tier = options?.tier ?? "free";
  const evidence = buildVerificationEvidence(input, thresholds);
  const findings = getImprovementRecommendations(input, thresholds);
  const blockers = findings.filter((finding) => finding.severity === "critical" || finding.severity === "high");
  const warnings = findings.filter((finding) => finding.severity === "medium");
  const grade = getVerificationGrade(input, thresholds);
  const failureEvidence = (input.failureEvidence ?? []).filter(Boolean).slice(0, 5);

  let verdict: VerificationReport["verdict"];
  let confidence: VerificationReport["confidence"];
  let summary: string;

  if (!evidence.buildPassed) {
    verdict = "build-failed";
    confidence = "low";
    summary = "Build failed. Fix the blocking build errors before relying on this verification result.";
  } else if (blockers.length > 0) {
    verdict = "hold";
    confidence = tier === "free" ? "low" : "medium";
    summary = "Blocking verification issues were found. Hold release until the blockers are fixed.";
  } else if (
    tier === "pro_plus" &&
    evidence.buildPassed &&
    evidence.e2ePassedAll &&
    evidence.lighthousePassed &&
    evidence.hasMultiViewportData &&
    evidence.multiViewportPassed
  ) {
    verdict = "release-ready";
    confidence = "high";
    summary = "Core verification checks passed. This run supports a release-ready call.";
  } else if (
    tier === "pro_plus" &&
    evidence.buildPassed &&
    evidence.e2ePassedAll &&
    evidence.lighthousePassed &&
    !evidence.hasMultiViewportData
  ) {
    verdict = "investigate";
    confidence = "medium";
    summary = "Core checks passed, but release-ready confidence still needs multi-viewport verification evidence.";
  } else if (tier === "free") {
    verdict = "quick-pass";
    confidence = evidence.hasLighthouseData && evidence.lighthousePassed ? "medium" : "low";
    summary = "No immediate hard blockers were found in the quick verification pass.";
  } else {
    verdict = "investigate";
    confidence = "medium";
    summary = evidence.lighthouseSkipped
      ? "The build is standing. Lighthouse was skipped, so review the remaining verification evidence before release."
      : "The build is standing, but deeper verification evidence should be reviewed before release.";
  }

  const passes: VerificationCheck[] = [
    { key: "build", label: "Production build", passed: evidence.buildPassed },
    ...(evidence.hasE2EData
      ? [{ key: "e2e" as const, label: `E2E ${input.e2ePassed ?? 0}/${input.e2eTotal ?? 0}`, passed: evidence.e2ePassedAll }]
      : []),
    ...(evidence.hasMultiViewportData
      ? [{
          key: "viewport" as const,
          label: `Viewport ${input.viewportIssues ?? 0} issues`,
          passed: evidence.multiViewportPassed,
        }]
      : []),
    ...(evidence.hasVisualDiffData
      ? [{
          key: "visual" as const,
          label: input.hasVisualBaseline
            ? `Visual diff ${input.visualDiffPercentage ?? 0}%`
            : "Visual baseline seeded",
          passed: input.visualDiffVerdict !== "rollback",
        }]
      : []),
    ...(evidence.hasLighthouseData
      ? [{ key: "lighthouse" as const, label: "Lighthouse thresholds", passed: evidence.lighthousePassed }]
      : []),
  ];

  const nextActions = [...blockers, ...warnings].slice(0, 4).map((finding) => finding.action);

  return {
    tier,
    verdict,
    confidence,
    summary,
    grade,
    blockers,
    warnings,
    passes,
    nextActions,
    failureEvidence,
    evidence,
  };
}

export function buildTierVerificationView(
  input: VerificationInput,
  options?: {
    tier?: VerificationTier;
    thresholds?: LighthouseThresholds;
  }
): TierVerificationView {
  return getTierVerificationView(buildVerificationReport(input, options));
}
