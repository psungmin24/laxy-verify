import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";

export type FailOn = "unverified" | "bronze" | "silver" | "gold";

export interface Thresholds {
  performance: number;
  accessibility: number;
  seo: number;
  bestPractices: number;
}

export interface LaxyConfig {
  framework: string;
  build_command: string;
  dev_command: string;
  package_manager: string;
  port: number;
  build_timeout: number;
  dev_timeout: number;
  lighthouse_runs: number;
  thresholds: Thresholds;
  fail_on: FailOn;
}

const DEFAULT_CONFIG: LaxyConfig = {
  framework: "auto",
  build_command: "",
  dev_command: "",
  package_manager: "auto",
  port: 3000,
  build_timeout: 300,
  dev_timeout: 60,
  lighthouse_runs: 1,
  thresholds: {
    performance: 70,
    accessibility: 85,
    seo: 80,
    bestPractices: 80,
  },
  fail_on: "bronze",
};

const VALID_FAIL_ON: FailOn[] = ["unverified", "bronze", "silver", "gold"];

export class ConfigParseError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "ConfigParseError";
  }
}

function parseYaml(filePath: string): Partial<LaxyConfig> {
  const content = fs.readFileSync(filePath, "utf-8");
  const raw = yaml.load(content) as Record<string, unknown>;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ConfigParseError("Invalid YAML structure in .laxy.yml");
  }

  const result: Partial<LaxyConfig> = {};
  if (typeof raw.framework === "string") result.framework = raw.framework;
  if (typeof raw.build_command === "string")
    result.build_command = raw.build_command;
  if (typeof raw.dev_command === "string")
    result.dev_command = raw.dev_command;
  if (typeof raw.package_manager === "string")
    result.package_manager = raw.package_manager;
  if (typeof raw.port === "number") result.port = raw.port;
  if (typeof raw.build_timeout === "number")
    result.build_timeout = raw.build_timeout;
  if (typeof raw.dev_timeout === "number")
    result.dev_timeout = raw.dev_timeout;
  if (typeof raw.lighthouse_runs === "number")
    result.lighthouse_runs = raw.lighthouse_runs;

  if (typeof raw.fail_on === "string") {
    const f = raw.fail_on as FailOn;
    if (!VALID_FAIL_ON.includes(f)) {
      throw new ConfigParseError(
        `Invalid fail_on value: "${f}". Must be one of: ${VALID_FAIL_ON.join(", ")}`
      );
    }
    result.fail_on = f;
  }

  if (
    typeof raw.thresholds === "object" &&
    raw.thresholds !== null &&
    !Array.isArray(raw.thresholds)
  ) {
    const t = raw.thresholds as Record<string, unknown>;
    const thr: Partial<Thresholds> = {};
    if (typeof t.performance === "number") thr.performance = t.performance;
    if (typeof t.accessibility === "number") thr.accessibility = t.accessibility;
    if (typeof t.seo === "number") thr.seo = t.seo;
    if (typeof t.best_practices === "number")
      thr.bestPractices = t.best_practices;
    result.thresholds = thr as Thresholds;
  }

  return result;
}

export interface LoadConfigOptions {
  dir: string;
  configPath?: string;
  cliFlags?: {
    failOn?: FailOn;
    skipLighthouse?: boolean;
  };
  ciMode: boolean;
}

export function loadConfig(options: LoadConfigOptions): LaxyConfig & { ciMode: boolean } {
  const configPath =
    options.configPath ?? path.join(options.dir, ".laxy.yml");

  let base: Partial<LaxyConfig> = {};
  if (fs.existsSync(configPath)) {
    base = parseYaml(configPath);
  }

  const config: LaxyConfig = {
    ...DEFAULT_CONFIG,
    framework: base.framework ?? DEFAULT_CONFIG.framework,
    build_command: base.build_command ?? DEFAULT_CONFIG.build_command,
    dev_command: base.dev_command ?? DEFAULT_CONFIG.dev_command,
    package_manager: base.package_manager ?? DEFAULT_CONFIG.package_manager,
    port: base.port ?? DEFAULT_CONFIG.port,
    build_timeout: base.build_timeout ?? DEFAULT_CONFIG.build_timeout,
    dev_timeout: base.dev_timeout ?? DEFAULT_CONFIG.dev_timeout,
    lighthouse_runs: base.lighthouse_runs ?? DEFAULT_CONFIG.lighthouse_runs,
    fail_on: base.fail_on ?? DEFAULT_CONFIG.fail_on,
  };

  config.thresholds = { ...DEFAULT_CONFIG.thresholds, ...(base.thresholds ?? {}) };

  // CLI flag overrides
  if (options.cliFlags?.failOn !== undefined) {
    if (!VALID_FAIL_ON.includes(options.cliFlags.failOn)) {
      throw new ConfigParseError(
        `Invalid --fail-on value: "${options.cliFlags.failOn}". Must be one of: ${VALID_FAIL_ON.join(", ")}`
      );
    }
    config.fail_on = options.cliFlags.failOn;
  }

  // CI mode: apply CI defaults
  const ciMode = options.ciMode;
  if (ciMode) {
    // dev_timeout: 90s in CI
    if (!base.dev_timeout) {
      config.dev_timeout = 90;
    }
    // lighthouse_runs: default to 3 in CI, but explicit config file value wins
    if (!base.lighthouse_runs) {
      config.lighthouse_runs = 3;
    }
  }

  // Skip lighthouse: max grade is Bronze
  if (options.cliFlags?.skipLighthouse) {
    // Effectively disables Lighthouse grading
  }

  return { ...config, ciMode };
}
