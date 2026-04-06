import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("loadConfig", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `laxy-config-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it("returns defaults when no .laxy.yml exists", () => {
    const { config, warnings } = loadConfig(testDir);
    expect(config.thresholds.performance).toBe(70);
    expect(config.port).toBe(3000);
    expect(config.runs).toBe(1);
    expect(warnings).toHaveLength(0);
  });

  it("uses CI thresholds when ciMode is true", () => {
    const { config } = loadConfig(testDir, true);
    expect(config.thresholds.performance).toBe(60); // relaxed by 10
    expect(config.runs).toBe(3);
  });

  it("parses custom thresholds from .laxy.yml", () => {
    writeFileSync(join(testDir, ".laxy.yml"), `
thresholds:
  performance: 50
  accessibility: 90
port: 4000
runs: 3
`);
    const { config } = loadConfig(testDir);
    expect(config.thresholds.performance).toBe(50);
    expect(config.thresholds.accessibility).toBe(90);
    expect(config.thresholds.seo).toBe(80); // default
    expect(config.port).toBe(4000);
    expect(config.runs).toBe(3);
  });

  it("warns on invalid YAML", () => {
    writeFileSync(join(testDir, ".laxy.yml"), ":::invalid yaml{{{");
    const { config, warnings } = loadConfig(testDir);
    expect(warnings.length).toBeGreaterThan(0);
    expect(config.thresholds.performance).toBe(70); // defaults
  });

  it("caps runs at 5", () => {
    writeFileSync(join(testDir, ".laxy.yml"), "runs: 100");
    const { config } = loadConfig(testDir);
    expect(config.runs).toBe(5);
  });

  it("warns on non-object YAML content", () => {
    writeFileSync(join(testDir, ".laxy.yml"), "just a string");
    const { warnings } = loadConfig(testDir);
    expect(warnings.some((w) => w.includes("not an object"))).toBe(true);
  });
});
