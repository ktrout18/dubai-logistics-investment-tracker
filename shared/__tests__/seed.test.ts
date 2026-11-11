/**
 * Assertions on the REAL seeded register (data/register.json), so the first
 * public view keeps matching the owner's Nov 2026 PDF while the strict data
 * keeps following the sources. Reads the file via a JSON import (no Node APIs).
 */
import { describe, expect, it } from 'vitest';
import registerJson from '../../data/register.json';
import pendingJson from '../../data/pending-review.json';
import {
  NON_FLOOR_BASES,
  RegisterFileSchema,
  WAREHOUSE_FLOOR_BASES,
  computeMetrics,
  computePresentedTotals,
  normaliseUrl,
  umbrellaIdSet,
  validateRegister,
  type AreaBasis,
  type Project,
} from '../index.ts';

const register = RegisterFileSchema.parse(registerJson);
const projects: Project[] = register.projects;
const byId = new Map(projects.map((p) => [p.id, p]));
const metrics = computeMetrics(projects, 2026);
const presented = computePresentedTotals(projects, 2026);

describe('seed register: integrity', () => {
  it('validates with zero errors (today = seed date)', () => {
    const r = validateRegister({ register: registerJson, pendingReview: pendingJson }, { today: '2026-11-11' });
    expect(r.errors.map((e) => `${e.code} ${e.projectId ?? ''} ${e.path ?? ''}`)).toEqual([]);
  });

  it('has no duplicate project ids', () => {
    expect(new Set(projects.map((p) => p.id)).size).toBe(projects.length);
  });

  it('contains every PDF row 1–26 exactly once', () => {
    const refs = projects.map((p) => p.presentation?.pdfRef).filter((r): r is number => r !== undefined);
    expect([...refs].sort((a, b) => a - b)).toEqual(Array.from({ length: 26 }, (_, i) => i + 1));
  });

  it('puts PDF rows in the right sections', () => {
    for (const p of projects) {
      const ref = p.presentation?.pdfRef;
      if (ref === undefined) continue;
      const expected = ref <= 14 ? 'openings' : ref <= 20 ? 'being_built' : 'signed_or_announced';
      expect(p.presentation!.section, p.id).toBe(expected);
    }
  });

  it('never gives an umbrella a presentation', () => {
    for (const id of umbrellaIdSet(projects)) expect(byId.get(id)?.presentation, id).toBeUndefined();
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

describe('seed register: presented totals reproduce the PDF', () => {
  it('openings: 261,600 m² across ten disclosed facilities', () => {
    expect(presented.openings.floorAreaM2).toBe(261_600);
    expect(presented.openings.disclosedFloorCount).toBe(10);
    expect(presented.openings.rows.map((p) => p.presentation!.pdfRef)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
  });

  it('openings: 13 opened and one completed only (Aldar NIP phase 1)', () => {
    expect(presented.openings.openedCount).toBe(13);
    expect(presented.openings.completedOnlyCount).toBe(1);
    const completed = presented.openings.rows.filter((p) => p.presentation!.presentedMilestone === 'completed_only');
    expect(completed.map((p) => p.presentation!.pdfRef)).toEqual([1]);
  });

  it('openings: rows the PDF calls opened but sources only call completed are flagged', () => {
    // Strict status differs for dnata ("commissioning") and Emirates Snack Foods ("completion in Q2").
    const strict = presented.openings.rows.filter((p) => p.status === 'construction_completed').map((p) => p.presentation!.pdfRef);
    expect(strict).toEqual([1, 2, 7]);
    expect(presented.openings.statusCompletedOnlyCount).toBe(3);
    for (const ref of [2, 7]) {
      const p = presented.openings.rows.find((r) => r.presentation!.pdfRef === ref)!;
      expect(p.presentation!.differsFromSources, p.id).toMatch(/construction completed/);
    }
  });

  it('being built: 215,260 m² from rows 15–19; Emirates (row 20) not counted', () => {
    expect(presented.beingBuilt.floorAreaM2).toBe(215_260);
    const counted = presented.beingBuilt.rows.filter((p) => p.presentation!.countedInPresentedTotal).map((p) => p.presentation!.pdfRef);
    expect(counted).toEqual([15, 16, 17, 18, 19]);
  });

  it('lists the three not-counted items and nothing added after the PDF yet', () => {
    expect(presented.notCounted.rows.map((p) => p.id)).toEqual([
      'cwt-sml-toll-dc6-dubai-south',
      'dhl-supply-chain-dubai-south-multi-user-warehouse',
      'mbrah-sky-support-complex',
    ]);
    expect(presented.addedAfterPdf.rows).toEqual([]);
  });
});

describe('seed register: dnata (PDF row 2)', () => {
  const dnata = projects.find((p) => p.presentation?.pdfRef === 2)!;

  it('is one project with the Dec 2024 announcement and the Nov 2026 commissioning confirmation', () => {
    expect(projects.filter((p) => p.name.toLowerCase().includes('dnata'))).toHaveLength(1);
    const ann = dnata.events.find((e) => e.date === '2024-12-05' && e.type === 'announcement');
    expect(ann).toBeDefined();
    const comm = dnata.events.find((e) => e.type === 'commissioned');
    expect(comm?.sourcePublishedDate).toBe('2026-11-05');
    expect(comm?.summary).toContain('commissioning its new AED 100 million');
  });

  it('keeps the strict status at construction_completed and the PDF label "Apr to Sep"', () => {
    expect(dnata.status).toBe('construction_completed');
    expect(dnata.presentation!.dateLabel).toBe('Apr to Sep');
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

  it('strict 2026 delivered warehouse floor space is lower than the PDF\'s 261,600 m²', () => {
    const delivered = [metrics.gradeADelivered, metrics.gradeAProbableDelivered, metrics.otherModernDelivered];
    const gfa = delivered.reduce((s, b) => s + b.areas.warehouse_gfa.totalM2, 0);
    const gla = delivered.reduce((s, b) => s + b.areas.gla.totalM2, 0);
    expect(gfa).toBeLessThan(261_600);
    expect(gla).toBeLessThan(261_600);
    expect(gfa + gla).toBeLessThan(261_600);
  });

  it('keeps every project in Dubai (no regional items in the seed)', () => {
    expect(metrics.scope.regionalProjectIds).toEqual([]);
  });
});
