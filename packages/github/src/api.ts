import { fetchWithRetry } from "./retry";

const GITHUB_API_BASE = "https://api.github.com";

function authHeaders(installationToken: string): Record<string, string> {
  return {
    Authorization: `token ${installationToken}`,
    Accept: "application/vnd.github+json",
  };
}

async function githubGet<T>(path: string, installationToken: string): Promise<T> {
  const response = await fetchWithRetry(`${GITHUB_API_BASE}${path}`, { headers: authHeaders(installationToken) });
  if (!response.ok) {
    throw new Error(`GitHub API ${path} failed: ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

export interface GithubRepo {
  fullName: string;
  name: string;
  owner: string;
  defaultBranch: string;
  isPrivate: boolean;
}

/** Repos are exactly what was granted at install time - never a broader scope than the user chose. */
export async function listInstallationRepositories(installationToken: string): Promise<GithubRepo[]> {
  const body = await githubGet<{
    repositories: Array<{
      full_name: string;
      name: string;
      owner: { login: string };
      default_branch: string;
      private: boolean;
    }>;
  }>("/installation/repositories?per_page=100", installationToken);

  return body.repositories.map((repo) => ({
    fullName: repo.full_name,
    name: repo.name,
    owner: repo.owner.login,
    defaultBranch: repo.default_branch,
    isPrivate: repo.private,
  }));
}

export async function listBranches(
  installationToken: string,
  owner: string,
  repo: string,
): Promise<string[]> {
  const body = await githubGet<Array<{ name: string }>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100`,
    installationToken,
  );
  return body.map((branch) => branch.name);
}

/** Uses the raw media type so the response body is the file's actual bytes, not a base64-wrapped JSON envelope. */
export async function getFileContent(
  installationToken: string,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<string> {
  const encodedPath = path
    .split("/")
    .filter((segment) => segment.length > 0)
    .map(encodeURIComponent)
    .join("/");
  const response = await fetchWithRetry(
    `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
    {
      headers: {
        Authorization: `token ${installationToken}`,
        Accept: "application/vnd.github.raw+json",
      },
    },
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}: ${response.status} ${await response.text()}`);
  }
  return response.text();
}

export interface LatestCommit {
  sha: string;
  message: string;
  author: string;
}

export async function getLatestCommit(
  installationToken: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<LatestCommit> {
  const body = await githubGet<{
    sha: string;
    commit: { message: string; author: { name: string } };
  }>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(branch)}`,
    installationToken,
  );
  return { sha: body.sha, message: body.commit.message, author: body.commit.author.name };
}
