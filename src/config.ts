import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import { LH_THRESHOLDS, LH_CI_THRESHOLDS } from "./verification.js";

export interface LaxyConfig {
  thresholds: {
    performance: number;
    accessibility: number;
    seo: number;
    bestPractices: number;
  };
  buildCommand?: string;
  devCommand?: string;
  port: number;
  runs: number;
}

const DEFAULT_CONFIG: LaxyConfig = {
  thresholds: { ...LH_THRESHOLDS },
  port: 3000,
  runs: 1,
};

export function loadConfig(projectPath: string, ciMode = false): { config: LaxyConfig; warnings: string[] } {
  const warnings: string[] = [];
  const configPath = join(projectPath, ".laxy.yml");

  const defaults: LaxyConfig = {
    thresholds: ciMode ? { ...LH_CI_THRESHOLDS } : { ...LH_THRESHOLDS },
    port: DEFAULT_CONFIG.port,
    runs: ciMode ? 3 : 1,
  };

  if (!existsSync(configPath)) {
    return { config: defaults, warnings };
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = parseYaml(raw);

    if (!parsed || typeof parsed !== "object") {
      warnings.push("Invalid .laxy.yml: not an object. Using defaults.");
      return { config: defaults, warnings };
    }

    const config: LaxyConfig = { ...defaults };

    if (parsed.thresholds && typeof parsed.thresholds === "object") {
      const t = parsed.thresholds;
      if (typeof t.performance === "number") config.thresholds.performance = t.performance;
      if (typeof t.accessibility === "number") config.thresholds.accessibility = t.accessibility;
      if (typeof t.seo === "number") config.thresholds.seo = t.seo;
      if (typeof t.bestPractices === "number") config.thresholds.bestPractices = t.bestPractices;
    }

    if (typeof parsed.buildCommand === "string") config.buildCommand = parsed.buildCommand;
    if (typeof parsed.devCommand === "string") config.devCommand = parsed.devCommand;
    if (typeof parsed.port === "number") config.port = parsed.port;
    if (typeof parsed.runs === "number") config.runs = Math.max(1, Math.min(parsed.runs, 5));

    return { config, warnings };
  } catch {
    warnings.push("Failed to parse .laxy.yml. Using defaults.");
    return { config: defaults, warnings };
  }
}
