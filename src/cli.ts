#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { loadConfig, type FailOn } from "./config.js";
import { detect } from "./detect.js";
import { runBuild, type BuildResult } from "./build.js";
import { probeServerStatus, startDevServer, stopDevServer } from "./serve.js";
import { runLighthouse } from "./lighthouse.js";
import { isWorseOrEqual, type LighthouseScores } from "./grade.js";
import { runInit } from "./init.js";
import { generateBadge } from "./badge.js";
import { postPRComment } from "./comment.js";
import { createStatusCheck } from "./status.js";
import { login, clearToken, whoami } from "./auth.js";
import {
  applyPlanOverride,
  getEntitlements,
  normalizePlan,
  printPlanBanner,
  type EntitlementFeatures,
  type TestablePlan,
} from "./entitlement.js";
import { runMultiViewportLighthouse, printMultiViewportResults, allViewportsPass, runMobileLighthouse } from "./multi-viewport.js";
import { runVerifyE2E, type E2EScenarioResult } from "./e2e.js";
import { runPlaywrightE2E, isPlaywrightAvailable, type BrowserName, type CrossBrowserResult } from "./playwright-runner.js";
import { buildMarkdownReport, getMarkdownReportPath, shouldWriteMarkdownReport } from "./report-markdown.js";
import { runVisualDiff, type VisualDiffResult } from "./visual-diff.js";
import { runSecurityAudit, type SecurityAuditResult } from "./security-audit.js";
import {
  buildVerificationReport,
  getTierVerificationView,
  planToVerificationTier,
  type TierVerificationView,
  type VerificationReport,
} from "./verification-core/index.js";
import pkg from "../package.json";

interface CLIArgs {
  projectDir: string;
  subcommand?: "login" | "logout" | "whoami";
  subcommandArg?: string;
  format: "console" | "json";
  ciMode: boolean;
  configPath?: string;
  failOn?: FailOn;
  skipLighthouse: boolean;
  badge: boolean;
  init: boolean;
  initRun: boolean;
  multiViewport: boolean;
  failureAnalysis: boolean;
  crawl: boolean;
  planOverride?: TestablePlan;
  help: boolean;
}

interface LaxyResult {
  grade: string;
  timestamp: string;
  build: { success: boolean; durationMs: number; errors: string[] };
  e2e?: { passed: number; failed: number; total: number; results: E2EScenarioResult[] };
  crossBrowser?: CrossBrowserResult[];
  lighthouse: LighthouseScores & { runs: number } | null;
  mobileLighthouse?: LighthouseScores | null;
  security?: SecurityAuditResult | null;
  visualDiff?: VisualDiffResult | null;
  thresholds: { performance: number; accessibility: number; seo: number; bestPractices: number };
  ciMode: boolean;
  framework: string | null;
  exitCode: number;
  config_fail_on: string;
  github?: { status: string; grade?: string };
  _plan?: string;
  _verbose_failure?: boolean;
  _failure_analysis?: boolean;
  markdownReportPath?: string;
  verification?: {
    tier: VerificationReport["tier"];
    report: VerificationReport;
    view: TierVerificationView;
  };
}

function shouldFailVerificationResult(
  report: VerificationReport,
  failOn: FailOn
): boolean {
  if (failOn === "unverified") return false;
  if (report.verdict === "build-failed" || report.verdict === "hold") return true;
  if (report.tier === "pro_plus" && report.verdict === "investigate") return true;
  return isWorseOrEqual(report.grade, failOn);
}

function exitGracefully(code: number): void {
  if (process.platform === "win32") {
    setTimeout(() => process.exit(code), 100);
    return;
  }
  process.exit(code);
}

async function ensurePortAvailableForVerification(port: number): Promise<void> {
  const status = await probeServerStatus(port);
  if (status === null) return;

  throw new Error(
    `An existing local server is already responding on port ${port} (HTTP ${status}). Stop the running app before using laxy-verify, because the verification build can invalidate an active dev session.`
  );
}

function parseArgs(): CLIArgs {
  const raw = process.argv.slice(2);
  let projectDir = ".";
  const flags: Record<string, string | undefined> = {};

  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i];
    if (arg.startsWith("--")) {
      const eqIndex = arg.indexOf("=");
      if (eqIndex >= 0) {
        const key = arg.slice(2, eqIndex);
        flags[key] = arg.slice(eqIndex + 1);
      } else {
        const key = arg.slice(2);
        if (i + 1 < raw.length && !raw[i + 1].startsWith("-")) {
          flags[key] = raw[++i];
        } else {
          flags[key] = "true";
        }
      }
    } else if (projectDir === ".") {
      projectDir = arg;
    }
  }

  let subcommand: CLIArgs["subcommand"] | undefined;
  let subcommandArg: string | undefined;
  if (projectDir === "login" || projectDir === "logout" || projectDir === "whoami") {
    subcommand = projectDir as CLIArgs["subcommand"];
    projectDir = ".";
    subcommandArg = flags.email as string | undefined;
  }

  return {
    projectDir: path.resolve(projectDir),
    subcommand,
    subcommandArg,
    format: (flags.format as "console" | "json" | undefined) ?? "console",
    ciMode: flags.ci !== undefined || process.env.CI === "true",
    configPath: flags.config as string | undefined,
    failOn: (flags["fail-on"] as FailOn | undefined) ?? undefined,
    skipLighthouse: flags["skip-lighthouse"] !== undefined,
    badge: flags.badge !== undefined,
    init: flags.init !== undefined,
    initRun: flags.init !== undefined && flags.run !== undefined,
    multiViewport: flags["multi-viewport"] !== undefined,
    failureAnalysis: flags["failure-analysis"] !== undefined,
    crawl: flags.crawl !== undefined,
    planOverride: flags["plan-override"] as TestablePlan | undefined,
    help: flags.help !== undefined || flags.h !== undefined,
  };
}

function writeResultFile(projectDir: string, result: LaxyResult): void {
  const filePath = path.join(projectDir, ".laxy-result.json");
  fs.writeFileSync(filePath, JSON.stringify(result, null, 2) + "\n", "utf-8");
}

function summarizeViewportIssues(
  scores: Awaited<ReturnType<typeof runMultiViewportLighthouse>> | null,
  thresholds: { performance: number; accessibility: number; seo: number; bestPractices: number }
): { count: number; summary?: string } {
  if (!scores) return { count: 0 };

  const failed: string[] = [];
  for (const [label, viewportScores] of Object.entries(scores)) {
    if (!viewportScores) {
      failed.push(`${label}: missing`);
      continue;
    }

    const passes =
      viewportScores.performance >= thresholds.performance &&
      viewportScores.accessibility >= thresholds.accessibility &&
      viewportScores.seo >= thresholds.seo &&
      viewportScores.bestPractices >= thresholds.bestPractices;

    if (!passes) {
      failed.push(
        `${label}: P${viewportScores.performance} A${viewportScores.accessibility} SEO${viewportScores.seo} BP${viewportScores.bestPractices}`
      );
    }
  }

  return {
    count: failed.length,
    summary: failed.length > 0 ? failed.join(" | ") : "All checked viewports passed.",
  };
}

function consoleOutput(result: LaxyResult): void {
  const gradeLabel = result.grade;
  const checkEmoji = result.grade !== "Unverified" ? " OK" : "";
  console.log(`\n  Laxy Verify ${gradeLabel}${checkEmoji}`);
  console.log(`  Build: ${result.build.success ? `OK (${result.build.durationMs}ms)` : "FAILED"}`);

  if (result.build.errors.length > 0) {
    console.log("  Errors:");
    const firstError = result.build.errors.find((line) => /error/i.test(line));
    const last5 = result.build.errors.slice(-5);
    const toShow = firstError && !last5.includes(firstError)
      ? [firstError, "  ...", ...last5]
      : last5;
    for (const line of toShow) console.error(`    ${line}`);
  }

  if (result.lighthouse !== null) {
    const lh = result.lighthouse;
    const t = result.thresholds;
    const check = (passed: boolean) => (passed ? " OK" : " FAIL");
    console.log("  Lighthouse:");
    console.log(`    Performance:     ${lh.performance} / ${t.performance}${check(lh.performance >= t.performance)}`);
    console.log(`    Accessibility:   ${lh.accessibility} / ${t.accessibility}${check(lh.accessibility >= t.accessibility)}`);
    console.log(`    SEO:             ${lh.seo} / ${t.seo}${check(lh.seo >= t.seo)}`);
    console.log(`    Best Practices:  ${lh.bestPractices} / ${t.bestPractices}${check(lh.bestPractices >= t.bestPractices)}`);
    console.log(`    Runs:            ${lh.runs}`);
  } else {
    console.log("  Lighthouse: skipped");
  }

  if (result.e2e) {
    console.log(`  E2E: ${result.e2e.passed}/${result.e2e.total} passed`);
  }

  if (result.crossBrowser && result.crossBrowser.length > 0) {
    console.log("  Cross-browser:");
    for (const cbr of result.crossBrowser) {
      const status = cbr.failed === 0 ? "OK" : "FAIL";
      console.log(`    ${cbr.browser}: ${cbr.passed}/${cbr.results.length} passed ${status}`);
    }
  }

  if (result.visualDiff) {
    console.log(`  Visual diff: ${result.visualDiff.diffPercentage}% (${result.visualDiff.verdict})`);
  }

  if (result.security) {
    console.log(`  Security: ${result.security.summary}`);
  }

  if (result.mobileLighthouse) {
    const ml = result.mobileLighthouse;
    console.log(`  Mobile LH: P=${ml.performance} A=${ml.accessibility} SEO=${ml.seo} BP=${ml.bestPractices}`);
  }

  if (result.verification) {
    const view = result.verification.view;
    const isPro = view.tier === "pro" || view.tier === "pro_plus";
    const isProPlus = view.tier === "pro_plus";
    // verbose_failure: Pro에서 서버가 활성화하면 blockers 전체 설명 표시
    // failure_analysis: Pro+에서 서버가 활성화하면 warnings 전체 설명 + evidence 전체 표시
    const verboseFailure = isPro && (result._verbose_failure ?? isPro);
    const failureAnalysis = isProPlus && (result._failure_analysis ?? isProPlus);

    console.log(`  Verification tier: ${view.tier}`);
    console.log(`  Question: ${view.question}`);
    console.log(`  Verdict: ${view.verdict} (${view.confidence})`);
    console.log(`  Summary: ${view.summary}`);

    // Pro/Pro+: 체크 통과 목록 요약
    if (isPro && view.passes.length > 0) {
      const passedChecks = view.passes.filter((p) => p.passed).map((p) => p.label);
      const failedChecks = view.passes.filter((p) => !p.passed).map((p) => p.label);
      if (passedChecks.length > 0) console.log(`  Passed: ${passedChecks.join(", ")}`);
      if (failedChecks.length > 0) console.log(`  Failed: ${failedChecks.join(", ")}`);
    }

    // Blockers: 제목은 모든 티어, Fix 액션은 verbose_failure(Pro+) 이상에서 표시
    if (view.blockers.length > 0) {
      console.log("  Blockers:");
      for (const blocker of view.blockers) {
        console.log(`    - ${blocker.title}`);
        if (verboseFailure) console.log(`      Fix: ${blocker.action}`);
      }
    }

    // Warnings: Pro/Pro+에서만 표시, Review 액션은 failure_analysis(Pro+)에서 표시
    if (isPro && view.warnings.length > 0) {
      console.log("  Warnings:");
      for (const warning of view.warnings) {
        console.log(`    - ${warning.title}`);
        if (failureAnalysis) console.log(`      Review: ${warning.action}`);
      }
    }

    if (view.nextActions.length > 0) {
      console.log("  Next actions:");
      for (const action of view.nextActions) console.log(`    - ${action}`);
    }

    // Evidence: failure_analysis(Pro+)는 전체, verbose_failure(Pro)는 3개, Free는 2개
    const evidenceLimit = failureAnalysis ? view.failureEvidence.length : verboseFailure ? 3 : 2;
    const evidenceToShow = view.failureEvidence.slice(0, evidenceLimit);
    if (evidenceToShow.length > 0) {
      console.log("  Evidence:");
      for (const item of evidenceToShow) console.log(`    - ${item}`);
    }
  }

  if (result.github) {
    if (result.github.status === "comment_posted") console.log("  PR comment: posted");
    if (result.github.status === "status_set") console.log(`  Status check: ${result.github.grade}`);
  }

  console.log("  Result: .laxy-result.json");
  if (result.markdownReportPath) {
    console.log(`  Report: ${path.basename(result.markdownReportPath)}`);
  }
  console.log(`  Exit code: ${result.exitCode}`);

  if ((result.grade === "Silver" || result.grade === "Bronze") && (!result._plan || result._plan === "free")) {
    console.log("\n  Unlock deeper verification and Gold-grade confidence with Pro or Pro+:");
    console.log("  https://laxy-blue.vercel.app/pricing");
  }
}

async function run(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    console.log(`
  laxy-verify v${pkg.version}
  Frontend quality gate: build + Lighthouse verification

  Usage:
    npx laxy-verify [project-dir] [options]
    npx laxy-verify <subcommand>

  Subcommands:
    login [email]     Log in to unlock Pro/Pro+ features
    logout            Remove saved credentials
    whoami            Show current login status

  Options:
    --init            Generate .laxy.yml + GitHub workflow file
    --init --run      Generate config and immediately run verification
    --format          console | json  (default: console)
    --ci              CI mode: -10 Performance threshold, runs=3
    --config <path>   Path to .laxy.yml
    --fail-on         unverified | bronze | silver | gold
    --skip-lighthouse Skip Lighthouse but still run build and E2E
    --plan-override   free | pro | pro_plus (downgrade testing only)
    --multi-viewport  Pro+: Lighthouse on desktop/tablet/mobile
    --crawl           Crawl the app to discover routes before E2E
    --badge           Print shields.io badge markdown
    --help            Show this help

  Exit codes:
    0   Grade meets or exceeds fail_on threshold
    1   Grade worse than fail_on, or build failed
    2   Configuration error

  Examples:
    npx laxy-verify --init --run        # Setup + first verification
    npx laxy-verify .                   # Run in current directory
    npx laxy-verify . --ci              # CI mode
    npx laxy-verify . --fail-on silver  # Require Silver or better

  Docs: https://github.com/psungmin24/laxy-verify
`);
    exitGracefully(0);
    return;
  }

  if (args.subcommand === "login") {
    await login(args.subcommandArg);
    exitGracefully(0);
    return;
  }
  if (args.subcommand === "logout") {
    clearToken();
    exitGracefully(0);
    return;
  }
  if (args.subcommand === "whoami") {
    whoami();
    exitGracefully(0);
    return;
  }

  if (args.init) {
    runInit(args.projectDir);
    if (!args.initRun) {
      console.log("\n  Next step: run npx laxy-verify .  (or use --init --run to continue immediately)");
      exitGracefully(0);
      return;
    }
    console.log("\n  Config created. Starting verification...\n");
  }

  if (args.badge) {
    const resultPath = path.join(args.projectDir, ".laxy-result.json");
    if (!fs.existsSync(resultPath)) {
      console.error("Error: .laxy-result.json not found. Run `npx laxy-verify .` first to generate it.");
      exitGracefully(2);
      return;
    }
    const content = JSON.parse(fs.readFileSync(resultPath, "utf-8"));
    const badge = generateBadge(content.grade as string);
    console.log(badge);
    exitGracefully(0);
    return;
  }

  let config;
  try {
    config = loadConfig({
      dir: args.projectDir,
      configPath: args.configPath,
      ciMode: args.ciMode,
      cliFlags: {
        failOn: args.failOn,
        skipLighthouse: args.skipLighthouse,
      },
    });
  } catch (err) {
    console.error(`Config error: ${err instanceof Error ? err.message : String(err)}`);
    exitGracefully(2);
    return;
  }

  let detected;
  try {
    detected = detect(args.projectDir);
  } catch (err) {
    console.error(`Detection error: ${err instanceof Error ? err.message : String(err)}`);
    exitGracefully(2);
    return;
  }

  const buildCmd = config.build_command || detected.buildCmd;
  const devCmd = config.dev_command || detected.devCmd;
  const port = config.port;

  try {
    await ensurePortAvailableForVerification(port);
  } catch (err) {
    console.error(`Preflight error: ${err instanceof Error ? err.message : String(err)}`);
    exitGracefully(2);
    return;
  }

  let buildResult: BuildResult;
  try {
    buildResult = await runBuild(buildCmd, config.build_timeout, args.projectDir);
  } catch (err) {
    buildResult = {
      success: false,
      durationMs: 0,
      errors: err instanceof Error ? [err.message] : [String(err)],
    };
  }

  let scores: LighthouseScores | undefined;
  let lighthouseResult: LaxyResult["lighthouse"] = null;
  let lighthouseErrorCount = 0;
  const adjustedThresholds = {
    performance: config.ciMode ? config.thresholds.performance - 10 : config.thresholds.performance,
    accessibility: config.thresholds.accessibility,
    seo: config.thresholds.seo,
    bestPractices: config.thresholds.bestPractices,
  };

  let entitlements: EntitlementFeatures | null = null;
  try {
    entitlements = await getEntitlements();
    printPlanBanner(entitlements);
  } catch {
    // Ignore entitlement errors and keep the free feature set.
  }

  const features = entitlements ?? {
    plan: "free",
    gold_grade: false,
    lighthouse_runs_3: false,
    verbose_failure: false,
    multi_viewport: false,
    failure_analysis: false,
    fast_lane: false,
  };

  let effectiveFeatures = features;
  if (args.planOverride) {
    try {
      effectiveFeatures = applyPlanOverride(features, args.planOverride);
      console.log(
        `  Plan override: ${normalizePlan(features.plan)} -> ${effectiveFeatures.plan} (testing lower-tier verification behavior)`
      );
    } catch (overrideErr) {
      console.error(`Plan override error: ${overrideErr instanceof Error ? overrideErr.message : String(overrideErr)}`);
      exitGracefully(2);
      return;
    }
  }

  if (effectiveFeatures.lighthouse_runs_3 && config.lighthouse_runs < 3) {
    config = { ...config, lighthouse_runs: 3 };
  }

  let multiViewportScores = null;
  let allViewportsOk = false;
  let e2eResult: LaxyResult["e2e"] | undefined;
  let crossBrowserResults: CrossBrowserResult[] | undefined;
  let e2eCoverageGaps: string[] = [];
  let e2eConsoleErrors: string[] = [];
  let e2eStabilityPassed = true;
  let visualDiffResult: VisualDiffResult | null = null;
  let securityAuditResult: SecurityAuditResult | null = null;
  let mobileLighthouseScores: import("./grade.js").LighthouseScores | null = null;
  const failureEvidence: string[] = [];

  if (buildResult.success) {
    let servePid: number | undefined;
    try {
      const serve = await startDevServer(devCmd, port, config.dev_timeout, args.projectDir);
      servePid = serve.pid;
      const verifyUrl = `http://127.0.0.1:${port}/`;
      const verificationTier = planToVerificationTier(effectiveFeatures.plan);

      if (!args.skipLighthouse) {
        try {
          const lhResult = await runLighthouse(port, config.lighthouse_runs);
          lighthouseErrorCount = lhResult.errors.length;
          scores = lhResult.scores ?? undefined;
          if (scores) {
            lighthouseResult = {
              performance: scores.performance,
              accessibility: scores.accessibility,
              seo: scores.seo,
              bestPractices: scores.bestPractices,
              runs: config.lighthouse_runs,
            };
          }
        } catch (lhErr) {
          console.error(`Lighthouse error: ${lhErr instanceof Error ? lhErr.message : String(lhErr)}`);
        }
      }

      if (!args.skipLighthouse && args.multiViewport && !effectiveFeatures.multi_viewport) {
        console.log("\n  Note: --multi-viewport requires Pro+. Run laxy-verify login with a paid account to unlock it.");
      } else if (!args.skipLighthouse && effectiveFeatures.multi_viewport) {
        try {
          multiViewportScores = await runMultiViewportLighthouse(port);
          printMultiViewportResults(multiViewportScores, adjustedThresholds);
          allViewportsOk = allViewportsPass(multiViewportScores, adjustedThresholds);
          // Surface screenshot diff issues in failure evidence
          if (multiViewportScores.screenshotDiffs) {
            for (const diff of multiViewportScores.screenshotDiffs) {
              if (!diff.baselineCreated && diff.diffPercent > 10) {
                failureEvidence.push(`Viewport screenshot: ${diff.viewport} diff ${diff.diffPercent}% exceeds 10% threshold`);
              }
            }
          }
        } catch (mvErr) {
          console.error(`Multi-viewport error: ${mvErr instanceof Error ? mvErr.message : String(mvErr)}`);
        }
      }

      // Pro: single mobile Lighthouse check (if not using full multi-viewport)
      if (
        !args.skipLighthouse &&
        verificationTier === "pro" &&
        !effectiveFeatures.multi_viewport
      ) {
        try {
          mobileLighthouseScores = await runMobileLighthouse(port);
          if (mobileLighthouseScores) {
            const mobilePassed =
              mobileLighthouseScores.performance >= adjustedThresholds.performance &&
              mobileLighthouseScores.accessibility >= adjustedThresholds.accessibility;
            if (!mobilePassed) {
              failureEvidence.push(
                `Mobile LH: P=${mobileLighthouseScores.performance} A=${mobileLighthouseScores.accessibility}`
              );
            }
          }
        } catch (mobileLhErr) {
          console.error(`Mobile Lighthouse error: ${mobileLhErr instanceof Error ? mobileLhErr.message : String(mobileLhErr)}`);
        }
      }

      // Pro/Pro+: security audit
      if (verificationTier !== "free") {
        try {
          securityAuditResult = await runSecurityAudit(args.projectDir);
          if (securityAuditResult.critical > 0 || securityAuditResult.high > 0) {
            failureEvidence.push(`Security: ${securityAuditResult.summary}`);
          }
        } catch (secErr) {
          console.error(`Security audit error: ${secErr instanceof Error ? secErr.message : String(secErr)}`);
        }
      }

      const crawlEnabled = args.crawl || config.crawl;
      const crawlOpts = crawlEnabled
        ? { enabled: true, maxDepth: config.max_crawl_depth, maxPages: config.max_crawl_pages }
        : undefined;
      let lastE2EScenarios: import("./e2e.js").E2EScenario[] | undefined;

      try {
        const e2eRuns = await runVerifyE2E(verifyUrl, verificationTier, config.scenarios, crawlOpts);
        lastE2EScenarios = e2eRuns.scenarios;
        e2eResult = {
          passed: e2eRuns.passed,
          failed: e2eRuns.failed,
          total: e2eRuns.results.length,
          results: e2eRuns.results,
        };
        e2eCoverageGaps = e2eRuns.coverageGaps;
        e2eConsoleErrors = e2eRuns.consoleErrors;

        // Pro+ stability: run E2E a second time if first run passed all
        if (verificationTier === "pro_plus" && e2eRuns.passed === e2eRuns.results.length && e2eRuns.results.length > 0) {
          console.log("  [Pro+] Running stability pass (run 2/2)...");
          const e2eRuns2 = await runVerifyE2E(verifyUrl, verificationTier, config.scenarios, crawlOpts);
          if (e2eRuns2.passed < e2eRuns2.results.length) {
            e2eStabilityPassed = false;
            e2eCoverageGaps.push("Stability check failed on second run");
            const failedNames = e2eRuns2.results
              .filter((r) => !r.passed)
              .map((r) => r.name)
              .join(", ");
            failureEvidence.push(`E2E stability: second run failed (${failedNames})`);
          } else {
            console.log("  [Pro+] Stability pass: OK (2/2 runs passed)");
          }
        }

        if (e2eRuns.coverageGaps.length > 0) {
          console.error(`E2E coverage warning: ${e2eRuns.coverageGaps.join(" ")}`);
        }
        if (e2eRuns.consoleErrors.length > 0) {
          console.error(`E2E console errors: ${e2eRuns.consoleErrors.length} detected`);
        }
      } catch (e2eErr) {
        console.error(`E2E error: ${e2eErr instanceof Error ? e2eErr.message : String(e2eErr)}`);
      }

      // Cross-browser E2E via Playwright (if non-chromium browsers configured)
      const extraBrowsers = (config.browsers || []).filter(
        (b): b is BrowserName => b !== "chromium" && ["firefox", "webkit"].includes(b)
      );
      if (extraBrowsers.length > 0 && lastE2EScenarios && lastE2EScenarios.length > 0) {
        const pwAvailable = await isPlaywrightAvailable();
        if (pwAvailable) {
          try {
            crossBrowserResults = await runPlaywrightE2E(verifyUrl, lastE2EScenarios, extraBrowsers);
            for (const cbr of crossBrowserResults) {
              console.log(`  Cross-browser ${cbr.browser}: ${cbr.passed}/${cbr.results.length} passed`);
              if (cbr.failed > 0) {
                const failedNames = cbr.results.filter(r => !r.passed).map(r => r.name).join(", ");
                failureEvidence.push(`Cross-browser ${cbr.browser}: ${failedNames} failed`);
              }
            }
          } catch (cbErr) {
            console.error(`Cross-browser error: ${cbErr instanceof Error ? cbErr.message : String(cbErr)}`);
          }
        } else {
          console.log("  Note: Cross-browser testing requires playwright. Run: npm install -D playwright && npx playwright install");
        }
      }

      if (verificationTier === "pro_plus") {
        try {
          visualDiffResult = await runVisualDiff(args.projectDir, verifyUrl, "verify");
        } catch (visualErr) {
          console.error(`Visual diff error: ${visualErr instanceof Error ? visualErr.message : String(visualErr)}`);
        }
      }
    } catch (serveErr) {
      console.error(`Dev server error: ${serveErr instanceof Error ? serveErr.message : String(serveErr)}`);
    } finally {
      if (servePid) {
        stopDevServer(servePid);
      }
    }
  }

  const verificationTier = planToVerificationTier(effectiveFeatures.plan);
  const viewportSummary = summarizeViewportIssues(multiViewportScores, adjustedThresholds);
  failureEvidence.push(
    ...buildResult.errors.slice(0, 3).map((error) => `Build: ${error}`),
    ...(lighthouseErrorCount > 0 ? [`Lighthouse: ${lighthouseErrorCount} run error(s) were recorded during collection.`] : []),
    ...(e2eResult
      ? e2eResult.results
          .filter((scenario) => !scenario.passed)
          .slice(0, 2)
          .map((scenario) => `E2E: ${scenario.name}${scenario.error ? ` - ${scenario.error}` : ""}`)
      : []),
    ...e2eConsoleErrors.slice(0, 2).map((e) => `Console: ${e}`),
    ...e2eCoverageGaps.slice(0, 2).map((gap) => `E2E coverage: ${gap}`),
    ...(viewportSummary.count > 0 && viewportSummary.summary ? [`Viewport: ${viewportSummary.summary}`] : []),
    ...(visualDiffResult
      ? [
          visualDiffResult.hasBaseline
            ? `Visual diff: ${visualDiffResult.diffPercentage}% (${visualDiffResult.verdict})`
            : "Visual diff: baseline seeded",
        ]
      : []),
  );

  const verificationReport = buildVerificationReport(
    {
      buildSuccess: buildResult.success,
      buildErrors: buildResult.errors,
      e2ePassed: e2eResult?.passed,
      e2eTotal: e2eResult?.total,
      e2eCoverageGaps,
      e2eConsoleErrorCount: e2eConsoleErrors.length,
      e2eStabilityPassed,
      lighthouseSkipped: args.skipLighthouse,
      lighthouseErrorCount,
      viewportIssues: multiViewportScores ? viewportSummary.count : undefined,
      multiViewportPassed: multiViewportScores ? allViewportsOk : undefined,
      multiViewportSummary: multiViewportScores ? viewportSummary.summary : undefined,
      visualDiffVerdict: visualDiffResult?.verdict,
      visualDiffPercentage: visualDiffResult?.diffPercentage,
      hasVisualBaseline: visualDiffResult?.hasBaseline,
      lighthouseScores: scores,
      mobileLighthouseScores: mobileLighthouseScores ?? undefined,
      securityAudit: securityAuditResult
        ? {
            totalVulnerabilities: securityAuditResult.totalVulnerabilities,
            critical: securityAuditResult.critical,
            high: securityAuditResult.high,
            summary: securityAuditResult.summary,
          }
        : undefined,
      failureEvidence,
    },
    {
      tier: verificationTier,
      thresholds: adjustedThresholds,
    }
  );

  const verificationView = getTierVerificationView(verificationReport);
  const unifiedGrade = verificationReport.grade;
  const exitCode = shouldFailVerificationResult(verificationReport, config.fail_on) ? 1 : 0;

  const resultObj: LaxyResult = {
    grade: unifiedGrade.charAt(0).toUpperCase() + unifiedGrade.slice(1),
    timestamp: new Date().toISOString(),
    build: {
      success: buildResult.success,
      durationMs: buildResult.durationMs,
      errors: buildResult.errors,
    },
    e2e: e2eResult,
    crossBrowser: crossBrowserResults,
    lighthouse: lighthouseResult,
    mobileLighthouse: mobileLighthouseScores,
    security: securityAuditResult,
    visualDiff: visualDiffResult,
    thresholds: adjustedThresholds,
    ciMode: config.ciMode,
    framework: detected.framework,
    exitCode,
    config_fail_on: config.fail_on,
    _plan: effectiveFeatures.plan,
    _verbose_failure: effectiveFeatures.verbose_failure,
    _failure_analysis: effectiveFeatures.failure_analysis,
    verification: {
      tier: verificationTier,
      report: verificationReport,
      view: verificationView,
    },
  };

  const markdownReportPath = getMarkdownReportPath(args.projectDir);
  if (shouldWriteMarkdownReport(resultObj)) {
    const markdownReport = buildMarkdownReport(args.projectDir, resultObj);
    fs.writeFileSync(markdownReportPath, markdownReport, "utf-8");
    resultObj.markdownReportPath = markdownReportPath;
  } else if (fs.existsSync(markdownReportPath)) {
    fs.rmSync(markdownReportPath, { force: true });
  }

  const inGitHubActions = !!process.env.GITHUB_ACTIONS;
  if (inGitHubActions) {
    try {
      if (process.env.GITHUB_EVENT_NAME === "pull_request") {
        await postPRComment(resultObj);
        resultObj.github = { status: "comment_posted", grade: resultObj.grade };
      }

      await createStatusCheck({ grade: resultObj.grade, exitCode: resultObj.exitCode });
      resultObj.github ??= { status: "status_set", grade: resultObj.grade };
    } catch (ghErr) {
      console.error(`GitHub API warning: ${ghErr instanceof Error ? ghErr.message : String(ghErr)}`);
    }
  }

  writeResultFile(args.projectDir, resultObj);

  if (args.format === "json") {
    console.log(JSON.stringify(resultObj, null, 2));
  } else {
    consoleOutput(resultObj);
  }

  if (inGitHubActions && process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `grade=${resultObj.grade}\n`);
  }

  exitGracefully(exitCode);
}

run().catch((err) => {
  console.error(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  exitGracefully(1);
});
