import { getGitHubContext } from "./github.js";

interface StatusResult {
  grade: string;
  exitCode: number;
}

export async function createStatusCheck(result: StatusResult): Promise<void> {
  const ctx = getGitHubContext();
  if (!ctx) return;

  const [owner, repo] = ctx.repository.split("/");

  const description = `Laxy Verify — ${result.grade}`;
  const state = result.exitCode === 0 ? "success" : "failure";
  const targetUrl = `${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${ctx.repository}/actions/runs/${process.env.GITHUB_RUN_ID ?? ""}`;

  const url = `https://api.github.com/repos/${owner}/${repo}/statuses/${ctx.sha}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        state,
        description,
        target_url: targetUrl,
        context: "laxy-verify",
      }),
    });

    if (!res.ok) {
      console.warn(`GitHub Status Check API returned ${res.status} — skipping status`);
    }
  } catch (err) {
    console.warn(`GitHub Status Check request failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
