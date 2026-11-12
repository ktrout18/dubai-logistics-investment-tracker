import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { seedWriteBlockedReason } from './guard.ts';

async function dataDir(changes: unknown[], withState: boolean): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'seed-guard-'));
  await mkdir(join(root, 'data'));
  await writeFile(join(root, 'data', 'changelog.json'), JSON.stringify({ schemaVersion: 1, changes }));
  if (withState) await writeFile(join(root, 'data', 'pipeline-state.json'), '{}');
  return root;
}

describe('seed build guard', () => {
  it('allows writing a fresh seed (empty changelog, no pipeline state)', async () => {
    expect(await seedWriteBlockedReason(await dataDir([], false))).toBeUndefined();
  });
  it('refuses once the pipeline has run', async () => {
    expect(await seedWriteBlockedReason(await dataDir([], true))).toMatch(/pipeline-state\.json exists/);
  });
  it('refuses once the changelog has records', async () => {
    expect(await seedWriteBlockedReason(await dataDir([{ id: 'c1' }], false))).toMatch(/1 change record/);
  });
});
