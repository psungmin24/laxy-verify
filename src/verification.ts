export type VerificationGrade = "gold" | "silver" | "bronze" | "unverified";

export interface LighthouseScores {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
}

export interface VerificationInput {
  buildSuccess?: boolean;
  e2ePassed?: number;
  e2eTotal?: number;
  lighthouseScores?: LighthouseScores;
}

export const LH_THRESHOLDS = {
  performance: 70,
  accessibility: 85,
  seo: 80,
  bestPractices: 80,
};

export const LH_CI_THRESHOLDS = {
  performance: 60, // CI mode: 10 points relaxed
  accessibility: 85,
  seo: 80,
  bestPractices: 80,
};

export function getLighthousePass(
  lh: LighthouseScores | undefined,
  thresholds = LH_THRESHOLDS
): boolean {
  if (!lh) return false;
  return (
    lh.performance >= thresholds.performance &&
    lh.accessibility >= thresholds.accessibility &&
    lh.seo >= thresholds.seo &&
    lh.bestPractices >= thresholds.bestPractices
  );
}

export function getVerificationGrade(input: VerificationInput): VerificationGrade {
  const buildOk = input.buildSuccess === true;
  const e2eOk =
    typeof input.e2ePassed === "number" &&
    typeof input.e2eTotal === "number" &&
    input.e2eTotal > 0 &&
    input.e2ePassed === input.e2eTotal;
  const lhOk = getLighthousePass(input.lighthouseScores);

  if (buildOk && e2eOk && lhOk) return "gold";
  if (buildOk && e2eOk) return "silver";
  if (buildOk && lhOk) return "silver"; // CLI path: no E2E, build+LH = Silver
  if (buildOk) return "bronze";
  return "unverified";
}

export interface ImprovementRule {
  category: "build" | "performance" | "accessibility" | "seo" | "bestPractices" | "e2e";
  priority: "critical" | "high" | "medium";
  title: string;
  description: string;
  action: string;
}

export function getImprovementRecommendations(
  input: VerificationInput & { buildErrors?: string[] }
): ImprovementRule[] {
  const rules: ImprovementRule[] = [];

  if (input.buildSuccess === false) {
    const errors = input.buildErrors ?? [];

    if (errors.some((e) => /TS\d+|type/i.test(e))) {
      rules.push({
        category: "build",
        priority: "critical",
        title: "TypeScript type error",
        description: "TypeScript compilation errors are blocking the production build.",
        action: "Check the file:line location in error messages and fix type mismatches.",
      });
    }

    if (errors.some((e) => /Module not found|Cannot find module|Failed to resolve/i.test(e))) {
      rules.push({
        category: "build",
        priority: "critical",
        title: "Module resolution failure",
        description: "An imported module or file cannot be found.",
        action: "Check import paths and ensure required packages are in package.json.",
      });
    }

    if (errors.some((e) => /SyntaxError|Unexpected token/i.test(e))) {
      rules.push({
        category: "build",
        priority: "critical",
        title: "Syntax error",
        description: "JavaScript or TypeScript parsing error detected.",
        action: "Check brackets, commas, string terminators, and JSX syntax.",
      });
    }

    if (rules.filter((r) => r.category === "build").length === 0) {
      rules.push({
        category: "build",
        priority: "critical",
        title: "Build failed",
        description: "The production build failed.",
        action: "Check the first real error in build output and fix it.",
      });
    }
  }

  const lh = input.lighthouseScores;
  if (lh) {
    const checks: Array<{ key: keyof typeof LH_THRESHOLDS; category: ImprovementRule["category"]; label: string; tip: string }> = [
      { key: "performance", category: "performance", label: "Performance", tip: "Optimize images, remove unused JS, apply code splitting." },
      { key: "accessibility", category: "accessibility", label: "Accessibility", tip: "Add alt text, aria-labels, ensure sufficient color contrast." },
      { key: "seo", category: "seo", label: "SEO", tip: "Add title, meta description, robots.txt, sitemap.xml." },
      { key: "bestPractices", category: "bestPractices", label: "Best Practices", tip: "Fix console errors, update libraries, check resource references." },
    ];

    for (const c of checks) {
      const score = lh[c.key];
      const threshold = LH_THRESHOLDS[c.key];
      if (score < threshold) {
        const gap = threshold - score;
        rules.push({
          category: c.category,
          priority: gap >= 20 ? "high" : "medium",
          title: `${c.label} below threshold (${score} / target ${threshold})`,
          description: `${c.label} score does not meet the required threshold.`,
          action: c.tip,
        });
      }
    }
  }

  const priorityOrder = { critical: 0, high: 1, medium: 2 };
  return rules.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}
