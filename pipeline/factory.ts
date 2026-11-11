/**
 * Production wiring: builds the real fetcher, search provider, extractor and
 * issue tracker from config + environment. Tests never use this module.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { PipelineConfig } from './config.ts';
import { PoliteFetcher, nodeFetch } from './http.ts';
import { DisabledIssueTracker, GitHubIssueTracker, githubRequest } from './issues.ts';
import { AnthropicExtractor, sdkStreamFinal } from './llm/anthropic-extractor.ts';
import { AnthropicSearchProvider, sdkCreate } from './search/anthropic.ts';
import { BraveSearchProvider, NoSearchProvider } from './search/other.ts';
import type { Clock, Extractor, IssueTracker, Logger, SearchProvider } from './types.ts';

export class ConfigError extends Error {}

/**
 * Used for keyless dry runs and for `--no-extract`: documents are fetched and
 * filtered but never sent to a model. The reason is treated as transient by
 * run.ts, so the documents are NOT marked processed and a later run with
 * extraction enabled still looks at them.
 */
export class NoKeyExtractor implements Extractor {
  readonly name = 'none';
  constructor(private readonly reason = 'no ANTHROPIC_API_KEY: extraction skipped (dry run)') {}
  async extract() {
    return { ok: false as const, reason: this.reason, usage: [] };
  }
}

export const EXTRACTION_DISABLED_REASON = 'extraction disabled (--no-extract): not sent to a model';

export interface ProductionDeps {
  search: SearchProvider;
  extractor: Extractor;
  issues: IssueTracker;
}

export function buildFetcher(config: PipelineConfig, clock: Clock, logger: Logger): PoliteFetcher {
  return new PoliteFetcher({
    userAgent: config.http.userAgent,
    timeoutMs: config.http.timeoutMs,
    minIntervalMs: config.http.minIntervalMs,
    maxBodyBytes: config.http.maxBodyBytes,
    fetchImpl: nodeFetch,
    clock,
    logger,
  });
}

export function buildProductionDeps(
  config: PipelineConfig,
  env: NodeJS.ProcessEnv,
  opts: { dryRun: boolean; issues: boolean; extract?: boolean },
): ProductionDeps {
  const extract = opts.extract ?? true;
  const needsKeyForSearch = config.searchProvider === 'anthropic';
  // With extraction off and no Anthropic search, the key is never read: no
  // client is built, so no Anthropic API call can happen (zero spend).
  const key = extract || needsKeyForSearch ? env.ANTHROPIC_API_KEY?.trim() : undefined;
  if (!key && !opts.dryRun && extract) {
    throw new ConfigError(
      'ANTHROPIC_API_KEY is not set. A live run needs it for extraction' +
        (needsKeyForSearch ? ' and search' : '') +
        '. Nothing was changed. (For a keyless test use: npm run ingest:dry -- --search none)',
    );
  }
  if (!key && needsKeyForSearch) {
    throw new ConfigError('ANTHROPIC_API_KEY is not set and the search provider is "anthropic". For a keyless dry run add --search none.');
  }
  const client = key ? new Anthropic({ apiKey: key, maxRetries: 2 }) : undefined;

  let search: SearchProvider;
  if (config.searchProvider === 'none') search = new NoSearchProvider();
  else if (config.searchProvider === 'brave') {
    const braveKey = env.BRAVE_API_KEY?.trim();
    if (!braveKey) throw new ConfigError('PIPELINE_SEARCH_PROVIDER=brave needs BRAVE_API_KEY.');
    search = new BraveSearchProvider(braveKey, nodeFetch);
  } else search = new AnthropicSearchProvider({ model: config.models.search, toolType: config.webSearchToolType, create: sdkCreate(client!) });

  const extractor: Extractor = !extract
    ? new NoKeyExtractor(EXTRACTION_DISABLED_REASON)
    : client
      ? new AnthropicExtractor({ model: config.models.extract, effort: config.extractEffort, call: sdkStreamFinal(client) })
      : new NoKeyExtractor();

  let issues: IssueTracker;
  const token = env.GITHUB_TOKEN?.trim();
  const repo = env.GITHUB_REPOSITORY?.trim();
  if (!opts.issues) issues = new DisabledIssueTracker('--no-issues');
  else if (!token || !repo) issues = new DisabledIssueTracker('GITHUB_TOKEN or GITHUB_REPOSITORY not set');
  else issues = new GitHubIssueTracker(repo, githubRequest(token));
  return { search, extractor, issues };
}
