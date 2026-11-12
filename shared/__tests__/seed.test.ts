/**
 * Assertions on the REAL register (data/register.json): every figure the site
 * shows (headline, cards, snapshot, CSV) is derived from the audited records
 * with the shared counting rules. The briefing PDF's own totals are
 * deliberately not reproduced. Reads the file via a JSON import (no Node APIs).
 */
import { describe, expect, it } from 'vitest';
import registerJson from '../../data/register.json';
import pendingJson from '../../data/pending-review.json';
import { PDF_ROW_IDS } from '../../scripts/seed/projects.ts';
import { parseCsv } from './parseCsv.ts';
import {
  NON_FLOOR_BASES,
  RegisterFileSchema,
  WAREHOUSE_FLOOR_BASES,
  CSV_COLUMNS,
  computeBriefing,
  computeMetrics,
  formatArea,
  normaliseUrl,
  registerToCsv,
  umbrellaIdSet,
  validateRegister,
  type AreaBasis,
  type BriefingSection,
  type Project,
} from '../index.ts';

const register = RegisterFileSchema.parse(registerJson);
const projects: Project[] = register.projects;
const byId = new Map(projects.map((p) => [p.id, p]));
const metrics = computeMetrics(projects, 2026);
const TODAY = '2026-11-12';
const briefing = computeBriefing(projects, 2026, TODAY);

describe('seed register: integrity', () => {
  it('validates with zero errors (today = seed date)', () => {
    const r = validateRegister({ register: registerJson, pendingReview: pendingJson }, { today: '2026-11-11' });
    expect(r.errors.map((e) => `${e.code} ${e.projectId ?? ''} ${e.path ?? ''}`)).toEqual([]);
  });

  it('has no duplicate project ids', () => {
    expect(new Set(projects.map((p) => p.id)).size).toBe(projects.length);
  });

  it('contains every project of the briefing PDF (26 rows), with evidence-based values and no PDF labels', () => {
    expect(PDF_ROW_IDS).toHaveLength(26);
    expect(new Set(PDF_ROW_IDS).size).toBe(26);
    for (const id of PDF_ROW_IDS) expect(byId.get(id)?.provenance, id).toBe('seed_pdf');
    for (const p of registerJson.projects) expect(Object.keys(p), p.id).not.toContain('presentation');
  });

  it('has no actualCompletion without a source listed in the project sources', () => {
    for (const p of projects) {
      if (!p.actualCompletion) continue;
      expect(p.actualCompletion.sourceUrl, p.id).toMatch(/^https?:\/\//);
      const urls = p.sources.map((s) => normaliseUrl(s.url));
      expect(urls, p.id).toContain(normaliseUrl(p.actualCompletion.sourceUrl));
    }
  });

  it('every event and area cites a URL that is in the project sources', () => {
    for (const p of projects) {
      const urls = new Set(p.sources.map((s) => normaliseUrl(s.url)));
      for (const e of p.events) expect(urls.has(normaliseUrl(e.sourceUrl)), `${p.id} ${e.id}`).toBe(true);
      for (const a of p.areas) expect(urls.has(normaliseUrl(a.sourceUrl!)), `${p.id} area`).toBe(true);
    }
  });
});

const DELIVERED_2026 = {
  constructionCompleted: [
    'aldar-logistics-centres-nip-phase-1',
    'dnata-logistics-dubai-south-warehouse',
    'emirates-snack-foods-cold-store-dubai-south',
  ],
  otherInfrastructure: [
    'dp-world-al-awir-inland-container-depot',
    'lufthansa-technik-me-painting-grinding-centre-mbrah',
    'mosolf-automotive-hub-jafza',
    'petrochem-jebel-ali-terminal-and-hq',
  ],
};

describe('seed register: the 2026 headline is derived and true', () => {
  it('11 opened / operational and 3 construction completed, counted separately', () => {
    expect(briefing.delivered.openedIds).toHaveLength(11);
    expect([...briefing.delivered.constructionCompletedIds].sort()).toEqual(DELIVERED_2026.constructionCompleted);
    expect(briefing.headline).toBe('In 2026, 11 logistics facilities opened in Dubai and 3 more completed construction.');
    expect(metrics.delivered.opened.count).toBe(11);
    expect(metrics.delivered.constructionCompleted.count).toBe(3);
    for (const id of briefing.delivered.openedIds) expect(byId.get(id)!.status).toBe('operational');
  });

  it('separates 10 warehouse facilities from 4 other logistics infrastructure', () => {
    expect([...briefing.delivered.otherInfrastructureIds].sort()).toEqual(DELIVERED_2026.otherInfrastructure);
    expect(briefing.delivered.warehouseIds).toHaveLength(10);
    expect([...metrics.delivered.otherInfrastructure.projectIds].sort()).toEqual(DELIVERED_2026.otherInfrastructure);
    const warehouseBuckets = [metrics.gradeADelivered, metrics.gradeAProbableDelivered, metrics.otherModernDelivered];
    for (const id of DELIVERED_2026.otherInfrastructure) for (const b of warehouseBuckets) expect(b.projectIds).not.toContain(id);
  });

  it('never lets the Al Awir depot area count as warehouse floor space', () => {
    const id = 'dp-world-al-awir-inland-container-depot';
    for (const b of [metrics.gradeADelivered, metrics.gradeAProbableDelivered, metrics.otherModernDelivered, metrics.delivered.warehouse]) {
      expect(b.primaryUnspecified.projectIds).not.toContain(id);
      for (const t of Object.values(b.floorSpace)) expect(t.projectIds).not.toContain(id);
    }
    for (const s of briefing.delivered.floorSubtotals) expect(s.projectIds).not.toContain(id);
    const row = briefing.delivered.rows.find((r) => r.id === id)!;
    expect(row.floor?.bar).toBe(false);
  });
});

describe('seed register: per-basis subtotals, never a cross-basis total', () => {
  const sub = (s: BriefingSection) => Object.fromEntries(s.floorSubtotals.map((t) => [t.basis, t.totalM2]));

  it('delivered 2026: GFA, GLA, built-up and basis-not-stated, side by side', () => {
    expect(sub(briefing.delivered)).toEqual({
      warehouse_gfa: 26_012.85,
      gla: 20_000,
      mixed_building_area: 10_405.14,
      unspecified: 204_174.15,
    });
    expect(briefing.delivered.floorSubtotals.map((s) => `${s.text} ${s.basisTag}`)).toEqual([
      '26,013 m² GFA',
      '20,000 m² GLA',
      '10,405 m² Built-up (mixed use)',
      '204,174 m² Basis not stated',
    ]);
    expect(briefing.delivered.floorDisclosedIds).toHaveLength(9);
  });

  it('being built: GLA, built-up and basis-not-stated, side by side', () => {
    expect(sub(briefing.beingBuilt)).toEqual({ gla: 81_000, mixed_building_area: 48_136.06, unspecified: 101_230.91 });
  });

  it('subtotals reproduce from the eligible records with no umbrella double counting', () => {
    const umbrellas = umbrellaIdSet(projects);
    for (const [section, ids] of [
      [briefing.delivered, briefing.delivered.warehouseIds],
      [briefing.beingBuilt, briefing.beingBuilt.warehouseIds],
    ] as const) {
      for (const s of section.floorSubtotals) {
        let total = 0;
        for (const id of s.projectIds) {
          expect(umbrellas.has(id), id).toBe(false);
          expect(ids).toContain(id);
          const p = byId.get(id)!;
          const m = p.primaryAreaIndex !== undefined && p.areas[p.primaryAreaIndex]!.basis === s.basis
            ? p.areas[p.primaryAreaIndex]!
            : p.areas.find((a) => a.basis === s.basis)!;
          total += m.valueM2;
        }
        expect(Math.round(total * 100) / 100).toBe(s.totalM2);
        expect(new Set(s.projectIds).size).toBe(s.projectIds.length);
      }
      // Each project contributes to at most one basis.
      const all = section.floorSubtotals.flatMap((s) => s.projectIds);
      expect(new Set(all).size).toBe(all.length);
    }
    // The overview cards use the same figures.
    for (const s of briefing.delivered.floorSubtotals) expect(metrics.delivered.warehouse.floorSpace[s.basis].totalM2).toBe(s.totalM2);
  });

  it('no figure in the briefing model is a sum across bases, and the old briefing totals are gone', () => {
    const json = JSON.stringify(briefing);
    for (const section of [briefing.delivered, briefing.beingBuilt]) {
      const vals = section.floorSubtotals.map((s) => s.totalM2);
      for (let mask = 1; mask < 1 << vals.length; mask++) {
        const picked = vals.filter((_, i) => mask & (1 << i));
        if (picked.length < 2) continue;
        const sum = Math.round(picked.reduce((a, b) => a + b, 0) * 100) / 100;
        expect(json).not.toContain(`:${sum},`);
        expect(json).not.toContain(`:${sum}}`);
      }
    }
    for (const old of ['261,600', '261600', '215,260', '215260', '262,000', '81,500', '81500', 'Multiuser']) expect(json).not.toContain(old);
    expect(Object.keys(briefing.delivered)).not.toContain('floorAreaM2');
  });
});

describe('seed register: the same record shows the same thing everywhere', () => {
  it('DSV: build-to-suit warehouse for DSV, opened 20 May 2026', () => {
    const row = briefing.delivered.rows.find((r) => r.id === 'dsv-lintara-jafza-build-to-suit-warehouse')!;
    expect(row.descriptor).toBe('Build-to-suit warehouse for DSV');
    expect(row.date.text).toBe('20 May 2026');
    expect(row.date.mayBeEarlier).toBe(false);
    expect(row.deliveryLabel).toBe('Opened / operational');
    expect(row.partners).toContain('DSV');
    expect(row.areaText).toBe('30,000 m² Basis not stated');
    expect(row.floor?.basisStated).toBe(false);
  });

  it('NIP phase 2: 81,000 m² GLA in every view model', () => {
    const id = 'aldar-logistics-centres-nip-phase-2';
    const p = byId.get(id)!;
    const row = briefing.beingBuilt.rows.find((r) => r.id === id)!;
    expect(row.floor).toMatchObject({ valueM2: 81_000, basis: 'gla', figure: '81,000 m²', basisTag: 'GLA', bar: true, basisStated: true });
    expect(row.areaText).toBe('81,000 m² GLA');
    expect(metrics.underConstruction.gradeAConfirmed.floorSpace.gla).toMatchObject({ totalM2: 81_000, projectIds: [id] });
    expect(formatArea(p.areas[p.primaryAreaIndex!]!)).toBe('81,000 m² GLA');
    const csv = parseCsv(registerToCsv([p]))[1]!;
    expect(csv[CSV_COLUMNS.indexOf('floor_figure_m2')]).toBe('81000');
    expect(csv[CSV_COLUMNS.indexOf('floor_figure_basis')]).toBe('gla');
    expect(row.date.text).toBe('Forecast Q1 2027');
  });

  it('lower-bound and approximate figures display as such', () => {
    const p1 = briefing.delivered.rows.find((r) => r.id === 'aldar-logistics-centres-nip-phase-1')!;
    expect(p1.areaText).toBe('over 67,000 m² Basis not stated');
    expect(p1.date.text).toBe('Q3 2026');
    expect(p1.deliveryLabel).toBe('Construction completed');
    const esf = briefing.delivered.rows.find((r) => r.id === 'emirates-snack-foods-cold-store-dubai-south')!;
    expect(esf.areaText).toBe('nearly 20,000 m² GLA');
    expect(esf.category).toBe('grade_a');
    const palmon = briefing.delivered.rows.find((r) => r.id === 'palmon-manrre-jafza-chemical-storage-hub')!;
    expect(palmon.areaText).toBe('10,405 m² Built-up (mixed use)');
    expect(palmon.gradeTag).toBe('Grade A (probable)');
    expect(palmon.category).toBe('other_modern');
  });

  it('dates stored from a release say the event may be earlier', () => {
    const sharqi = briefing.delivered.rows.find((r) => r.id === 'al-sharqi-shipping-dic-logistics-hub')!;
    expect(sharqi.date).toMatchObject({ text: 'Oct 2026', kind: 'actual', mayBeEarlier: true });
    const toll = briefing.beingBuilt.rows.find((r) => r.id === 'cwt-sml-toll-dc6-dubai-south')!;
    expect(toll.date).toMatchObject({ kind: 'forecast', forecastPassed: true });
    expect(toll.date.text).toMatch(/^Forecast Aug 2026/);
  });
});

describe('seed register: investment aggregates use facility-scope amounts only', () => {
  it('delivered 2026: AED 170 m facility scope; Petrochem and Palmon listed, not summed', () => {
    const inv = briefing.delivered.investment;
    expect(inv.facilityByCurrency).toEqual({
      AED: { total: 170_000_000, projectIds: ['dnata-logistics-dubai-south-warehouse', 'al-sharqi-shipping-dic-logistics-hub'] },
    });
    expect(inv.notSummed.map((x) => [x.projectId, x.scope]).sort()).toEqual([
      ['palmon-manrre-jafza-chemical-storage-hub', 'wider_than_facility'],
      ['petrochem-jebel-ali-terminal-and-hq', 'wider_than_facility'],
    ]);
  });

  it('being built: Emirates USD 5.1 bn and Talal AED 150 m are never summed', () => {
    const inv = briefing.beingBuilt.investment;
    expect(inv.facilityByCurrency).toEqual({});
    expect(inv.notSummed.map((x) => x.projectId).sort()).toEqual([
      'emirates-engineering-complex-dubai-south',
      'talal-group-central-distribution-centre-dic',
    ]);
  });

  it('every disclosed seed amount has a scope; currencies are never combined', () => {
    for (const p of projects) if (p.investment?.disclosed) expect(p.investment.scope, p.id).toBeDefined();
    const signed = briefing.signedOrAnnounced.investment;
    expect(Object.keys(signed.facilityByCurrency)).toEqual(['EUR']);
  });
});

describe('seed register: dnata', () => {
  const dnata = byId.get('dnata-logistics-dubai-south-warehouse')!;

  it('is one project with the Dec 2024 announcement and the Nov 2026 commissioning confirmation', () => {
    expect(projects.filter((p) => p.name.toLowerCase().includes('dnata'))).toHaveLength(1);
    const ann = dnata.events.find((e) => e.date === '2024-12-05' && e.type === 'announcement');
    expect(ann).toBeDefined();
    const comm = dnata.events.find((e) => e.type === 'commissioned');
    expect(comm?.sourcePublishedDate).toBe('2026-11-05');
    expect(comm?.summary).toContain('commissioning its new AED 100 million');
  });

  it('is construction completed (not opened), dated 2026 at year precision', () => {
    expect(dnata.status).toBe('construction_completed');
    const row = briefing.delivered.rows.find((r) => r.id === dnata.id)!;
    expect(row.date.text).toBe('2026');
    expect(row.deliveryKind).toBe('construction_completed');
    expect(dnata.netNew).toBe('unknown');
  });
});

describe('seed register: strict metrics follow source bases', () => {
  const floorBases = WAREHOUSE_FLOOR_BASES as readonly AreaBasis[];
  const nonFloor = NON_FLOOR_BASES as readonly AreaBasis[];
  const buckets = [
    metrics.gradeADelivered,
    metrics.gradeAProbableDelivered,
    metrics.otherModernDelivered,
    metrics.underConstruction.all,
    metrics.committedNotStarted,
  ];

  it('land, yard, district, site and unspecified areas contribute 0 to warehouse floor metrics', () => {
    const stripped = projects.map((p) => ({
      ...p,
      areas: p.areas.filter((a) => !nonFloor.includes(a.basis)),
      primaryAreaIndex: undefined,
    }));
    const m2 = computeMetrics(stripped, 2026);
    const buckets2 = [m2.gradeADelivered, m2.gradeAProbableDelivered, m2.otherModernDelivered, m2.underConstruction.all, m2.committedNotStarted];
    buckets.forEach((b, i) => {
      for (const basis of floorBases) expect(b.areas[basis].totalM2).toBe(buckets2[i]!.areas[basis].totalM2);
      expect(b.areas.mixed_building_area.totalM2).toBe(buckets2[i]!.areas.mixed_building_area.totalM2);
    });
    // Projects whose only figures are land / yard / district never appear in floor figures.
    for (const id of ['dp-world-al-awir-inland-container-depot', 'dp-world-dubai-food-district-al-aweer', 'gargash-prime-jingdong-dubai-logistics-facility']) {
      for (const b of buckets) for (const basis of floorBases) expect(b.areas[basis].projectIds).not.toContain(id);
    }
  });

  it('never counts umbrella areas', () => {
    const umbrellas = umbrellaIdSet(projects);
    expect([...umbrellas].sort()).toEqual(['aldar-logistics-centres-nip', 'terralogix-logistics-park-warsan']);
    expect(metrics.scope.excludedUmbrellaIds.sort()).toEqual([...umbrellas].sort());
    for (const b of buckets) {
      for (const total of Object.values(b.areas)) for (const id of umbrellas) expect(total.projectIds).not.toContain(id);
    }
  });

  it('keeps every project in Dubai (no regional items in the seed)', () => {
    expect(metrics.scope.regionalProjectIds).toEqual([]);
  });
});
