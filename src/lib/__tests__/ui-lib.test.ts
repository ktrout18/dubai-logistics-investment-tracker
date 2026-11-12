import { describe, expect, it } from 'vitest';
import { FIXTURE_PROJECTS } from '../../../shared/__fixtures__/projects.ts';
import { computeMetrics, emptyAreaBreakdown, sumInvestments } from '../../../shared/index.ts';
import { BUILDING_BASES, basisFigures, floorMeasure, sizeBandOf } from '../areas.ts';
import { applyFilters, filtersToParams, parseFilters, type Filters } from '../filters.ts';
import { formatArea, formatDate, formatDubaiDateTime, formatM2, formatMeasureM2, formatMoney, formatOriginal, numberWord } from '../format.ts';
import { hrefFor, parseHash } from '../router.ts';

describe('formatters', () => {
  it('formats square metres with grouping and no decimals', () => {
    expect(formatM2(49981.84)).toBe('49,982 m²');
    expect(formatM2(0)).toBe('0 m²');
    expect(formatM2(10_405.14)).toBe('10,405 m²');
    expect(formatM2(81_000)).toBe('81,000 m²');
    expect(formatMeasureM2({ valueM2: 67_000, qualifier: 'over' })).toBe('over 67,000 m²');
  });
  it('always attaches the basis to an area', () => {
    expect(formatArea({ valueM2: 20000, basis: 'gla' })).toBe('20,000 m² GLA');
    expect(formatArea({ valueM2: 100000, basis: 'site_land_area' })).toBe('100,000 m² Site / land');
    expect(formatArea({ valueM2: 57000, basis: 'unspecified' })).toBe('57,000 m² Basis not stated');
  });
  it('formats original units, money and dates by precision', () => {
    expect(formatOriginal(538000, 'sqft')).toBe('538,000 sq ft');
    expect(formatOriginal(2.5, 'hectare')).toBe('2.5 ha');
    expect(formatMoney(250_000_000, 'AED')).toBe('AED 250 m');
    expect(formatMoney(5_100_000_000, 'USD')).toBe('USD 5.1 bn');
    expect(formatMoney(750_000, 'EUR')).toBe('EUR 750,000');
    expect(formatDate('2026-03-15', 'day')).toBe('15 Mar 2026');
    expect(formatDate('2026-03-01', 'month')).toBe('Mar 2026');
    expect(formatDate('2026-07-01', 'quarter')).toBe('Q3 2026');
    expect(formatDate('2026-01-01', 'year')).toBe('2026');
    expect(numberWord(1)).toBe('one');
    expect(numberWord(13)).toBe('13');
  });
  it('shows timestamps in Dubai time', () => {
    expect(formatDubaiDateTime('2026-11-11T06:00:00Z')).toBe('11 Nov 2026, 10:00 Dubai time');
  });
});

describe('per-basis rendering never sums bases', () => {
  it('returns one figure per basis, in order, without a combined total', () => {
    const b = emptyAreaBreakdown();
    b.warehouse_gfa = { totalM2: 50_000, projectIds: ['a'] };
    b.gla = { totalM2: 20_000, projectIds: ['b'] };
    b.site_land_area = { totalM2: 100_000, projectIds: ['a'] };
    const figs = basisFigures(b, BUILDING_BASES);
    expect(figs.map((f) => [f.basis, f.totalM2])).toEqual([
      ['warehouse_gfa', 50_000],
      ['gla', 20_000],
    ]);
    // Land never leaks into building figures and no figure equals a cross-basis sum.
    expect(figs.some((f) => f.basis === 'site_land_area')).toBe(false);
    expect(figs.some((f) => f.totalM2 === 70_000 || f.totalM2 === 170_000)).toBe(false);
  });
  it('keeps every metrics bucket figure equal to its own basis total', () => {
    const m = computeMetrics(FIXTURE_PROJECTS, 2026);
    for (const bucket of [m.gradeADelivered, m.gradeAProbableDelivered, m.otherModernDelivered, m.underConstruction.all]) {
      for (const f of basisFigures(bucket.areas, BUILDING_BASES)) expect(f.totalM2).toBe(bucket.areas[f.basis].totalM2);
    }
  });
  it('picks a building measure as floor space, never land', () => {
    const alpha = FIXTURE_PROJECTS.find((p) => p.id === 'alpha-jafza-grade-a-dc')!;
    expect(floorMeasure(alpha)?.basis).toBe('warehouse_gfa');
    const land = FIXTURE_PROJECTS.find((p) => p.id === 'delta-nip-land-plot')!;
    expect(floorMeasure(land)).toBeUndefined();
    expect(sizeBandOf(land)).toBe('undisclosed');
    expect(sizeBandOf(alpha)).toBe('10k-50k');
  });
});

describe('filters', () => {
  it('filters by zone (normalised), grade, company and text', () => {
    const jafza = applyFilters(FIXTURE_PROJECTS, { zone: 'Jafza' }, { yearField: 'none' });
    expect(jafza.length).toBeGreaterThan(0);
    expect(jafza.every((p) => /jafza|jebel ali free zone/i.test(p.zone ?? ''))).toBe(true);
    const confirmed = applyFilters(FIXTURE_PROJECTS, { grade: 'confirmed' }, { yearField: 'none' });
    expect(confirmed.every((p) => p.gradeA === 'confirmed')).toBe(true);
    const q = applyFilters(FIXTURE_PROJECTS, { q: 'alpha distribution' }, { yearField: 'none' });
    expect(q.map((p) => p.id)).toEqual(['alpha-jafza-grade-a-dc']);
    const co = applyFilters(FIXTURE_PROJECTS, { company: 'Alpha Logistics LLC' }, { yearField: 'none' });
    expect(co.map((p) => p.id)).toContain('alpha-jafza-grade-a-dc');
  });
  it('applies the year to actual completion only, and "all" disables it', () => {
    const y2026 = applyFilters(FIXTURE_PROJECTS, { year: '2026' }, { yearField: 'actualCompletion' });
    expect(y2026.length).toBeGreaterThan(0);
    expect(y2026.every((p) => p.actualCompletion?.date.startsWith('2026'))).toBe(true);
    expect(applyFilters(FIXTURE_PROJECTS, { year: 'all' }, { yearField: 'actualCompletion' })).toHaveLength(FIXTURE_PROJECTS.length);
    expect(applyFilters(FIXTURE_PROJECTS, { year: '2026' }, { yearField: 'none' })).toHaveLength(FIXTURE_PROJECTS.length);
  });
  it('handles an empty register', () => {
    expect(applyFilters([], { q: 'x', zone: 'Jafza' }, { yearField: 'actualCompletion' })).toEqual([]);
  });
});

describe('URL state', () => {
  it('round-trips filters through the hash query', () => {
    const f: Filters = { year: '2026', zone: 'Dubai South', sector: 'food_fmcg_cold_chain', grade: 'probable', status: 'operational', company: 'Aldar', size: '10k-50k', q: 'cold store' };
    const href = hrefFor('/delivered', filtersToParams(f));
    const loc = parseHash(href);
    expect(loc.path).toBe('/delivered');
    expect(parseFilters(loc.params)).toEqual(f);
  });
  it('omits empty values, keeps other params and strips in-page anchors', () => {
    const base = new URLSearchParams('stage=signed&zone=old');
    const p = filtersToParams({ zone: '', q: '  ' , grade: 'confirmed' }, base);
    expect(p.toString()).toBe('stage=signed&grade=confirmed');
    expect(parseHash('#/method#review').path).toBe('/method');
    expect(parseHash('').path).toBe('/');
    expect(parseHash('#/project/abc-def/').path).toBe('/project/abc-def');
  });
});

describe('disclosed investment by currency', () => {
  it('sums facility-scope amounts per currency only and lists undisclosed ids', async () => {
    const { activeFacilityIds } = await import('../investment.ts');
    const m = computeMetrics(FIXTURE_PROJECTS, 2026);
    const ids = activeFacilityIds(m);
    const byId = new Map(FIXTURE_PROJECTS.map((p) => [p.id, p]));
    const r = sumInvestments(ids.map((id) => byId.get(id)!));
    for (const [cur, t] of Object.entries(r.facilityByCurrency)) {
      const expected = t.projectIds.reduce((s, id) => s + (byId.get(id)!.investment!.currency === cur ? byId.get(id)!.investment!.amount! : NaN), 0);
      expect(t.total).toBe(expected);
    }
    const covered = new Set([
      ...Object.values(r.facilityByCurrency).flatMap((t) => t.projectIds),
      ...r.notSummed.map((x) => x.projectId),
      ...r.undisclosedIds,
    ]);
    expect([...covered].sort()).toEqual([...ids].sort());
    // Umbrellas are never in scope; delivered other infrastructure is.
    expect(ids).not.toContain('zeta-logistics-park');
    expect(ids).toContain('epsilon-jafza-open-yard');
  });
});
