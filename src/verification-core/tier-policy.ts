import type { TierVerificationView, VerificationReport, VerificationTier } from "./types.js";

export interface TierPolicy {
  tier: VerificationTier;
  showDetailedLighthouse: boolean;
  showDetailedE2E: boolean;
  showReportExport: boolean;
  maxBlockers: number;
  maxWarnings: number;
}

const TIER_POLICIES: Record<VerificationTier, TierPolicy> = {
  free: {
    tier: "free",
    showDetailedLighthouse: false,
    showDetailedE2E: false,
    showReportExport: false,
    maxBlockers: 1,
    maxWarnings: 2,
  },
  pro: {
    tier: "pro",
    showDetailedLighthouse: true,
    showDetailedE2E: true,
    showReportExport: true,
    maxBlockers: 5,
    maxWarnings: 5,
  },
  pro_plus: {
    tier: "pro_plus",
    showDetailedLighthouse: true,
    showDetailedE2E: true,
    showReportExport: true,
    maxBlockers: 8,
    maxWarnings: 8,
  },
};

export function getTierPolicy(tier: VerificationTier = "free"): TierPolicy {
  return TIER_POLICIES[tier];
}

export function planToVerificationTier(plan?: string | null): VerificationTier {
  if (plan === "pro") return "pro";
  if (plan === "pro_plus" || plan === "team" || plan === "enterprise") return "pro_plus";
  return "free";
}

export function getVerificationTierQuestion(tier: VerificationTier): string {
  switch (tier) {
    case "pro":
      return "Is this strong enough to send to a client?";
    case "pro_plus":
      return "Can I call this release-ready with confidence?";
    default:
      return "Is this likely to break right now?";
  }
}

export function getTierVerificationView(report: VerificationReport): TierVerificationView {
  const policy = getTierPolicy(report.tier);

  return {
    tier: report.tier,
    question: getVerificationTierQuestion(report.tier),
    verdict: report.verdict,
    confidence: report.confidence,
    summary: report.summary,
    grade: report.grade,
    blockers: report.blockers.slice(0, policy.maxBlockers),
    warnings: report.warnings.slice(0, policy.maxWarnings),
    passes: report.passes,
    nextActions: report.nextActions.slice(0, Math.max(2, policy.maxWarnings)),
    failureEvidence: report.failureEvidence.slice(0, Math.max(2, policy.maxWarnings)),
    showDetailedLighthouse: policy.showDetailedLighthouse,
    showDetailedE2E: policy.showDetailedE2E,
    showReportExport: policy.showReportExport,
  };
}
