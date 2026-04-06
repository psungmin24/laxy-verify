import { describe, it, expect } from "vitest";
import { parseBuildOutput } from "../src/build-runner.js";

describe("parseBuildOutput", () => {
  it("parses TypeScript errors", () => {
    const output = `src/index.ts(10,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.`;
    const { errors, structuredErrors } = parseBuildOutput(output);
    expect(errors).toHaveLength(1);
    expect(structuredErrors[0].code).toBe("TS2345");
    expect(structuredErrors[0].file).toBe("src/index.ts");
    expect(structuredErrors[0].line).toBe(10);
    expect(structuredErrors[0].col).toBe(5);
  });

  it("parses Module not found errors", () => {
    const output = `Module not found: Error: Can't resolve '@/components/Foo'`;
    const { errors } = parseBuildOutput(output);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Module not found");
  });

  it("parses SyntaxError", () => {
    const output = `SyntaxError: Unexpected token '<'`;
    const { errors } = parseBuildOutput(output);
    expect(errors).toHaveLength(1);
  });

  it("separates warnings from errors", () => {
    const output = [
      "warning: some deprecation notice",
      "error TS2345: type mismatch",
      "warn: unused variable",
    ].join("\n");
    const { errors, warnings } = parseBuildOutput(output);
    expect(errors).toHaveLength(1);
    expect(warnings).toHaveLength(2);
  });

  it("handles empty output", () => {
    const { errors, warnings } = parseBuildOutput("");
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it("caps errors at 20", () => {
    const lines = Array.from({ length: 30 }, (_, i) =>
      `Module not found: Can't resolve 'pkg${i}'`
    ).join("\n");
    const { errors } = parseBuildOutput(lines);
    expect(errors.length).toBeLessThanOrEqual(20);
  });
});
