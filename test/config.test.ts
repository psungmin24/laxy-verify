import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadConfig, ConfigParseError } from "../src/config.js";

function writeConfig(dir: string, content: string): void {
  fs.writeFileSync(path.join(dir, ".laxy.yml"), content);
}

describe(".laxy.yml parsing", () => {
  it("applies defaults when no config file exists", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "laxy-config-"));
    const config = loadConfig({ dir, ciMode: false });
    expect(config.fail_on).toBe("bronze");
    expect(config.thresholds.performance).toBe(70);
    expect(config.lighthouse_runs).toBe(1);
    fs.rmSync(dir, { recursive: true });
  });

  it("overrides defaults from .laxy.yml", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "laxy-config-"));
    writeConfig(dir, "fail_on: silver\nthresholds:\n  performance: 80\n");
    const config = loadConfig({ dir, ciMode: false });
    expect(config.fail_on).toBe("silver");
    expect(config.thresholds.performance).toBe(80);
    expect(config.thresholds.accessibility).toBe(85); // default
    fs.rmSync(dir, { recursive: true });
  });

  it("throws on invalid fail_on value", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "laxy-config-"));
    writeConfig(dir, "fail_on: platinum\n");
    expect(() => loadConfig({ dir, ciMode: false })).toThrow("Invalid fail_on value");
    fs.rmSync(dir, { recursive: true });
  });

  it("CLI failOn overrides config file value", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "laxy-config-"));
    writeConfig(dir, "fail_on: bronze\n");
    const config = loadConfig({ dir, ciMode: false, cliFlags: { failOn: "gold" } });
    expect(config.fail_on).toBe("gold");
    fs.rmSync(dir, { recursive: true });
  });

  it("CI mode sets lighthouse_runs to 3 when not in config", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "laxy-config-"));
    writeConfig(dir, "fail_on: silver\n");
    const config = loadConfig({ dir, ciMode: true });
    expect(config.lighthouse_runs).toBe(3);
    expect(config.dev_timeout).toBe(90);
    fs.rmSync(dir, { recursive: true });
  });

  it("explicit config file value wins over CI mode default for lighthouse_runs", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "laxy-config-"));
    writeConfig(dir, "lighthouse_runs: 5\n");
    const config = loadConfig({ dir, ciMode: true });
    expect(config.lighthouse_runs).toBe(5);
    fs.rmSync(dir, { recursive: true });
  });
});
