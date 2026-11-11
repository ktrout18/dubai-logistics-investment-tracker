/**
 * GitHub Issues for pending-review items (REST API, GITHUB_TOKEN). Idempotent:
 * the review id is in the title; an existing issue (open or closed) with that
 * id is reused, never duplicated. Without a token the tracker is disabled and
 * the run logs a clear line instead.
 */
import type { IssueTracker } from './types.ts';

export type GitHubRequest = (method: 'GET' | 'POST', path: string, body?: unknown) => Promise<{ status: number; json: unknown }>;

export function githubRequest(token: string, fetchImpl: typeof fetch = fetch): GitHubRequest {
  return async (method, path, body) => {
    const res = await fetchImpl(`https://api.github.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'dubai-logistics-tracker-pipeline',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    return { status: res.status, json: text ? (JSON.parse(text) as unknown) : null };
  };
}

interface IssueJson {
  title: string;
  html_url: string;
  pull_request?: unknown;
}

export class GitHubIssueTracker implements IssueTracker {
  readonly enabled = true;
  private cache: IssueJson[] | undefined;

  constructor(
    private readonly repo: string,
    private readonly request: GitHubRequest,
  ) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error(`invalid repository "${repo}"`);
  }

  private async existing(label: string): Promise<IssueJson[]> {
    if (this.cache) return this.cache;
    const all: IssueJson[] = [];
    for (let page = 1; page <= 10; page++) {
      const r = await this.request('GET', `/repos/${this.repo}/issues?state=all&labels=${encodeURIComponent(label)}&per_page=100&page=${page}`);
      if (r.status !== 200 || !Array.isArray(r.json)) throw new Error(`listing issues failed: HTTP ${r.status}`);
      const batch = (r.json as IssueJson[]).filter((i) => !i.pull_request);
      all.push(...batch);
      if ((r.json as unknown[]).length < 100) break;
    }
    this.cache = all;
    return all;
  }

  async ensureIssue(input: { key: string; title: string; body: string; labels: string[] }): Promise<string> {
    const found = (await this.existing(input.labels[0] ?? 'pending-review')).find((i) => i.title.includes(input.key));
    if (found) return found.html_url;
    const r = await this.request('POST', `/repos/${this.repo}/issues`, { title: input.title, body: input.body, labels: input.labels });
    if (r.status !== 201) throw new Error(`creating issue failed: HTTP ${r.status}`);
    const issue = r.json as IssueJson;
    this.cache?.push(issue);
    return issue.html_url;
  }
}

export class DisabledIssueTracker implements IssueTracker {
  readonly enabled = false;
  constructor(readonly reason: string) {}
  async ensureIssue(): Promise<string> {
    throw new Error(`issue tracker disabled: ${this.reason}`);
  }
}
