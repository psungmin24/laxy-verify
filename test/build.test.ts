import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runBuild } from "../src/build.js";

const tmpDirs: string[] = [];

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("runBuild", () => {
  it("runs in the provided project directory", async () => {
    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "laxy-verify-build-"));
    tmpDirs.push(fixtureDir);

    fs.writeFileSync(
      path.join(fixtureDir, "package.json"),
      JSON.stringify(
        {
          name: "cwd-fixture",
          private: true,
          scripts: {
            build: "node build.js",
          },
        },
        null,
        2
      )
    );
    fs.writeFileSync(
      path.join(fixtureDir, "build.js"),
      "const fs = require('node:fs'); const path = require('node:path'); fs.writeFileSync(path.join(process.cwd(), 'build-output.txt'), process.cwd(), 'utf8');"
    );

    const result = await runBuild("npm run build", 10, fixtureDir);

    expect(result.success).toBe(true);
    expect(fs.readFileSync(path.join(fixtureDir, "build-output.txt"), "utf8")).toBe(fixtureDir);
  });
});
