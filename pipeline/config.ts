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
  /** Hard cap on searches per run (all purposes). 20 covers the site-search fallbacks of blocked primary sources (about 5 a run), 5 rechecks and blocked-article fallbacks. */
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
  /**
   * Scan sources whose only access method is site search. Off by default: in
   * three paid runs (12 Nov 2026) none of their results reached extraction.
   * Site search stays on as a fallback for sources with a direct method, and
   * for the rotating recheck. Env: PIPELINE_SEARCH_ONLY_SOURCES=on.
   */
  searchOnlySources: boolean;
  /** Claims removed from the review queue before the decision (pipeline/triage.ts). */
  triage: {
    /** Claim kinds that are not register material; skipped and counted in the run report. */
    skipClaimKinds: string[];
    /** Places outside the UAE; a claim naming one (and nothing in Dubai or an emirate) is skipped. */
    foreignPlaces: string[];
    /** Places in other emirates not covered by the known zones in shared/normalise.ts. */
    otherEmiratePlaces: Record<string, 'Abu Dhabi' | 'Sharjah' | 'Fujairah' | 'Ajman' | 'Ras Al Khaimah' | 'Umm Al Quwain'>;
    /** Most regional mentions kept in data/pipeline-state.json (oldest dropped first). */
    maxRegionalMentions: number;
  };
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
  maxSearchesPerRun: 20,
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
  searchOnlySources: false,
  triage: {
    skipClaimKinds: ['corridor_or_route', 'service', 'market_commentary'],
    foreignPlaces: [
      'Saudi Arabia', 'KSA', 'Riyadh', 'Jeddah', 'Dammam', 'NEOM', 'Oman', 'Muscat', 'Sohar', 'Duqm', 'Salalah', 'Qatar', 'Doha', 'Bahrain', 'Kuwait',
      'Egypt', 'Cairo', 'Iraq', 'Jordan', 'Turkey', 'Azerbaijan', 'Baku', 'Alat', 'Kazakhstan', 'Uzbekistan', 'Pakistan', 'Karachi', 'India', 'Mumbai', 'Delhi',
      'China', 'Hong Kong', 'Singapore', 'Australia', 'Sydney', 'Melbourne', 'New Zealand', 'United Kingdom', 'UK', 'London', 'England', 'Ireland', 'Germany',
      'Netherlands', 'Rotterdam', 'Belgium', 'France', 'Italy', 'Spain', 'Switzerland', 'Zurich', 'United States', 'USA', 'Canada', 'Brazil', 'Kenya', 'Nigeria',
      'South Africa', 'Morocco', 'Senegal', 'Africa', 'Europe',
    ],
    otherEmiratePlaces: {
      'Abu Dhabi': 'Abu Dhabi', 'Al Ain': 'Abu Dhabi', 'Khalifa Port': 'Abu Dhabi', 'Al Dhafra': 'Abu Dhabi', 'Ruwais': 'Abu Dhabi', 'Mussafah': 'Abu Dhabi',
      'Sharjah': 'Sharjah', 'Khor Fakkan': 'Sharjah', 'Fujairah': 'Fujairah', 'Dibba': 'Fujairah', 'Ajman': 'Ajman', 'Ras Al Khaimah': 'Ras Al Khaimah',
      'RAK': 'Ras Al Khaimah', 'Umm Al Quwain': 'Umm Al Quwain',
    },
    maxRegionalMentions: 300,
  },
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
  if (env.PIPELINE_SEARCH_ONLY_SOURCES) {
    const v = env.PIPELINE_SEARCH_ONLY_SOURCES.toLowerCase();
    if (v !== 'on' && v !== 'off') throw new Error('PIPELINE_SEARCH_ONLY_SOURCES must be on or off');
    c.searchOnlySources = v === 'on';
  }
  if (env.PIPELINE_USER_AGENT) c.http.userAgent = env.PIPELINE_USER_AGENT;
  else if (env.GITHUB_REPOSITORY) {
    c.http.userAgent = c.http.userAgent.replace('(', `(+https://github.com/${env.GITHUB_REPOSITORY}; `);
  }
  return c;
}
