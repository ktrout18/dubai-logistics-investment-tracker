/**
 * The seed build overwrites data/register.json and data/pending-review.json.
 * Once the pipeline (or a reviewer) has written records, that would silently
 * discard them, so writing is refused. `--check` (validate only) stays allowed.
 */
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Why writing the seed is refused under `root`, or undefined when it is safe. */
export async function seedWriteBlockedReason(root: string): Promise<string | undefined> {
  const reasons: string[] = [];
  const statePath = resolve(root, 'data', 'pipeline-state.json');
  try {
    await access(statePath);
    reasons.push('data/pipeline-state.json exists (the pipeline has run)');
  } catch {
    // absent: fine
  }
  try {
    const log = JSON.parse(await readFile(resolve(root, 'data', 'changelog.json'), 'utf8')) as { changes?: unknown[] };
    const n = Array.isArray(log.changes) ? log.changes.length : 0;
    if (n > 0) reasons.push(`data/changelog.json has ${n} change record(s)`);
  } catch (e) {
    reasons.push(`data/changelog.json could not be read (${(e as Error).message})`);
  }
  return reasons.length ? reasons.join('; ') : undefined;
}
