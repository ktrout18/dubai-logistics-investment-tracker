/**
 * npm run check-links -- [--limit n] [--json]
 * Reports dead vs blocked source URLs as warnings. Never deletes or edits data.
 * Exit code is 0 unless the data files cannot be read.
 */
import { REPO_ROOT } from '../../scripts/data-files.ts';
import { loadConfig } from '../config.ts';
import { buildFetcher } from '../factory.ts';
import { checkLinks } from '../links.ts';
import { readSnapshot } from '../store.ts';
import { consoleLogger, systemClock } from '../types.ts';
import { intFlag, parseArgs } from './args.ts';

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2), ['limit']);
  const config = loadConfig();
  const snap = await readSnapshot(REPO_ROOT);
  const fetcher = buildFetcher(config, systemClock, consoleLogger);
  const results = await checkLinks(snap.register.projects, fetcher, intFlag(args, 'limit') ?? Infinity);
  if (args.flags.has('json')) {
    console.log(JSON.stringify(results, null, 2));
    return 0;
  }
  for (const r of results.filter((x) => x.status !== 'ok')) {
    const tag = r.status === 'dead' ? 'DEAD   ' : r.status === 'blocked' ? 'BLOCKED' : 'ERROR  ';
    console.warn(`WARN ${tag} ${r.url} (${r.detail}) — cited by ${r.projectIds.join(', ')}`);
  }
  const count = (s: string) => results.filter((r) => r.status === s).length;
  console.log(`check-links: ${results.length} URL(s): ${count('ok')} ok, ${count('dead')} dead, ${count('blocked')} blocked (site refused or robots.txt; not necessarily dead), ${count('error')} other errors. Nothing was changed.`);
  return 0;
}

main().then(
  (c) => process.exit(c),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
