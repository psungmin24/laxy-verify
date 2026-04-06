import { describe, it, expect } from "vitest";
import { resolve } from "path";
import { runBuild } from "../src/build-runner.js";

const FIXTURES = resolve(import.meta.dirname, "fixtures");

describe("integration: broken-build fixture", () => {
  it("reports build failure", async () => {
    const result = await runBuild(resolve(FIXTURES, "broken-build"));
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.duration).toBeGreaterThan(0);
  });

  it("captures TypeScript error in output", async () => {
    const result = await runBuild(resolve(FIXTURES, "broken-build"));
    expect(result.errors.some((e) => e.includes("TS2345"))).toBe(true);
  });
});

describe("integration: healthy-nextjs fixture", () => {
  it("reports build success", async () => {
    const result = await runBuild(resolve(FIXTURES, "healthy-nextjs"));
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.duration).toBeGreaterThan(0);
  });
});
