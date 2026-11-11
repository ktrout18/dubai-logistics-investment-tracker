import { describe, expect, it } from 'vitest';
import {
  ENUM_LABELS,
  EVENT_TYPES,
  InvestmentSchema,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  ProjectSchema,
  SECTORS,
  SECTOR_LABELS,
  isIsoDate,
  isIsoDateTime,
  isRegional,
  labelFor,
  periodEnd,
  periodStart,
} from '../index.ts';
import { FIXTURE_PROJECTS } from '../__fixtures__/projects.ts';

describe('schema', () => {
  it('all fixtures parse', () => {
    for (const p of FIXTURE_PROJECTS) expect(ProjectSchema.safeParse(p).success).toBe(true);
  });

  it('every enum value has a label', () => {
    for (const s of SECTORS) expect(SECTOR_LABELS[s]).toBeTruthy();
    for (const s of PROJECT_STATUSES) expect(PROJECT_STATUS_LABELS[s]).toBeTruthy();
    for (const t of EVENT_TYPES) expect(labelFor('eventType', t)).not.toBe('');
    for (const map of Object.values(ENUM_LABELS)) for (const v of Object.values(map)) expect(v.length).toBeGreaterThan(0);
  });

  it('dates', () => {
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-2-1')).toBe(false);
    expect(isIsoDateTime('2026-01-31T06:00:00Z')).toBe(true);
    expect(isIsoDateTime('2026-01-31T06:00:00')).toBe(false);
    expect(periodStart('2026-05-17', 'quarter')).toBe('2026-04-01');
    expect(periodEnd('2026-04-01', 'quarter')).toBe('2026-06-30');
    expect(periodEnd('2028-02-01', 'month')).toBe('2028-02-29');
    expect(periodEnd('2026-01-01', 'year')).toBe('2026-12-31');
  });

  it('investment rules', () => {
    expect(InvestmentSchema.safeParse({ basis: 'n/a', disclosed: false }).success).toBe(true);
    expect(InvestmentSchema.safeParse({ basis: 'x', disclosed: true }).success).toBe(false);
    expect(InvestmentSchema.safeParse({ basis: 'x', disclosed: false, amount: 5 }).success).toBe(false);
    expect(
      InvestmentSchema.safeParse({ basis: 'x', disclosed: true, amount: 1, currency: 'EUR', amountAed: 4, amountAedDerivation: 'usd_peg' })
        .success,
    ).toBe(false);
    expect(
      InvestmentSchema.safeParse({ basis: 'x', disclosed: true, amount: 1, currency: 'EUR', amountAed: 4, amountAedDerivation: 'stated_in_source' })
        .success,
    ).toBe(true);
  });

  it('regional is derived from emirate', () => {
    expect(isRegional({ emirate: 'Dubai' })).toBe(false);
    expect(isRegional({ emirate: 'Sharjah' })).toBe(true);
  });
});
