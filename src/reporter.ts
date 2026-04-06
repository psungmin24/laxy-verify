import type { VerificationGrade, LighthouseScores } from "./verification.js";
import type { BuildCheckResult } from "./build-runner.js";
import type { LaxyConfig } from "./config.js";
import { getImprovementRecommendations } from "./verification.js";

export interface VerifyReport {
  grade: VerificationGrade;
  build: {
    success: boolean;
    errors: string[];
    duration: number;
  };
  lighthouse: {
    scores: LighthouseScores | null;
    error?: string;
  };
  thresholds: LaxyConfig["thresholds"];
  recommendations: ReturnType<typeof getImprovementRecommendations>;
}

const GRADE_LABELS: Record<VerificationGrade, { emoji: string; label: string }> = {
  gold: { emoji: "\u{1F3C6}", label: "Gold" },
  silver: { emoji: "\u2705", label: "Silver" },
  bronze: { emoji: "\u{1F528}", label: "Bronze" },
  unverified: { emoji: "\u26A0\uFE0F", label: "Unverified" },
};

export function formatConsole(report: VerifyReport): string {
  const g = GRADE_LABELS[report.grade];
  const lines: string[] = [];

  lines.push("");
  lines.push(`  Laxy Verify — ${g.emoji} ${g.label}`);
  lines.push("  " + "=".repeat(40));
  lines.push("");

  // Build
  lines.push(`  Build:          ${report.build.success ? "PASS" : "FAIL"} (${report.build.duration}ms)`);

  // Lighthouse
  if (report.lighthouse.scores) {
    const s = report.lighthouse.scores;
    const t = report.thresholds;
    const check = (score: number, threshold: number) => score >= threshold ? "PASS" : "FAIL";
    lines.push(`  Performance:    ${s.performance} (threshold ${t.performance}) ${check(s.performance, t.performance)}`);
    lines.push(`  Accessibility:  ${s.accessibility} (threshold ${t.accessibility}) ${check(s.accessibility, t.accessibility)}`);
    lines.push(`  SEO:            ${s.seo} (threshold ${t.seo}) ${check(s.seo, t.seo)}`);
    lines.push(`  Best Practices: ${s.bestPractices} (threshold ${t.bestPractices}) ${check(s.bestPractices, t.bestPractices)}`);
  } else if (report.lighthouse.error) {
    lines.push(`  Lighthouse:     SKIPPED — ${report.lighthouse.error}`);
  }

  lines.push("");

  // Errors
  if (report.build.errors.length > 0) {
    lines.push("  Errors:");
    for (const err of report.build.errors.slice(0, 5)) {
      lines.push(`    - ${err}`);
    }
    lines.push("");
  }

  // Recommendations
  if (report.recommendations.length > 0) {
    lines.push("  Recommendations:");
    for (const rec of report.recommendations.slice(0, 3)) {
      lines.push(`    [${rec.priority}] ${rec.title}`);
      lines.push(`      ${rec.action}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function formatJson(report: VerifyReport): string {
  return JSON.stringify(report, null, 2);
}

export function formatMarkdown(report: VerifyReport): string {
  const g = GRADE_LABELS[report.grade];
  const lines: string[] = [];

  lines.push(`<!-- laxy-verify -->`);
  lines.push(`## Laxy Verify — ${g.label} ${g.emoji}`);
  lines.push("");
  lines.push("| Category | Score | Threshold | Status |");
  lines.push("|----------|-------|-----------|--------|");

  lines.push(`| Build | ${report.build.success ? "PASS" : "FAIL"} | — | ${report.build.success ? "\u2705" : "\u274C"} |`);

  if (report.lighthouse.scores) {
    const s = report.lighthouse.scores;
    const t = report.thresholds;
    const row = (label: string, score: number, threshold: number) => {
      const pass = score >= threshold;
      return `| ${label} | ${score} | ${threshold} | ${pass ? "\u2705" : "\u274C"} |`;
    };
    lines.push(row("Performance", s.performance, t.performance));
    lines.push(row("Accessibility", s.accessibility, t.accessibility));
    lines.push(row("SEO", s.seo, t.seo));
    lines.push(row("Best Practices", s.bestPractices, t.bestPractices));
  } else if (report.lighthouse.error) {
    lines.push(`| Lighthouse | SKIPPED | — | \u26A0\uFE0F |`);
  }

  lines.push("");

  if (report.recommendations.length > 0) {
    lines.push("<details><summary>Recommendations</summary>");
    lines.push("");
    for (const rec of report.recommendations) {
      lines.push(`- **[${rec.priority}] ${rec.title}**: ${rec.action}`);
    }
    lines.push("");
    lines.push("</details>");
    lines.push("");
  }

  if (report.grade !== "gold") {
    lines.push("> Want Gold? Add E2E tests with [Laxy](https://github.com/psungmin24/Laxy)");
    lines.push("");
  }

  return lines.join("\n");
}

export function formatReport(report: VerifyReport, format: "console" | "json" | "md"): string {
  switch (format) {
    case "json": return formatJson(report);
    case "md": return formatMarkdown(report);
    default: return formatConsole(report);
  }
}
