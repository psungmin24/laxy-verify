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
  const isReleaseTier = view.tier === "pro_plus";

  switch (view.verdict) {
    case "client-ready":
      return "Yes. This run collected enough evidence to support a client-ready call.";
    case "release-ready":
      return isReleaseTier
        ? "Yes. This run collected enough evidence to support a release-ready call."
        : "Yes. The current build looks strong enough to hand to a client.";
    case "hold":
      return isReleaseTier
        ? "No. This run found blockers that should be fixed before release."
        : "No. This run found blockers that should be fixed before sending this to a client.";
    case "investigate":
      return isReleaseTier
        ? "Not yet. The project is standing, but there is not enough confidence to call it release-ready."
        : "Not yet. The project may be usable, but the current evidence is not strong enough for a client handoff.";
    case "build-failed":
      return isReleaseTier
        ? "No. The production build failed, so the release should be held immediately."
        : "No. The production build failed, so this should not be sent to a client.";
    default:
      return isReleaseTier
        ? "This run did not find an immediate hard blocker, but it is still a shallow release-confidence pass."
        : "This run did not find an immediate hard blocker, but it is still a shallow delivery-confidence pass.";
  }
}

function defaultNextActions(result: MarkdownReportResult): string[] {
  const view = result.verification?.view;
  if (!view) return ["Rerun verification after the project changes are applied."];
  if (view.nextActions.length > 0) return view.nextActions;

  switch (view.verdict) {
    case "client-ready":
      return ["Send this version to the client, or rerun verification after meaningful UI or flow changes."];
    case "release-ready":
      return ["Ship this version, or archive this report as release evidence."];
    case "investigate":
      return view.tier === "pro_plus"
        ? ["Collect the missing verification evidence, then rerun the command before release."]
        : ["Collect the missing verification evidence, then rerun the command before sending this to a client."];
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

type ReportFlavor = "delivery" | "release" | "generic";

function getReportFlavor(view: TierVerificationView): ReportFlavor {
  switch (view.tier) {
    case "pro":
      return "delivery";
    case "pro_plus":
      return "release";
    default:
      return "generic";
  }
}

function sectionTitle(flavor: ReportFlavor, key: string): string {
  if (flavor === "delivery") {
    switch (key) {
      case "title":
        return "Laxy Verify Delivery Report";
      case "decision":
        return "Client Delivery Call";
      case "evidence":
        return "Delivery Evidence";
      case "passes":
        return "What Looks Ready";
      case "blockers":
        return "Client-Facing Blockers";
      case "warnings":
        return "Watch Before Delivery";
      case "nextActions":
        return "Fix Before Sending";
      case "recordedEvidence":
        return "Proof Collected In This Run";
      case "copy":
        return "Copy For AI";
      default:
        return key;
    }
  }

  if (flavor === "release") {
    switch (key) {
      case "title":
        return "Laxy Verify Release Report";
      case "decision":
        return "Release Call";
      case "evidence":
        return "Release Evidence";
      case "passes":
        return "Release Signals That Passed";
      case "blockers":
        return "Release Blockers";
      case "warnings":
        return "Release Risks To Watch";
      case "nextActions":
        return "What Must Happen Next";
      case "recordedEvidence":
        return "Evidence Pack";
      case "copy":
        return "Copy For AI";
      default:
        return key;
    }
  }

  switch (key) {
    case "title":
      return "Laxy Verify Report";
    case "decision":
      return "Decision";
    case "evidence":
      return "Verification Evidence";
    case "passes":
      return "What Passed";
    case "blockers":
      return "Blockers";
    case "warnings":
      return "Warnings";
    case "nextActions":
      return "Next Actions";
    case "recordedEvidence":
      return "Recorded Evidence";
    case "copy":
      return "Copy For AI";
    default:
      return key;
  }
}

function renderCopyForAI(result: MarkdownReportResult, flavor: ReportFlavor): string {
  const view = result.verification?.view;
  if (!view) return "";

  const blockers = view.blockers.map((blocker) => `- ${blocker.title}: ${blocker.action}`);
  const warnings = view.warnings.map((warning) => `- ${warning.title}: ${warning.action}`);
  const evidence = view.failureEvidence.map((item) => `- ${item}`);

  const closingLine =
    view.verdict === "release-ready"
      ? "Use this as release evidence, or rerun after any code change that could affect quality."
      : view.verdict === "client-ready"
        ? "Use this as client handoff evidence, or rerun after any code change that could affect user-facing flows."
      : view.verdict === "investigate" && view.blockers.length === 0
        ? "Collect the missing verification evidence, then rerun the command and compare the new report."
        : "Please fix the blockers first, then rerun the verification command and compare the new report.";

  const openingLine =
    flavor === "release"
      ? "Use this release report to decide whether the project is truly ready to ship."
      : flavor === "delivery"
        ? "Use this delivery report to fix the project before sending it to a client."
        : "Use this verification report to fix the project.";

  const targetLine =
    flavor === "release"
      ? "Goal: reach a release-ready verdict with strong viewport, visual, and user-flow evidence."
      : flavor === "delivery"
        ? "Goal: remove client-visible blockers and reach a confident client-ready call."
        : "Goal: fix the blockers and improve confidence on the next run.";

  return [
    `## ${sectionTitle(flavor, "copy")}`,
    "",
    "```text",
    openingLine,
    "",
    `Plan: ${titleCasePlan(result._plan)}`,
    `Question: ${view.question}`,
    `Verdict: ${titleCaseVerdict(view.verdict)}`,
    targetLine,
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
  const flavor = getReportFlavor(view);
  const decisionLead =
    flavor === "release"
      ? "This section answers whether the current build is strong enough to call release-ready."
      : flavor === "delivery"
        ? "This section answers whether the current build is strong enough to call client-ready."
        : "This section explains the outcome of the current verification run.";
  const atAGlanceLead =
    flavor === "release"
      ? "This report is written for a ship or hold decision."
      : flavor === "delivery"
        ? "This report is written for a client handoff decision."
        : "This report is written for a quick verification summary.";
  const decisionLabel =
    flavor === "release"
      ? "Release recommendation"
      : flavor === "delivery"
        ? "Client delivery recommendation"
        : "Recommendation";

  return [
    `# ${sectionTitle(flavor, "title")}`,
    "",
    `Project: ${projectName}`,
    `Generated: ${formatTimestamp(result.timestamp)}`,
    `Plan: ${plan}`,
    `Framework: ${result.framework ?? "unknown"}`,
    "",
    "## At A Glance",
    "",
    atAGlanceLead,
    "",
    `Short answer: ${sentenceForVerdict(view)}`,
    `Why: ${view.summary}`,
    `Recommended next move: ${nextActions[0]}`,
    "",
    `## ${sectionTitle(flavor, "decision")}`,
    "",
    decisionLead,
    "",
    `Question: ${view.question}`,
    `Answer: ${titleCaseVerdict(view.verdict)}`,
    `Verdict: ${titleCaseVerdict(view.verdict)}`,
    `${decisionLabel}: ${titleCaseVerdict(view.verdict)}`,
    `Confidence: ${view.confidence}`,
    `Grade: ${result.grade}`,
    "",
    renderMetrics(result).replace("## Verification Evidence", `## ${sectionTitle(flavor, "evidence")}`).trimEnd(),
    "",
    renderChecklist(sectionTitle(flavor, "passes"), passes).trimEnd(),
    "",
    renderChecklist(sectionTitle(flavor, "blockers"), blockers).trimEnd(),
    "",
    renderChecklist(sectionTitle(flavor, "warnings"), warnings).trimEnd(),
    "",
    renderChecklist(sectionTitle(flavor, "nextActions"), nextActions).trimEnd(),
    "",
    renderChecklist(sectionTitle(flavor, "recordedEvidence"), view.failureEvidence).trimEnd(),
    "",
    renderBuildErrors(result.build.errors).trimEnd(),
    renderE2EFailures(result).trimEnd(),
    renderCopyForAI(result, flavor).trimEnd(),
    "",
  ]
    .filter(Boolean)
    .join("\n");
}
