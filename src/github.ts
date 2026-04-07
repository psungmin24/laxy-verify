export interface GitHubContext {
  token: string;
  repository: string;
  sha: string;
  eventPath?: string;
  eventName: string;
}

export function getGitHubContext(): GitHubContext | null {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const sha = process.env.GITHUB_SHA;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const eventName = process.env.GITHUB_EVENT_NAME ?? "";

  if (!token || !repository || !sha) {
    return null;
  }

  return { token, repository, sha, eventPath, eventName };
}
