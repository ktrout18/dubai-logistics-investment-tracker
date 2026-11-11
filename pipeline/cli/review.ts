/**
 * npm run review -- list
 * npm run review -- show <id>
 * npm run review -- accept <id> [--note "..."] [--verification verified_official|verified_multiple|indexed_only|unverified]
 * npm run review -- reject <id> --note "why"
 */
import { REPO_ROOT } from '../../scripts/data-files.ts';
import type { ChangeVerificationStatus } from '../../shared/index.ts';
import { resolveReview } from '../review.ts';
import { readSnapshot } from '../store.ts';
import { parseArgs } from './args.ts';

const USAGE = 'Usage: npm run review -- list | show <id> | accept <id> [--note "..."] [--verification <status>] | reject <id> --note "..."';

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2), ['note', 'verification']);
  const [cmd, id] = args.positionals;
  const note = typeof args.flags.get('note') === 'string' ? (args.flags.get('note') as string) : undefined;
  if (cmd === 'list' || !cmd) {
    const snap = await readSnapshot(REPO_ROOT);
    const open = snap.pendingReview.items.filter((i) => i.state === 'open');
    if (!open.length) console.log('No open review items.');
    for (const i of open) console.log(`${i.id}  ${i.kind}${i.projectId ? ` ${i.projectId}` : ''}  ${i.evidence[0]?.url ?? ''}\n    held: ${i.reasonHeld}`);
    return 0;
  }
  if (!id) {
    console.error(USAGE);
    return 2;
  }
  if (cmd === 'show') {
    const snap = await readSnapshot(REPO_ROOT);
    const item = snap.pendingReview.items.find((i) => i.id === id);
    if (!item) {
      console.error(`no item ${id}`);
      return 2;
    }
    console.log(JSON.stringify(item, null, 2));
    return 0;
  }
  if (cmd !== 'accept' && cmd !== 'reject') {
    console.error(USAGE);
    return 2;
  }
  if (cmd === 'reject' && !note) {
    console.error('reject needs --note "reason"');
    return 2;
  }
  const verification = args.flags.get('verification');
  const out = await resolveReview({
    root: REPO_ROOT,
    id,
    action: cmd,
    ...(note ? { note } : {}),
    ...(typeof verification === 'string' ? { verification: verification as ChangeVerificationStatus } : {}),
    now: new Date(),
  });
  (out.ok ? console.log : console.error)(out.message);
  if (out.filesWritten.length) console.log(`Files written: ${out.filesWritten.join(', ')}. Review the diff and commit it.`);
  return out.ok ? 0 : 1;
}

main().then(
  (c) => process.exit(c),
  (e) => {
    console.error(e);
    process.exit(2);
  },
);
