/**
 * npm audit wrapper for Pro/Pro+ security scanning.
 *
 * Runs `npm audit --json` in the project directory and extracts
 * severity counts + a short summary for the verification report.
 */
import { spawn } from "node:child_process";

export interface SecurityAuditResult {
  totalVulnerabilities: number;
  critical: number;
  high: number;
  moderate: number;
  low: number;
  summary: string;
}

export async function runSecurityAudit(cwd: string, timeoutMs = 30000): Promise<SecurityAuditResult> {
  console.log("  Running security audit (npm audit)...");

  return new Promise<SecurityAuditResult>((resolve) => {
    const chunks: string[] = [];
    const proc =
      process.platform === "win32"
        ? spawn(process.env.ComSpec || "cmd.exe", ["/d", "/c", "npm audit --json"], {
            stdio: ["ignore", "pipe", "pipe"],
            cwd,
          })
        : spawn("npm", ["audit", "--json"], {
            shell: true,
            stdio: ["ignore", "pipe", "pipe"],
            cwd,
          });

    const timer = setTimeout(() => {
      try { proc.kill(); } catch {}
      resolve({ totalVulnerabilities: 0, critical: 0, high: 0, moderate: 0, low: 0, summary: "Audit timed out" });
    }, timeoutMs);

    proc.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));
    proc.stderr?.on("data", () => {}); // ignore stderr

    proc.on("exit", () => {
      clearTimeout(timer);
      const raw = chunks.join("");

      try {
        const json = JSON.parse(raw);
        // npm audit v2 format
        const meta = json.metadata?.vulnerabilities ?? json.vulnerabilities ?? {};
        const critical = meta.critical ?? 0;
        const high = meta.high ?? 0;
        const moderate = meta.moderate ?? 0;
        const low = meta.low ?? 0;
        const total = critical + high + moderate + low;

        const parts: string[] = [];
        if (critical > 0) parts.push(`${critical} critical`);
        if (high > 0) parts.push(`${high} high`);
        if (moderate > 0) parts.push(`${moderate} moderate`);
        if (low > 0) parts.push(`${low} low`);
        const summary = total === 0 ? "No known vulnerabilities" : parts.join(", ");

        console.log(`  Security: ${summary}`);
        resolve({ totalVulnerabilities: total, critical, high, moderate, low, summary });
      } catch {
        resolve({ totalVulnerabilities: 0, critical: 0, high: 0, moderate: 0, low: 0, summary: "Audit parse failed" });
      }
    });
  });
}
