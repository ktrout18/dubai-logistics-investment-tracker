/**
 * Non-Claude search backends.
 *
 * `NoSearchProvider` — discovery is limited to direct fetches; every
 * site_search step is reported as skipped.
 *
 * `BraveSearchProvider` — thin adapter for the Brave Search API (seam for a
 * conventional search API; Tavily or others can follow the same shape: map
 * the response to {url, title, snippet, pageAge}). Needs BRAVE_API_KEY.
 * Not exercised live in this repository (no key, host not reachable here).
 */
import type { FetchImpl, SearchProvider, SearchQuery, SearchResponse } from '../types.ts';
import { SearchError } from './anthropic.ts';

export class NoSearchProvider implements SearchProvider {
  readonly name = 'none';
  readonly available = false;
  async search(): Promise<SearchResponse> {
    throw new SearchError('no search provider configured (provider "none")');
  }
}

interface BraveResponse {
  web?: { results?: { url: string; title: string; description?: string; page_age?: string; age?: string }[] };
}

export class BraveSearchProvider implements SearchProvider {
  readonly name = 'brave';
  readonly available = true;

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: FetchImpl,
  ) {}

  async search(q: SearchQuery): Promise<SearchResponse> {
    const query = q.site ? `${q.query} site:${q.site}` : q.query;
    const params = new URLSearchParams({ q: query, count: String(Math.min(q.max, 20)) });
    if (q.after) params.set('freshness', `${q.after}to${q.before ?? new Date().toISOString().slice(0, 10)}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const res = await this.fetchImpl(`https://api.search.brave.com/res/v1/web/search?${params}`, {
        method: 'GET',
        headers: { Accept: 'application/json', 'X-Subscription-Token': this.apiKey },
        signal: controller.signal,
        redirect: 'follow',
      });
      if (res.status !== 200) throw new SearchError(`Brave search HTTP ${res.status}`);
      const data = JSON.parse(await res.text()) as BraveResponse;
      const results = (data.web?.results ?? []).map((r) => ({
        url: r.url,
        title: r.title,
        ...(r.description ? { snippet: r.description.replace(/<[^>]+>/g, '') } : {}),
        ...(r.page_age ? { pageAge: r.page_age } : {}),
      }));
      return { results: results.slice(0, q.max), usage: { inputTokens: 0, outputTokens: 0, searches: 1 } };
    } finally {
      clearTimeout(timer);
    }
  }
}
