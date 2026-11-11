/**
 * Pipeline configuration: models, prices, caps and politeness settings.
 * Every number that affects spend or load on source sites lives here.
 * Environment variables (documented in .env.example) override the defaults.
 */

export interface ModelPrice {
  /** USD per million input tokens. */
  inputPerMTok: number;
  /** USD per million output tokens. */
  outputPerMTok: number;
}

export interface PipelineConfig {
  models: {
    /** Search sweep (cheap). Owner-fixed: claude-haiku-5-5. */
    search: string;
    /** Extraction of candidate facts from fetched text. Owner-fixed: claude-opus-5-5. */
    extract: string;
  };
  /**
   * Server web-search tool version sent with the search model. Claude Haiku 5.5 is
   * not on the list of models that take the dynamic-filtering `web_search_20260209`
   * variant, so the basic variant is the default.
   */
  webSearchToolType: 'web_search_20250305' | 'web_search_20260209';
  /** Effort for the extraction model (Opus 5.5 defaults to medium; we set it explicitly). */
  extractEffort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  /** List prices in USD, used only for the cost log. */
  prices: Record<string, ModelPrice>;
  /** USD per web search (server tool). */
  webSearchPricePerSearch: number;
  /** Search backend: anthropic (Claude + server web search), brave, or none (direct fetch only). */
  searchProvider: 'anthropic' | 'brave' | 'none';
  /** Hard cap on searches per run (all purposes). */
  maxSearchesPerRun: number;
  /** Hard cap on extraction (LLM) calls per run. Extra documents wait for the next run. */
  maxExtractionsPerRun: number;
  /** Results requested per search. */
  resultsPerSearch: number;
  /** New article pages fetched per source per run. */
  maxArticlesPerSource: number;
  /** Documents longer than this (characters of readable text) are not sent to the model. */
  maxDocumentChars: number;
  /** Active projects rechecked per run. */
  recheckPerRun: number;
  /** Default discovery window in days (`--since`). */
  sinceDays: number;
  http: {
    userAgent: string;
    timeoutMs: number;
    /** Default minimum gap between two requests to the same host. */
    minIntervalMs: number;
    /** Max response body read, in bytes. */
    maxBodyBytes: number;
  };
  /** Number of past run summaries kept in data/pipeline-state.json. */
  runHistoryLength: number;
}

const DEFAULT_PRICES: Record<string, ModelPrice> = {
  // List prices given by the owner (Haiku 5.5 price applies to prompts ≤ 100K tokens).
  'claude-haiku-5-5': { inputPerMTok: 0.1, outputPerMTok: 0.5 },
  'claude-opus-5-5': { inputPerMTok: 4, outputPerMTok: 20 },
};

export const DEFAULT_CONFIG: PipelineConfig = {
  models: { search: 'claude-haiku-5-5', extract: 'claude-opus-5-5' },
  webSearchToolType: 'web_search_20250305',
  extractEffort: 'high',
  prices: DEFAULT_PRICES,
  webSearchPricePerSearch: 10 / 1000,
  searchProvider: 'anthropic',
  maxSearchesPerRun: 40,
  maxExtractionsPerRun: 25,
  resultsPerSearch: 8,
  maxArticlesPerSource: 8,
  maxDocumentChars: 120_000,
  recheckPerRun: 5,
  sinceDays: 7,
  http: {
    userAgent:
      'DubaiLogisticsTracker/0.1 (public-interest register of announced logistics projects; polite crawler, obeys robots.txt)',
    timeoutMs: 20_000,
    minIntervalMs: 3_000,
    maxBodyBytes: 4 * 1024 * 1024,
  },
  runHistoryLength: 30,
};

function intEnv(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${key} must be a non-negative number (got "${raw}")`);
  return Math.floor(n);
}

/** Build the effective config from defaults + environment overrides. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): PipelineConfig {
  const c: PipelineConfig = structuredClone(DEFAULT_CONFIG);
  if (env.PIPELINE_SEARCH_MODEL) c.models.search = env.PIPELINE_SEARCH_MODEL;
  if (env.PIPELINE_EXTRACT_MODEL) c.models.extract = env.PIPELINE_EXTRACT_MODEL;
  if (env.PIPELINE_WEB_SEARCH_TOOL) {
    if (env.PIPELINE_WEB_SEARCH_TOOL !== 'web_search_20250305' && env.PIPELINE_WEB_SEARCH_TOOL !== 'web_search_20260209') {
      throw new Error(`PIPELINE_WEB_SEARCH_TOOL must be web_search_20250305 or web_search_20260209`);
    }
    c.webSearchToolType = env.PIPELINE_WEB_SEARCH_TOOL;
  }
  if (env.PIPELINE_SEARCH_PROVIDER) {
    const p = env.PIPELINE_SEARCH_PROVIDER;
    if (p !== 'anthropic' && p !== 'brave' && p !== 'none') throw new Error(`PIPELINE_SEARCH_PROVIDER must be anthropic, brave or none`);
    c.searchProvider = p;
  }
  c.maxSearchesPerRun = intEnv(env, 'PIPELINE_MAX_SEARCHES', c.maxSearchesPerRun);
  c.maxExtractionsPerRun = intEnv(env, 'PIPELINE_MAX_EXTRACTIONS', c.maxExtractionsPerRun);
  c.recheckPerRun = intEnv(env, 'PIPELINE_RECHECK', c.recheckPerRun);
  c.maxArticlesPerSource = intEnv(env, 'PIPELINE_MAX_ARTICLES_PER_SOURCE', c.maxArticlesPerSource);
  c.http.minIntervalMs = intEnv(env, 'PIPELINE_MIN_INTERVAL_MS', c.http.minIntervalMs);
  if (env.PIPELINE_USER_AGENT) c.http.userAgent = env.PIPELINE_USER_AGENT;
  else if (env.GITHUB_REPOSITORY) {
    c.http.userAgent = c.http.userAgent.replace('(', `(+https://github.com/${env.GITHUB_REPOSITORY}; `);
  }
  return c;
}
