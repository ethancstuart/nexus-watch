import { fetchWithRetry } from '../utils/fetch.ts';
import type { GitHubData } from '../types/index.ts';

export async function fetchGitHubActivity(username: string): Promise<GitHubData> {
  const res = await fetchWithRetry(`/api/github?username=${encodeURIComponent(username)}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data as GitHubData;
}
