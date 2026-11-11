/**
 * `npm run validate` — run every check in shared/validate.ts on data/*.json.
 * Exit code 1 on any error (or unreadable file); warnings and notices are
 * printed but do not fail. Options: --quiet (errors only), --json (machine
 * readable result on stdout), --today=YYYY-MM-DD.
 */
import { formatIssue, validateRegister } from '../shared/index.ts';
import { readAllDataFiles } from './data-files.ts';

const args = process.argv.slice(2);
const quiet = args.includes('--quiet');
const asJson = args.includes('--json');
const today = args.find((a) => a.startsWith('--today='))?.slice('--today='.length);

async function main(): Promise<number> {
  let files;
  try {
    files = await readAllDataFiles();
  } catch (e) {
    console.error(`ERROR ${(e as Error).message}`);
    return 1;
  }
  const result = validateRegister(
    {
      register: files.register,
      changelog: files.changelog,
      pendingReview: files.pendingReview,
      meta: files.meta,
      sources: files.sources,
    },
    today ? { today } : {},
  );
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const i of result.errors) console.error(formatIssue(i));
    if (!quiet) {
      for (const i of result.warnings) console.warn(formatIssue(i));
      for (const i of result.notices) console.log(formatIssue(i));
    }
    const n = (files.register as { projects?: unknown[] }).projects?.length ?? 0;
    console.log(
      `validate: ${n} projects — ${result.errors.length} error(s), ${result.warnings.length} warning(s), ${result.notices.length} notice(s)`,
    );
  }
  return result.ok ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
