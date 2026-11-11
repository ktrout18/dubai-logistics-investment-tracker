/**
 * Polite HTTP fetcher: one request at a time, honest User-Agent, robots.txt
 * obeyed, per-host minimum interval, timeout, and NO retries (a refusal is
 * recorded, never worked around). CAPTCHA / challenge pages count as blocked.
 */
import { normaliseUrl } from '../shared/index.ts';
import type { Clock, FetchImpl, FetchOutcome, FetchResult, Fetcher, Logger, RawResponse } from './types.ts';
import { isAllowed, parseRobots, type RobotsRules } from './robots.ts';

export interface PoliteFetcherOptions {
  userAgent: string;
  timeoutMs: number;
  minIntervalMs: number;
  maxBodyBytes: number;
  fetchImpl: FetchImpl;
  clock: Clock;
  logger: Logger;
  /** Skip robots.txt (only for tests of other behaviour). */
  ignoreRobots?: boolean;
}

const CHALLENGE_RE = /captcha|cf-chl-|challenge-platform|attention required|are you a robot|access denied|request unsuccessful\. incapsula|one moment, please|request is being verified|checking your browser|just a moment\.\.\./i;

export function classifyStatus(status: number): FetchOutcome {
  if (status >= 200 && status < 300) return 'ok';
  if (status === 401 || status === 403 || status === 429 || status === 451) return 'blocked';
  if (status === 404 || status === 410) return 'dead';
  if (status >= 500) return 'server_error';
  return 'server_error';
}

/** Production fetch implementation (global fetch, Node 22). */
export const nodeFetch: FetchImpl = async (url, init) => {
  const res = await fetch(url, init);
  return { status: res.status, url: res.url || url, headers: res.headers, text: () => res.text() } satisfies RawResponse;
};

export class PoliteFetcher implements Fetcher {
  private readonly robots = new Map<string, RobotsRules>();
  private readonly lastRequestAt = new Map<string, number>();
  private readonly fetched = new Set<string>();
  private count = 0;

  constructor(private readonly o: PoliteFetcherOptions) {}

  fetchedUrls(): ReadonlySet<string> {
    return this.fetched;
  }

  requestCount(): number {
    return this.count;
  }

  async get(url: string, opts: { minIntervalMs?: number; accept?: string } = {}): Promise<FetchResult> {
    return this.request('GET', url, opts);
  }

  async head(url: string, opts: { minIntervalMs?: number } = {}): Promise<FetchResult> {
    return this.request('HEAD', url, opts);
  }

  private async waitTurn(host: string, minIntervalMs: number): Promise<void> {
    const last = this.lastRequestAt.get(host);
    const now = this.o.clock.now().getTime();
    if (last !== undefined) {
      const wait = last + minIntervalMs - now;
      if (wait > 0) await this.o.clock.sleep(wait);
    }
    this.lastRequestAt.set(host, this.o.clock.now().getTime());
  }

  private async rawRequest(
    method: 'GET' | 'HEAD',
    url: string,
    minIntervalMs: number,
    accept: string,
  ): Promise<{ res?: RawResponse; body: string; outcome?: FetchOutcome; note?: string }> {
    const host = new URL(url).host;
    await this.waitTurn(host, minIntervalMs);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.o.timeoutMs);
    this.count++;
    try {
      const res = await this.o.fetchImpl(url, {
        method,
        headers: { 'User-Agent': this.o.userAgent, Accept: accept, 'Accept-Language': 'en' },
        signal: controller.signal,
        redirect: 'follow',
      });
      let body = method === 'HEAD' ? '' : await res.text();
      if (body.length > this.o.maxBodyBytes) body = body.slice(0, this.o.maxBodyBytes);
      return { res, body };
    } catch (e) {
      const err = e as Error & { cause?: { code?: string } };
      if (err.name === 'AbortError' || controller.signal.aborted) return { body: '', outcome: 'timeout', note: `timeout after ${this.o.timeoutMs} ms` };
      const code = err.cause?.code ?? '';
      if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return { body: '', outcome: 'dead', note: `DNS: ${code}` };
      return { body: '', outcome: 'network_error', note: `${code || err.name}: ${err.message}` };
    } finally {
      clearTimeout(timer);
    }
  }

  private async robotsFor(origin: string, minIntervalMs: number): Promise<RobotsRules> {
    const cached = this.robots.get(origin);
    if (cached) return cached;
    const { res, body, outcome, note } = await this.rawRequest('GET', `${origin}/robots.txt`, minIntervalMs, 'text/plain');
    let rules: RobotsRules;
    if (!res) {
      // Unreachable robots.txt: be conservative and do not crawl this origin this run.
      rules = { disallowAll: true, note: `robots.txt unreachable (${outcome}${note ? `: ${note}` : ''})`, groups: [] };
    } else if (res.status >= 200 && res.status < 300) {
      rules = parseRobots(body);
    } else if (res.status >= 500) {
      rules = { disallowAll: true, note: `robots.txt answered HTTP ${res.status}`, groups: [] }; // RFC 9309: 5xx = complete disallow
    } else {
      rules = { disallowAll: false, groups: [] }; // 4xx: no restrictions published
    }
    this.robots.set(origin, rules);
    return rules;
  }

  private async request(
    method: 'GET' | 'HEAD',
    url: string,
    opts: { minIntervalMs?: number; accept?: string },
  ): Promise<FetchResult> {
    const minInterval = opts.minIntervalMs ?? this.o.minIntervalMs;
    const base: FetchResult = { requestedUrl: url, finalUrl: url, status: 0, outcome: 'network_error', contentType: '', body: '' };
    let parsed: URL;
    try {
      parsed = new URL(url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('not http');
    } catch {
      return { ...base, outcome: 'dead', note: 'invalid URL' };
    }
    if (!this.o.ignoreRobots) {
      const rules = await this.robotsFor(parsed.origin, minInterval);
      if (!isAllowed(rules, this.o.userAgent, `${parsed.pathname}${parsed.search}`)) {
        return { ...base, outcome: 'robots_disallowed', note: rules.disallowAll ? rules.note ?? 'robots.txt disallows all' : 'disallowed by robots.txt' };
      }
    }
    const accept = opts.accept ?? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5';
    const { res, body, outcome, note } = await this.rawRequest(method, url, minInterval, accept);
    if (!res) return { ...base, outcome: outcome ?? 'network_error', ...(note ? { note } : {}) };
    const contentType = res.headers.get('content-type') ?? '';
    let cls = classifyStatus(res.status);
    let resultNote: string | undefined;
    if ((cls === 'ok' || res.status === 503) && method === 'GET' && body.length < 20_000 && CHALLENGE_RE.test(body.slice(0, 5000)) && !/<article/i.test(body)) {
      cls = 'blocked';
      resultNote = 'challenge/CAPTCHA page (not bypassed)';
    }
    if (cls === 'ok' && method === 'GET' && contentType && !/text|xml|html|json|rss|atom/i.test(contentType)) {
      cls = 'not_text';
      resultNote = `content-type ${contentType}`;
    }
    if (cls === 'ok') this.fetched.add(normaliseUrl(res.url || url));
    if (cls === 'ok') this.fetched.add(normaliseUrl(url));
    return {
      requestedUrl: url,
      finalUrl: res.url || url,
      status: res.status,
      outcome: cls,
      contentType,
      body: cls === 'ok' ? body : '',
      ...(resultNote ? { note: resultNote } : res.status >= 300 ? { note: `HTTP ${res.status}` } : {}),
    };
  }
}
