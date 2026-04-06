#!/usr/bin/env node

import { Command } from "commander";
import { resolve } from "path";
import { existsSync } from "fs";
import { loadConfig } from "./config.js";
import { runBuild } from "./build-runner.js";
import { runLighthouse } from "./lighthouse-runner.js";
import { getVerificationGrade, getLighthousePass, getImprovementRecommendations } from "./verification.js";
import { formatReport, type VerifyReport } from "./reporter.js";

const EXIT_PASS = 0;     // Silver or Gold
const EXIT_SOFT_FAIL = 1; // Bronze (build OK, LH failed)
const EXIT_FAIL = 2;      // Unverified (build failed)
const EXIT_CONFIG = 3;    // Config error

const program = new Command();

program
  .name("laxy-verify")
  .description("Frontend quality gate: build check + Lighthouse audit + verification grade")
  .version("0.1.0")
  .argument("[dir]", "Project directory", ".")
  .option("--format <type>", "Output format: console, json, md", "console")
  .option("--ci", "CI mode: relaxed thresholds, 3 Lighthouse runs")
  .option("--skip-lighthouse", "Skip Lighthouse, build-only verification")
  .option("--runs <number>", "Number of Lighthouse runs", parseInt)
  .option("--port <number>", "Dev server port", parseInt)
  .action(async (dir: string, opts) => {
    const projectPath = resolve(dir);

    if (!existsSync(projectPath)) {
      console.error(`Directory not found: ${projectPath}`);
      process.exit(EXIT_CONFIG);
    }

    if (!existsSync(resolve(projectPath, "package.json"))) {
      console.error("Not a Node.js project: package.json not found");
      process.exit(EXIT_CONFIG);
    }

    // Load config
    const { config, warnings } = loadConfig(projectPath, opts.ci);
    for (const w of warnings) console.warn(`[warn] ${w}`);

    // Override config with CLI flags
    if (opts.runs) config.runs = opts.runs;
    if (opts.port) config.port = opts.port;

    // Step 1: Build check
    const buildResult = await runBuild(projectPath);

    if (!buildResult.success) {
      const report: VerifyReport = {
        grade: "unverified",
        build: { success: false, errors: buildResult.errors, duration: buildResult.duration },
        lighthouse: { scores: null },
        thresholds: config.thresholds,
        recommendations: getImprovementRecommendations({
          buildSuccess: false,
          buildErrors: buildResult.errors,
        }),
      };
      console.log(formatReport(report, opts.format));
      process.exit(EXIT_FAIL);
    }

    // Step 2: Lighthouse (optional)
    let lighthouseScores = null;
    let lighthouseError: string | undefined;

    if (!opts.skipLighthouse) {
      const lhResult = await runLighthouse(projectPath, {
        port: config.port,
        runs: config.runs,
        ciMode: opts.ci,
      });
      lighthouseScores = lhResult.scores;
      lighthouseError = lhResult.error;
    }

    // Step 3: Grade
    const grade = getVerificationGrade({
      buildSuccess: true,
      lighthouseScores: lighthouseScores ?? undefined,
    });

    const report: VerifyReport = {
      grade,
      build: { success: true, errors: [], duration: buildResult.duration },
      lighthouse: { scores: lighthouseScores, error: lighthouseError },
      thresholds: config.thresholds,
      recommendations: getImprovementRecommendations({
        buildSuccess: true,
        lighthouseScores: lighthouseScores ?? undefined,
      }),
    };

    console.log(formatReport(report, opts.format));

    // Exit codes
    switch (grade) {
      case "gold":
      case "silver":
        process.exit(EXIT_PASS);
        break;
      case "bronze":
        process.exit(EXIT_SOFT_FAIL);
        break;
      default:
        process.exit(EXIT_FAIL);
    }
  });

program.parse();
