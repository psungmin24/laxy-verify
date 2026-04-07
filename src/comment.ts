import * as fs from "node:fs";
import { getGitHubContext } from "./github.js";

interface LaxyResult {
  grade: string;
  lighthouse: { performance: number; accessibility: number; seo: number; bestPractices: number; runs: number } | null;
  thresholds: { performance: number; accessibility: number; seo: number; bestPractices: number };
  exitCode: number;
  config_fail_on: string;
}

export async function postPRComment(result: LaxyResult): Promise<void> {
  const ctx = getGitHubContext();
  if (!ctx || ctx.eventName !== "pull_request") return;

  // Parse PR number from event
  let prNumber = 0;
  if (ctx.eventPath && fs.existsSync(ctx.eventPath)) {
    const event = JSON.parse(fs.readFileSync(ctx.eventPath, "utf-8"));
    prNumber = event.pull_request?.number ?? 0;
  }
  if (!prNumber) return;

  const grade = (result.grade as string) ?? "Unverified";
  const lh = result.lighthouse as Record<string, number> | null;
  const t = result.thresholds as Record<string, number>;

  let lhTable = "";
  if (lh) {
    lhTable = `| Performance | Accessibility | SEO | Best Practices |\n|---|---|---|---|\n| ${lh.performance} / ${t.performance} | ${lh.accessibility} / ${t.accessibility} | ${lh.seo} / ${t.seo} | ${lh.bestPractices} / ${t.bestPractices} |\n\n`;
  }

  const emoji =
    grade === "Gold" ? "🥇" :
    grade === "Silver" ? "🥈" :
    grade === "Bronze" ? "🥉" : "⚪";

  const body = `## ${emoji} Laxy Verify — **${grade}**

${grade === "Unverified" ? "The build failed or verification could not be completed." : `Build passed verification with a **${grade}** grade.`}

${lhTable}**Fail-on threshold**: ${result.config_fail_on ?? "bronze"}

---
[🔍 Laxy Verify](https://github.com/psungmin24/laxy-verify) — Frontend quality gate`;

  const [owner, repo] = ctx.repository.split("/");
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ctx.token}`,
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body }),
    });

    if (!res.ok) {
      console.warn(`GitHub PR comment API returned ${res.status} — skipping comment`);
      return;
    }
  } catch (err) {
    console.warn(`GitHub PR comment request failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
