export type VerificationGrade = "gold" | "silver" | "bronze" | "unverified";

const GRADE_ORDER: VerificationGrade[] = ["gold", "silver", "bronze", "unverified"];

export interface LighthouseScores {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
}

export function getLighthousePass(
  scores: LighthouseScores,
  thresholds: {
    performance: number;
    accessibility: number;
    seo: number;
    bestPractices: number;
  }
): boolean {
  return (
    scores.performance >= thresholds.performance &&
    scores.accessibility >= thresholds.accessibility &&
    scores.seo >= thresholds.seo &&
    scores.bestPractices >= thresholds.bestPractices
  );
}

export function isWorseOrEqual(
  actual: VerificationGrade,
  threshold: VerificationGrade
): boolean {
  // Returns true if actual is worse than threshold
  // Grade order (best to worst): gold, silver, bronze, unverified
  return GRADE_ORDER.indexOf(actual) > GRADE_ORDER.indexOf(threshold);
}

interface GradeResult {
  grade: VerificationGrade;
  exitCode: number;
}

export function calculateGrade(options: {
  buildSuccess: boolean;
  scores?: LighthouseScores;
  thresholds: {
    performance: number;
    accessibility: number;
    seo: number;
    bestPractices: number;
  };
  failOn: VerificationGrade;
}): GradeResult {
  const { buildSuccess, scores, thresholds, failOn } = options;

  let grade: VerificationGrade;

  if (!buildSuccess) {
    grade = "unverified";
  } else if (scores && getLighthousePass(scores, thresholds)) {
    grade = "silver";
  } else if (buildSuccess) {
    grade = "bronze";
  } else {
    grade = "unverified";
  }

  // Determine exit code
  // fail_on: unverified means "never fail" (informational only)
  // any other fail_on: exit 1 if grade is worse than fail_on
  const exitCode = failOn === "unverified"
    ? 0
    : isWorseOrEqual(grade, failOn)
      ? 1
      : 0;

  return { grade, exitCode };
}

export function gradeToColor(grade: VerificationGrade): { text: string; bg: string; border: string; hex: string } {
  switch (grade) {
    case "gold":
      return { text: "text-yellow-400", bg: "bg-yellow-400/10", border: "border-yellow-400/30", hex: "#FACC15" };
    case "silver":
      return { text: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/30", hex: "#34D399" };
    case "bronze":
      return { text: "text-blue-400", bg: "bg-blue-400/10", border: "border-blue-400/30", hex: "#60A5FA" };
    default:
      return { text: "text-gray-400", bg: "bg-gray-500/5", border: "border-gray-500/30", hex: "#9CA3AF" };
  }
}

export function gradeToLabel(grade: VerificationGrade): string {
  return {
    gold: "Gold",
    silver: "Silver",
    bronze: "Bronze",
    unverified: "Unverified",
  }[grade];
}
