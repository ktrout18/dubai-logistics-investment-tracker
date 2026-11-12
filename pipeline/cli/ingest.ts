/**
 * npm run ingest -- [--dry-run] [--since 7d|YYYY-MM-DD] [--source id[,id]] [--max-searches n]
 *                   [--no-issues] [--recheck n] [--search anthropic|brave|none] [--no-extract] [--json]
 *
 * Exit codes: 0 success or partial (some sources failed; a warning is printed), 2 failed / configuration error.
 * Data files are never touched when the run fails before validation passes.
 */
import { REPO_ROOT } from '../../scripts/data-files.ts';
import { todayIso } from '../../shared/index.ts';
import { loadConfig } from '../config.ts';
import { buildFetcher, buildProductionDeps } from '../factory.ts';
import { reportDigest, runIngest, sinceFromArg } from '../run.ts';
import { consoleLogger, systemClock } from '../types.ts';
import { intFlag, parseArgs } from './args.ts';

const USAGE = `Usage: npm run ingest -- [--dry-run] [--since 7d|YYYY-MM-DD] [--source id[,id]] [--max-searches n] [--no-issues] [--recheck n] [--search anthropic|brave|none] [--no-extract] [--json]

Zero-spend run (no Anthropic API call possible): --dry-run --search none --no-extract`;

async function main(): Promise<number> {
  let args;
  try {
    args = parseArgs(process.argv.slice(2), ['since', 'source', 'max-searches', 'recheck', 'search']);
  } catch (e) {
    console.error(`${(e as Error).message}\n${USAGE}`);
    return 2;
  }
  if (args.flags.has('help')) {
    console.log(USAGE);
    return 0;
  }
  const env = { ...process.env };
  const search = args.flags.get('search');
  if (typeof search === 'string') env.PIPELINE_SEARCH_PROVIDER = search;
  const dryRun = args.flags.has('dry-run');
  const issues = !args.flags.has('no-issues');
  const extract = !args.flags.has('no-extract');
  let config;
  let deps;
  try {
    config = loadConfig(env);
    deps = buildProductionDeps(config, env, { dryRun, issues, extract });
  } catch (e) {
    console.error(`ERROR ${(e as Error).message}`);
    return 2;
  }
  const zeroSpend = !extract && config.searchProvider !== 'anthropic';
  console.log(
    `mode: ${dryRun ? 'dry run' : 'LIVE (writes data/)'}; search: ${config.searchProvider}; extraction: ${extract ? config.models.extract : 'off'}; ` +
      `Anthropic API calls possible: ${zeroSpend ? 'no (zero spend)' : 'yes'}`,
  );
  const today = todayIso();
  const sourceArg = args.flags.get('source');
  const report = await runIngest(
    {
      root: REPO_ROOT,
      dryRun,
      since: sinceFromArg(typeof args.flags.get('since') === 'string' ? (args.flags.get('since') as string) : undefined, today, config.sinceDays),
      ...(typeof sourceArg === 'string' ? { sourceIds: sourceArg.split(',').map((s) => s.trim()).filter(Boolean) } : {}),
      ...(intFlag(args, 'max-searches') !== undefined ? { maxSearches: intFlag(args, 'max-searches')! } : {}),
      ...(intFlag(args, 'recheck') !== undefined ? { recheck: intFlag(args, 'recheck')! } : {}),
      issues,
    },
    { ...deps, fetcher: buildFetcher(config, systemClock, consoleLogger), clock: systemClock, logger: consoleLogger, config },
  );
  console.log('');
  console.log(report.summary);
  for (const s of report.failedSources) console.log(`  FAILED ${s.id}: ${s.note}`);
  for (const h of report.held) {
    console.log(`  HELD ${h.reviewId} (${h.kind}${h.projectId ? ` ${h.projectId}` : ''}): ${h.reasons.join('; ')}`);
    console.log(`       claim: ${h.claim ?? 'n/a'}`);
    console.log(`       evidence: ${h.url}`);
  }
  for (const p of report.published) {
    console.log(`  PUBLISHED ${p.kind} ${p.projectId}: ${p.reason}`);
    console.log(`       claim: ${p.claim ?? 'n/a'}`);
    console.log(`       evidence: ${p.url}`);
  }
  // The run report artifact is not always reachable, so the log carries the figures too.
  for (const line of reportDigest(report)) console.log(line);
  if (report.filesWritten.length) console.log(`Files written: ${report.filesWritten.join(', ')}`);
  console.log(`Report: pipeline-runs/${report.runId}${dryRun ? '-dry' : ''}.json`);
  if (args.flags.has('json')) console.log(JSON.stringify(report, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFile } = await import('node:fs/promises');
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Ingest ${report.status}\n\n${report.summary.split('\n').map((l) => `- ${l}`).join('\n')}\n\n`);
  }
  if (report.status === 'partial' && process.env.GITHUB_ACTIONS) {
    console.log(`::warning title=Ingest partial::${report.failedSources.length} source(s) could not be scanned: ${report.failedSources.map((s) => s.id).join(', ')}`);
  }
  if (report.status === 'failed' && process.env.GITHUB_ACTIONS) console.log(`::error title=Ingest failed::${report.summary.split('\n')[0]}`);
  return report.status === 'failed' ? 2 : 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(2);
  },
);
