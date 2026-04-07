import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { detect } from "../src/detect.js";

function createTempDir(pkg: Record<string, unknown>, lockfiles: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "laxy-detect-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2));
  for (const lf of lockfiles) {
    fs.writeFileSync(path.join(dir, lf), "");
  }
  return dir;
}

describe("detect", () => {
  it("detects Next.js from package.json", () => {
    const dir = createTempDir(
      { scripts: { build: "next build" }, dependencies: { next: "14.0.0" } },
      ["package-lock.json"]
    );
    const result = detect(dir);
    expect(result.framework).toBe("nextjs");
    expect(result.port).toBe(3000);
    fs.rmSync(dir, { recursive: true });
  });

  it("detects Vite from package.json", () => {
    const dir = createTempDir(
      { scripts: { build: "vite build" }, devDependencies: { vite: "5.0.0" } },
      ["pnpm-lock.yaml"]
    );
    const result = detect(dir);
    expect(result.framework).toBe("vite");
    expect(result.packageManager).toBe("pnpm");
    expect(result.port).toBe(5173);
    fs.rmSync(dir, { recursive: true });
  });

  it("detects CRA from react-scripts", () => {
    const dir = createTempDir(
      { scripts: { build: "react-scripts build" }, dependencies: { "react-scripts": "5.0.0" } },
      ["yarn.lock"]
    );
    const result = detect(dir);
    expect(result.framework).toBe("cra");
    expect(result.packageManager).toBe("yarn");
    fs.rmSync(dir, { recursive: true });
  });

  it("returns null framework for unknown project", () => {
    const dir = createTempDir(
      { scripts: { build: "esbuild src/index.ts" } },
      ["bun.lockb"]
    );
    const result = detect(dir);
    expect(result.framework).toBeNull();
    expect(result.packageManager).toBe("bun");
    fs.rmSync(dir, { recursive: true });
  });

  it("throws when no package.json", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "laxy-detect-"));
    expect(() => detect(dir)).toThrow("Not a Node.js project");
    fs.rmSync(dir, { recursive: true });
  });

  it("throws when no build script", () => {
    const dir = createTempDir({ scripts: { start: "node index.js" } }, []);
    expect(() => detect(dir)).toThrow("No 'build' script found");
    fs.rmSync(dir, { recursive: true });
  });
});
