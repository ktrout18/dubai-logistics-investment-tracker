/**
 * Interfaces for every external effect (network, model, clock, GitHub, log) so
 * tests can inject deterministic fakes. Production implementations live next
 * to each concern (http.ts, search/*.ts, llm/*.ts, issues.ts).
 */
import type { ScanStatus, SourceType, VerificationLevel } from '../shared/index.ts';

export interface Clock {
  now(): Date;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => new Date(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export const consoleLogger: Logger = {
  info: (m) => console.log(m),
  warn: (m) => console.warn(`WARN ${m}`),
  error: (m) => console.error(`ERROR ${m}`),
};

export const silentLogger: Logger = { info: () => {}, warn: () => {}, error: () => {} };

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

/** Minimal response shape; production wraps global fetch, tests return canned pages. */
export interface RawResponse {
  status: number;
  url: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export type FetchImpl = (
  url: string,
  init: { method: 'GET' | 'HEAD'; headers: Record<string, string>; signal: AbortSignal; redirect: 'follow' },
) => Promise<RawResponse>;

/**
 * Outcome classes. `blocked` = the site refused us (401/403/429/451, CAPTCHA);
 * `dead` = gone (404/410, DNS failure); `robots_disallowed` = we chose not to fetch.
 */
export type FetchOutcome = 'ok' | 'blocked' | 'dead' | 'robots_disallowed' | 'timeout' | 'server_error' | 'network_error' | 'not_text';

export interface FetchResult {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  outcome: FetchOutcome;
  contentType: string;
  body: string;
  note?: string;
}

export interface Fetcher {
  get(url: string, opts?: { minIntervalMs?: number; accept?: string }): Promise<FetchResult>;
  head(url: string, opts?: { minIntervalMs?: number }): Promise<FetchResult>;
  /** Every URL successfully fetched this run (normalised); used by grounding checks. */
  fetchedUrls(): ReadonlySet<string>;
  requestCount(): number;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchQuery {
  query: string;
  /** Restrict to this host (and its subdomains). */
  site?: string;
  /** ISO date; results older than this are filtered when the provider exposes a date. */
  after?: string;
  before?: string;
  max: number;
}

export interface SearchResult {
  url: string;
  title: string;
  /** Text the search backend quoted from the page (never the model's own prose). */
  snippet?: string;
  /** Page age / published date as reported by the backend, if any (raw string). */
  pageAge?: string;
}

export interface SearchUsage {
  model?: string;
  inputTokens: number;
  outputTokens: number;
  searches: number;
}

export interface SearchResponse {
  results: SearchResult[];
  usage: SearchUsage;
}

export interface SearchProvider {
  readonly name: string;
  /** False for the `none` provider: discovery then relies on direct fetches only. */
  readonly available: boolean;
  search(q: SearchQuery): Promise<SearchResponse>;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/** A page we have text for. `direct` = page text read; `indexed` = search snippet only. */
export interface DocumentRecord {
  url: string;
  title: string;
  text: string;
  publishedDate?: string;
  verification: Extract<VerificationLevel, 'direct' | 'indexed'>;
  sourceId: string;
  sourceName: string;
  publisher: string;
  tier: SourceType;
  /** How we found it, e.g. "html_list", "sitemap", "site_search", "recheck". */
  foundVia: string;
  /** For rechecks: the project the search was about. */
  recheckProjectId?: string;
}

// ---------------------------------------------------------------------------
// LLM extraction
// ---------------------------------------------------------------------------

export interface LlmUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}

export type ExtractionOutcome =
  | { ok: true; json: unknown; usage: LlmUsage[] }
  | { ok: false; reason: string; usage: LlmUsage[] };

export interface Extractor {
  readonly name: string;
  extract(input: { system: string; user: string; jsonSchema: Record<string, unknown> }): Promise<ExtractionOutcome>;
}

// ---------------------------------------------------------------------------
// GitHub issues
// ---------------------------------------------------------------------------

export interface IssueTracker {
  readonly enabled: boolean;
  /** Find an existing issue whose title contains `key`; otherwise create one. Returns its html URL. */
  ensureIssue(input: { key: string; title: string; body: string; labels: string[] }): Promise<string>;
}

// ---------------------------------------------------------------------------
// Source config (data/sources.json)
// ---------------------------------------------------------------------------

export type AccessMethodType = 'rss' | 'sitemap' | 'html_list' | 'alt_url' | 'site_search';

export interface SourceScanResult {
  sourceId: string;
  name: string;
  status: ScanStatus;
  method?: string;
  note?: string;
  documents: number;
  attempts: { method: string; url?: string; result: string }[];
}
