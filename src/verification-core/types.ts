export type VerificationGrade = "gold" | "silver" | "bronze" | "unverified";

export type VerificationTier = "free" | "pro" | "pro_plus";

export type ReleaseVerdict =
  | "quick-pass"
  | "client-ready"
  | "investigate"
  | "hold"
  | "release-ready"
  | "build-failed";

export interface LighthouseThresholds {
  performance: number;
  accessibility: number;
  seo: number;
  bestPractices: number;
}

export interface LighthouseScores {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
}

export interface VerificationInput {
  buildSuccess?: boolean;
  buildErrors?: string[];
  e2ePassed?: number;
  e2eTotal?: number;
  e2eCoverageGaps?: string[];
  e2eStabilityPassed?: boolean;
  e2eConsoleErrorCount?: number;
  lighthouseSkipped?: boolean;
  lighthouseErrorCount?: number;
  viewportIssues?: number;
  multiViewportPassed?: boolean;
  multiViewportSummary?: string;
  visualDiffVerdict?: "pass" | "warn" | "rollback";
  visualDiffPercentage?: number;
  hasVisualBaseline?: boolean;
  failureEvidence?: string[];
  lighthouseScores?: LighthouseScores;
  mobileLighthouseScores?: LighthouseScores;
  securityAudit?: {
    totalVulnerabilities: number;
    critical: number;
    high: number;
    summary: string;
  };
}

export interface VerificationCheck {
  key: "build" | "e2e" | "lighthouse" | "viewport" | "visual" | "security" | "mobile-lh" | "console-errors";
  label: string;
  passed: boolean;
}

export interface VerificationFinding {
  category: "build" | "performance" | "accessibility" | "seo" | "bestPractices" | "e2e" | "viewport" | "visual" | "security" | "runtime";
  severity: "critical" | "high" | "medium";
  title: string;
  description: string;
  action: string;
}

export interface VerificationEvidence {
  input: VerificationInput;
  thresholds: LighthouseThresholds;
  buildPassed: boolean;
  e2ePassedAll: boolean;
  e2eStabilityPassed: boolean;
  hasE2EData: boolean;
  hasLighthouseData: boolean;
  lighthouseSkipped: boolean;
  hasMultiViewportData: boolean;
  multiViewportPassed: boolean;
  hasVisualDiffData: boolean;
  hasComparableVisualDiffData: boolean;
  visualDiffPassed: boolean;
  lighthousePassed: boolean;
  hasConsoleErrors: boolean;
  hasSecurityData: boolean;
  securityPassed: boolean;
  hasMobileLighthouseData: boolean;
  mobileLighthousePassed: boolean;
}

export interface VerificationReport {
  tier: VerificationTier;
  verdict: ReleaseVerdict;
  confidence: "low" | "medium" | "high";
  summary: string;
  grade: VerificationGrade;
  blockers: VerificationFinding[];
  warnings: VerificationFinding[];
  passes: VerificationCheck[];
  nextActions: string[];
  failureEvidence: string[];
  evidence: VerificationEvidence;
}

export interface TierVerificationView {
  tier: VerificationTier;
  question: string;
  verdict: ReleaseVerdict;
  confidence: "low" | "medium" | "high";
  summary: string;
  grade: VerificationGrade;
  blockers: VerificationFinding[];
  warnings: VerificationFinding[];
  passes: VerificationCheck[];
  nextActions: string[];
  failureEvidence: string[];
  showDetailedLighthouse: boolean;
  showDetailedE2E: boolean;
  showReportExport: boolean;
}
