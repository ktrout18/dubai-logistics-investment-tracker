import { describe, expect, it } from 'vitest';
import { collectUsedIds, fnv1a, isValidSlug, makeChangeId, makeEventId, makeProjectId, makeUniqueSlug, slugify } from '../index.ts';

describe('slugify', () => {
  it('produces lower-case hyphenated ASCII', () => {
    expect(slugify('dnata Dubai South Warehouse')).toBe('dnata-dubai-south-warehouse');
    expect(slugify('Dubai South – Logistics District')).toBe('dubai-south-logistics-district');
    expect(slugify('Al Futtaim & Co.')).toBe('al-futtaim-and-co');
    expect(slugify('Café Ünïcode')).toBe('cafe-unicode');
    expect(slugify("Majid Al Futtaim's DC")).toBe('majid-al-futtaims-dc');
    expect(slugify('***')).toBe('');
  });

  it('truncates at a hyphen boundary', () => {
    const s = slugify('word '.repeat(40));
    expect(s.length).toBeLessThanOrEqual(80);
    expect(s.endsWith('-')).toBe(false);
    expect(isValidSlug(s)).toBe(true);
  });
});

describe('uniqueness', () => {
  it('adds the smallest free numeric suffix', () => {
    expect(makeUniqueSlug('Alpha DC', [])).toBe('alpha-dc');
    expect(makeUniqueSlug('Alpha DC', ['alpha-dc'])).toBe('alpha-dc-2');
    expect(makeUniqueSlug('Alpha DC', new Set(['alpha-dc', 'alpha-dc-2']))).toBe('alpha-dc-3');
  });

  it('never reuses ids seen in changelog or review queue', () => {
    const used = collectUsedIds({
      projects: [{ id: 'a-dc', parentId: 'park-x' }],
      changelog: [{ projectId: 'removed-dc' }],
      pending: [{ projectId: 'held-dc' }, { projectId: undefined }],
      retired: ['old-dc'],
    });
    expect([...used].sort()).toEqual(['a-dc', 'held-dc', 'old-dc', 'park-x', 'removed-dc']);
    expect(makeUniqueSlug('Removed DC', used)).toBe('removed-dc-2');
  });

  it('builds project ids from parts without repeated words', () => {
    expect(makeProjectId({ operator: 'dnata', zone: 'Dubai South', facility: 'warehouse' }, [])).toBe('dnata-dubai-south-warehouse');
    expect(makeProjectId({ operator: 'DP World', name: 'DP World Logistics Hub' }, [])).toBe('dp-world-logistics-hub');
  });

  it('pads very short slugs and rejects empty ones', () => {
    expect(makeUniqueSlug('X', [])).toBe('x-project');
    expect(() => makeUniqueSlug('!!!', [])).toThrow();
  });
});

describe('record ids', () => {
  it('event ids are unique within a project', () => {
    expect(makeEventId('2026-03-15', 'construction_start', [])).toBe('2026-03-15-construction-start');
    expect(makeEventId('2026-03-15', 'opened', ['2026-03-15-opened'])).toBe('2026-03-15-opened-2');
  });

  it('change ids are deterministic', () => {
    const rec = { projectId: 'a', field: 'status', appliedAt: '2026-03-16T06:00:00Z', newValue: 'operational' };
    expect(makeChangeId(rec)).toBe(makeChangeId(rec));
    expect(makeChangeId(rec)).toMatch(/^chg-20260316-[0-9a-f]{8}$/);
    expect(makeChangeId({ ...rec, newValue: 'cancelled' })).not.toBe(makeChangeId(rec));
  });

  it('fnv1a is stable', () => {
    expect(fnv1a('')).toBe('811c9dc5');
    expect(fnv1a('a')).toBe('e40c292c');
  });
});
