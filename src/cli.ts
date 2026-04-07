#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { loadConfig, type FailOn, ConfigParseError } from "./config.js";
import { detect } from "./detect.js";
import { runBuild, type BuildResult } from "./build.js";
import { startDevServer, stopDevServer } from "./serve.js";
import { runLighthouse } from "./lighthouse.js";
import { calculateGrade, type LighthouseScores } from "./grade.js";
import { runInit } from "./init.js";
import { generateBadge } from "./badge.js";
import { postPRComment } from "./comment.js";
import { createStatusCheck } from "./status.js";

interface CLIArgs {
  projectDir: string;
  format: "console" | "json";
  ciMode: boolean;
  configPath?: string;
  failOn?: FailOn;
  skipLighthouse: boolean;
  badge: boolean;
  init: boolean;
}

function parseArgs(): CLIArgs {
  const raw = process.argv.slice(2);

  // Single-pass: collect flags and first positional
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
        // Check if next arg is a value
        if (i + 1 < raw.length && !raw[i + 1].startsWith("-")) {
          flags[key] = raw[++i];
        } else {
          flags[key] = "true";
        }
      }
    } else {
      // Only first non-flag arg is positional (projectDir)
      if (projectDir === ".") {
        projectDir = arg;
      }
    }
  }

  return {
    projectDir: path.resolve(projectDir),
    format: (flags["format"] as "console" | "json" | undefined) ?? "console",
    ciMode: flags["ci"] !== undefined || process.env.CI === "true",
    configPath: flags["config"] as string | undefined,
    failOn: (flags["fail-on"] as FailOn | undefined) ?? undefined,
    skipLighthouse: flags["skip-lighthouse"] !== undefined,
    badge: flags["badge"] !== undefined,
    init: flags["init"] !== undefined,
  };
}

function writeResultFile(projectDir: string, result: LaxyResult): void {
  const filePath = path.join(projectDir, ".laxy-result.json");
  fs.writeFileSync(filePath, JSON.stringify(result, null, 2) + "\n", "utf-8");
}

interface LaxyResult {
  grade: string;
  timestamp: string;
  build: { success: boolean; durationMs: number; errors: string[] };
  lighthouse: LighthouseScores & { runs: number } | null;
  thresholds: { performance: number; accessibility: number; seo: number; bestPractices: number };
  ciMode: boolean;
  framework: string | null;
  exitCode: number;
  config_fail_on: string;
  github?: { status: string; grade?: string };
}

function consoleOutput(result: LaxyResult) {
  const gradeLabel = result.grade;
  const checkEmoji = result.grade !== "Unverified" ? " ✅" : "";
  console.log(`\n  Laxy Verify — ${gradeLabel}${checkEmoji}`);
  console.log(`  Build: ${result.build.success ? `OK (${result.build.durationMs}ms)` : "FAILED"}`);

  if (result.build.errors.length > 0) {
    const last5 = result.build.errors.slice(-5);
    console.log(`  Errors:`);
    for (const e of last5) console.error(`    ${e}`);
  }

  if (result.lighthouse !== null) {
    const lh = result.lighthouse;
    const t = result.thresholds;
    const check = (passed: boolean) => passed ? " ✅" : " ❌";
    console.log(`  Lighthouse:`);
    console.log(`    Performance:     ${lh.performance} / ${t.performance}${check(lh.performance >= t.performance)}`);
    console.log(`    Accessibility:   ${lh.accessibility} / ${t.accessibility}${check(lh.accessibility >= t.accessibility)}`);
    console.log(`    SEO:             ${lh.seo} / ${t.seo}${check(lh.seo >= t.seo)}`);
    console.log(`    Best Practices:  ${lh.bestPractices} / ${t.bestPractices}${check(lh.bestPractices >= t.bestPractices)}`);
    console.log(`    Runs:            ${lh.runs}`);
  } else {
    console.log(`  Lighthouse: skipped`);
  }

  if (result.github) {
    if (result.github.status === "comment_posted") console.log(`  PR comment: posted`);
    if (result.github.status === "status_set") console.log(`  Status check: ${result.github.grade}`);
  }
  console.log(`  Result: .laxy-result.json`);
  console.log(`  Exit code: ${result.exitCode}`);
}

async function run() {
  const args = parseArgs();

  // --init
  if (args.init) {
    runInit(args.projectDir);
    process.exit(0);
    return;
  }

  // --badge
  if (args.badge) {
    const resultPath = path.join(args.projectDir, ".laxy-result.json");
    if (!fs.existsSync(resultPath)) {
      console.error("Error: .laxy-result.json not found. Run `npx laxy-verify .` first to generate it.");
      process.exit(2);
      return;
    }
    const content = JSON.parse(fs.readFileSync(resultPath, "utf-8"));
    const badge = generateBadge(content.grade as string);
    console.log(badge);
    process.exit(0);
    return;
  }

  // Load config
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
    process.exit(2);
    return;
  }

  // Auto-detect framework + package manager
  let detected;
  try {
    detected = detect(args.projectDir);
  } catch (err) {
    console.error(`Detection error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
    return;
  }

  // Merge config overrides
  const buildCmd = config.build_command || detected.buildCmd;
  const devCmd = config.dev_command || detected.devCmd;
  const port = config.port;

  // Phase 1: Build
  let buildResult: BuildResult;
  try {
    buildResult = await runBuild(buildCmd, config.build_timeout);
  } catch (err) {
    buildResult = {
      success: false,
      durationMs: 0,
      errors: err instanceof Error ? [err.message] : [String(err)],
    };
  }

  let scores: LighthouseScores | undefined = undefined;
  let lighthouseResult: LaxyResult["lighthouse"] = null;
  const adjustedThresholds = {
    performance: config.ciMode
      ? config.thresholds.performance - 10
      : config.thresholds.performance,
    accessibility: config.thresholds.accessibility,
    seo: config.thresholds.seo,
    bestPractices: config.thresholds.bestPractices,
  };

  // Phase 2: Dev server + Lighthouse (only if build succeeded and not skipped)
  if (buildResult.success && !args.skipLighthouse) {
    let servePid: number | undefined;
    try {
      const serve = await startDevServer(devCmd, port, config.dev_timeout);
      servePid = serve.pid;

      try {
        const lhResult = await runLighthouse(port, config.lighthouse_runs);
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
    } catch (serveErr) {
      console.error(`Dev server error: ${serveErr instanceof Error ? serveErr.message : String(serveErr)}`);
    } finally {
      if (servePid) {
        stopDevServer(servePid);
      }
    }
  }

  // Calculate grade
  const gradeResult = calculateGrade({
    buildSuccess: buildResult.success,
    scores,
    thresholds: adjustedThresholds,
    failOn: config.fail_on,
  });

  // Build result object
  const resultObj: LaxyResult = {
    grade: gradeResult.grade.charAt(0).toUpperCase() + gradeResult.grade.slice(1), // Capitalize
    timestamp: new Date().toISOString(),
    build: {
      success: buildResult.success,
      durationMs: buildResult.durationMs,
      errors: buildResult.errors,
    },
    lighthouse: lighthouseResult,
    thresholds: adjustedThresholds,
    ciMode: config.ciMode,
    framework: detected.framework,
    exitCode: gradeResult.exitCode,
    config_fail_on: config.fail_on,
  };

  // GitHub integration (only in Actions)
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

  // Output
  if (args.format === "json") {
    console.log(JSON.stringify(resultObj, null, 2));
  } else {
    consoleOutput(resultObj);
  }

  // Set $GITHUB_OUTPUT if in Actions
  if (inGitHubActions && process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `grade=${resultObj.grade}\n`);
  }

  process.exit(gradeResult.exitCode);
}

run().catch((err) => {
  console.error(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
