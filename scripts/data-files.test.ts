import { describe, expect, it } from 'vitest';
import { RegisterFileSchema, validateRegister } from '../shared/index.ts';
import { readAllDataFiles } from './data-files.ts';

describe('committed data/ files', () => {
  it('pass validation with no errors', async () => {
    const f = await readAllDataFiles();
    const r = validateRegister({
      register: f.register,
      changelog: f.changelog,
      pendingReview: f.pendingReview,
      meta: f.meta,
      sources: f.sources,
    });
    expect(r.errors).toEqual([]);
  });

  it('register.json holds no fixtures', async () => {
    const f = await readAllDataFiles();
    const reg = RegisterFileSchema.parse(f.register);
    for (const p of reg.projects) expect(p.sources.some((s) => s.url.includes('example.com'))).toBe(false);
  });
});
