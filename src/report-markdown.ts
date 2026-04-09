import * as path from "node:path";
import type { E2EScenarioResult } from "./e2e.js";
import type { LighthouseScores } from "./grade.js";
import type { TierVerificationView, VerificationReport } from "./verification-core/index.js";
import type { VisualDiffResult } from "./visual-diff.js";

export interface MarkdownReportResult {
  grade: string;
  timestamp: string;
  build: { success: boolean; durationMs: number; errors: string[] };
  e2e?: { passed: number; failed: number; total: number; results: E2EScenarioResult[] };
  lighthouse: (LighthouseScores & { runs: number }) | null;
  visualDiff?: VisualDiffResult | null;
  thresholds: { performance: number; accessibility: number; seo: number; bestPractices: number };
  framework: string | null;
  _plan?: string;
  verification?: {
    tier: VerificationReport["tier"];
    report: VerificationReport;
    view: TierVerificationView;
  };
}

function titleCasePlan(plan?: string): string {
  switch (plan) {
    case "pro":
      return "Pro";
    case "pro_plus":
      return "Pro+";
    case "team":
      return "Team";
    case "enterprise":
      return "Enterprise";
    default:
      return "Free";
  }
}

function titleCaseVerdict(verdict: string): string {
  return verdict
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().replace("T", " ").replace(".000Z", " UTC");
}

function sentenceForVerdict(view: TierVerificationView): string {
  switch (view.verdict) {
    case "release-ready":
      return "Yes. This run collected enough evidence to support a release-ready call.";
    case "hold":
      return "No. This run found blockers that should be fixed before release.";
    case "investigate":
      return "Not yet. The project is standing, but there is not enough confidence to call it release-ready.";
    case "build-failed":
      return "No. The production build failed, so the release should be held immediately.";
    default:
      return "This run did not find an immediate hard blocker, but it is still a shallow verification pass.";
  }
}

function defaultNextActions(result: MarkdownReportResult): string[] {
  const view = result.verification?.view;
  if (!view) return ["Rerun verification after the project changes are applied."];
  if (view.nextActions.length > 0) return view.nextActions;

  switch (view.verdict) {
    case "release-ready":
      return ["Ship this version, or archive this report as release evidence."];
    case "investigate":
      return ["Collect the missing verification evidence, then rerun the command before release."];
    case "build-failed":
      return ["Fix the production build first, then rerun the verification command."];
    case "quick-pass":
      return ["Run a deeper Pro verification before sending this to a client."];
    default:
      return ["Rerun verification after the blockers are fixed."];
  }
}

function renderChecklist(title: string, items: string[]): string {
  if (items.length === 0) {
    return `## ${title}\n\n- None.\n`;
  }

  return `## ${title}\n\n${items.map((item) => `- ${item}`).join("\n")}\n`;
}

function renderBuildErrors(errors: string[]): string {
  if (errors.length === 0) return "";

  const trimmed = errors.slice(0, 5).map((error) => error.trim()).filter(Boolean);
  if (trimmed.length === 0) return "";

  return [
    "## Build Errors",
    "",
    "```text",
    ...trimmed,
    "```",
    "",
  ].join("\n");
}

function renderE2EFailures(result: MarkdownReportResult): string {
  const failedScenarios =
    result.e2e?.results.filter((scenario) => !scenario.passed).slice(0, 5) ?? [];

  if (failedScenarios.length === 0) {
    return "";
  }

  const lines: string[] = ["## Failed E2E Scenarios", ""];

  for (const scenario of failedScenarios) {
    lines.push(`### ${scenario.name}`);
    if (scenario.error) {
      lines.push("", `- Error: ${scenario.error}`);
    }

    const failedSteps = scenario.steps.filter((step) => !step.passed).slice(0, 3);
    if (failedSteps.length > 0) {
      lines.push("", "- Failing steps:");
      for (const step of failedSteps) {
        const detail = step.error ? ` - ${step.error}` : "";
        lines.push(`  - ${step.description}${detail}`);
      }
    }

    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function renderMetrics(result: MarkdownReportResult): string {
  const lines: string[] = ["## Verification Evidence", ""];

  lines.push("| Check | Result |");
  lines.push("|---|---|");
  lines.push(`| Build | ${result.build.success ? "Passed" : "Failed"} in ${result.build.durationMs}ms |`);

  if (result.lighthouse) {
    lines.push(
      `| Lighthouse | P ${result.lighthouse.performance}, A ${result.lighthouse.accessibility}, SEO ${result.lighthouse.seo}, BP ${result.lighthouse.bestPractices} over ${result.lighthouse.runs} run(s) |`
    );
  } else {
    lines.push("| Lighthouse | Skipped |");
  }

  if (result.e2e) {
    lines.push(`| E2E | ${result.e2e.passed}/${result.e2e.total} passed |`);
  }

  const reportInput = result.verification?.report.evidence.input;
  if (typeof reportInput?.viewportIssues === "number" || typeof reportInput?.multiViewportPassed === "boolean") {
    lines.push(
      `| Multi-viewport | ${reportInput.multiViewportPassed ? "Passed" : "Needs work"}${
        reportInput.multiViewportSummary ? `, ${reportInput.multiViewportSummary}` : ""
      } |`
    );
  }

  if (result.visualDiff) {
    lines.push(
      `| Visual diff | ${result.visualDiff.hasBaseline ? `${result.visualDiff.diffPercentage}% (${result.visualDiff.verdict})` : "Baseline seeded"} |`
    );
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function renderCopyForAI(result: MarkdownReportResult): string {
  const view = result.verification?.view;
  if (!view) return "";

  const blockers = view.blockers.map((blocker) => `- ${blocker.title}: ${blocker.action}`);
  const warnings = view.warnings.map((warning) => `- ${warning.title}: ${warning.action}`);
  const evidence = view.failureEvidence.map((item) => `- ${item}`);

  const closingLine =
    view.verdict === "release-ready"
      ? "Use this as release evidence, or rerun after any code change that could affect quality."
      : view.verdict === "investigate" && view.blockers.length === 0
        ? "Collect the missing verification evidence, then rerun the command and compare the new report."
        : "Please fix the blockers first, then rerun the verification command and compare the new report.";

  return [
    "## Copy For AI",
    "",
    "```text",
    "Use this verification report to fix the project.",
    "",
    `Plan: ${titleCasePlan(result._plan)}`,
    `Question: ${view.question}`,
    `Verdict: ${titleCaseVerdict(view.verdict)}`,
    "",
    "Priority blockers:",
    ...(blockers.length > 0 ? blockers : ["- None listed."]),
    "",
    "Warnings to review after blockers:",
    ...(warnings.length > 0 ? warnings : ["- None listed."]),
    "",
    "Evidence from the verification run:",
    ...(evidence.length > 0 ? evidence : ["- No extra evidence recorded."]),
    "",
    closingLine,
    "```",
    "",
  ].join("\n");
}

export function shouldWriteMarkdownReport(result: MarkdownReportResult): boolean {
  return result.verification?.view.showReportExport === true;
}

export function getMarkdownReportPath(projectDir: string): string {
  return path.join(projectDir, "laxy-verify-report.md");
}

export function buildMarkdownReport(projectDir: string, result: MarkdownReportResult): string {
  const projectName = path.basename(path.resolve(projectDir));
  const plan = titleCasePlan(result._plan);
  const view = result.verification?.view;

  if (!view) {
    return [
      "# Laxy Verify Report",
      "",
      `Project: ${projectName}`,
      `Generated: ${formatTimestamp(result.timestamp)}`,
      "",
      "No detailed verification report was available for this run.",
      "",
    ].join("\n");
  }

  const blockers = view.blockers.map(
    (blocker) => `**${blocker.title}**\n  Why it matters: ${blocker.description}\n  What to do: ${blocker.action}`
  );
  const warnings = view.warnings.map(
    (warning) => `**${warning.title}**\n  Why it matters: ${warning.description}\n  What to do: ${warning.action}`
  );
  const passes = view.passes.map((check) => `${check.passed ? "Passed" : "Failed"}: ${check.label}`);
  const nextActions = defaultNextActions(result);

  return [
    "# Laxy Verify Report",
    "",
    `Project: ${projectName}`,
    `Generated: ${formatTimestamp(result.timestamp)}`,
    `Plan: ${plan}`,
    `Framework: ${result.framework ?? "unknown"}`,
    "",
    "## At A Glance",
    "",
    `Short answer: ${sentenceForVerdict(view)}`,
    `Why: ${view.summary}`,
    `Recommended next move: ${nextActions[0]}`,
    "",
    "## Decision",
    "",
    `Question: ${view.question}`,
    `Answer: ${titleCaseVerdict(view.verdict)}`,
    `Verdict: ${titleCaseVerdict(view.verdict)}`,
    `Confidence: ${view.confidence}`,
    `Grade: ${result.grade}`,
    "",
    renderMetrics(result).trimEnd(),
    "",
    renderChecklist("What Passed", passes).trimEnd(),
    "",
    renderChecklist("Blockers", blockers).trimEnd(),
    "",
    renderChecklist("Warnings", warnings).trimEnd(),
    "",
    renderChecklist("Next Actions", nextActions).trimEnd(),
    "",
    renderChecklist("Recorded Evidence", view.failureEvidence).trimEnd(),
    "",
    renderBuildErrors(result.build.errors).trimEnd(),
    renderE2EFailures(result).trimEnd(),
    renderCopyForAI(result).trimEnd(),
    "",
  ]
    .filter(Boolean)
    .join("\n");
}
