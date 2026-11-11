import { describe, expect, it } from 'vitest';
import {
  AREA_BASES,
  computeMetrics,
  countableProjects,
  isDeliveredInYear,
  isUmbrella,
  selectAreasByBasis,
  sumAreasByBasis,
  type Project,
} from '../index.ts';
import {
  FIXTURE_PROJECTS,
  alpha,
  beta,
  cloneProjects,
  delta,
  epsilon,
  eta,
  gamma,
  iota,
  kappa,
  lambda,
  theta,
  zeta,
  zetaPhase1,
  zetaPhase2,
} from '../__fixtures__/projects.ts';

const m2026 = computeMetrics(FIXTURE_PROJECTS, 2026);
const m2027 = computeMetrics(FIXTURE_PROJECTS, 2027);

describe('phasing helpers', () => {
  it('identifies umbrellas and excludes them from countable projects', () => {
    expect(isUmbrella(zeta, FIXTURE_PROJECTS)).toBe(true);
    expect(isUmbrella(zetaPhase1, FIXTURE_PROJECTS)).toBe(false);
    const ids = countableProjects(FIXTURE_PROJECTS).map((p) => p.id);
    expect(ids).not.toContain(zeta.id);
    expect(ids).toContain(zetaPhase1.id);
    expect(ids).toContain(zetaPhase2.id);
  });

  it('a project with no phases is not an umbrella', () => {
    expect(isUmbrella(alpha, FIXTURE_PROJECTS)).toBe(false);
  });
});

describe('scope', () => {
  it('includes only Dubai, countable, non-cancelled projects', () => {
    const inc = m2026.scope.includedProjectIds;
    expect(inc).not.toContain(theta.id); // Sharjah
    expect(inc).not.toContain(iota.id); // cancelled
    expect(inc).not.toContain(zeta.id); // umbrella
    expect(inc).toEqual(
      expect.arrayContaining([alpha.id, beta.id, gamma.id, delta.id, epsilon.id, zetaPhase1.id, zetaPhase2.id, eta.id, kappa.id, lambda.id]),
    );
    expect(inc).toHaveLength(10);
    expect(m2026.scope.excludedUmbrellaIds).toEqual([zeta.id]);
    expect(m2026.scope.excludedCancelledIds).toEqual([iota.id]);
    expect(m2026.scope.regionalProjectIds).toEqual([theta.id]);
  });
});

describe('area bases are never mixed', () => {
  it('every bucket reports one total per basis, keyed by basis', () => {
    for (const b of [m2026.gradeADelivered, m2026.otherModernDelivered, m2026.underConstruction.all, m2026.committedNotStarted]) {
      expect(Object.keys(b.areas).sort()).toEqual([...AREA_BASES].sort());
    }
  });

  it('GFA and GLA are reported as separate numbers', () => {
    const uc = m2026.underConstruction.all.areas;
    expect(uc.warehouse_gfa.totalM2).toBe(60_000); // zeta phase 2
    expect(uc.gla.totalM2).toBe(15_000); // kappa
    expect(uc.warehouse_gfa.projectIds).toEqual([zetaPhase2.id]);
    expect(uc.gla.projectIds).toEqual([kappa.id]);
  });

  it('mixed building area is reported separately from warehouse floor area', () => {
    const o = m2026.otherModernDelivered.areas;
    expect(o.mixed_building_area.totalM2).toBe(12_000);
    expect(o.mixed_building_area.projectIds).toEqual([lambda.id]);
    expect(o.gla.totalM2).toBe(30_000);
    expect(o.warehouse_gfa.totalM2).toBe(0);
  });

  it('sumAreasByBasis keeps a project with two bases in two buckets', () => {
    const b = sumAreasByBasis([alpha]);
    expect(b.warehouse_gfa.totalM2).toBe(49981.84);
    expect(b.site_land_area.totalM2).toBe(100_000);
  });

  it('uses only one measure per basis per project (primary, else largest)', () => {
    const p: Project = {
      ...alpha,
      areas: [
        { valueM2: 5_000, basis: 'warehouse_gfa', sourceUrl: alpha.areas[0]!.sourceUrl },
        { valueM2: 8_000, basis: 'warehouse_gfa', sourceUrl: alpha.areas[0]!.sourceUrl },
        { valueM2: 3_000, basis: 'gla', sourceUrl: alpha.areas[0]!.sourceUrl },
        { valueM2: 4_000, basis: 'gla', sourceUrl: alpha.areas[0]!.sourceUrl },
      ],
      primaryAreaIndex: 0,
    };
    const sel = selectAreasByBasis(p);
    expect(sel.warehouse_gfa).toEqual({ valueM2: 5_000, index: 0 }); // primary wins
    expect(sel.gla).toEqual({ valueM2: 4_000, index: 3 }); // largest of basis
    expect(sumAreasByBasis([p]).warehouse_gfa.totalM2).toBe(5_000);
  });
});

describe('land and yard never inflate warehouse metrics', () => {
  it('site land area of a Grade-A delivered project stays in its own bucket', () => {
    const g = m2026.gradeADelivered.areas;
    expect(g.warehouse_gfa.totalM2).toBe(49981.84);
    expect(g.gla.totalM2).toBe(0);
    expect(g.site_land_area.totalM2).toBe(100_000);
  });

  it('open yard delivered counts as a project but adds no floor area', () => {
    const o = m2026.otherModernDelivered;
    expect(o.projectIds).toContain(epsilon.id);
    expect(o.areas.open_yard.totalM2).toBe(80937.13);
    expect(o.areas.warehouse_gfa.projectIds).not.toContain(epsilon.id);
    expect(o.areas.gla.projectIds).not.toContain(epsilon.id);
    expect(o.withoutBuildingAreaIds).toEqual([epsilon.id]);
  });

  it('land-only committed project contributes only to site_land_area', () => {
    const c = m2026.committedNotStarted;
    expect(c.projectIds).toEqual([delta.id]);
    expect(c.areas.site_land_area.totalM2).toBe(200_000);
    expect(c.areas.warehouse_gfa.totalM2).toBe(0);
    expect(c.areas.gla.totalM2).toBe(0);
    expect(c.withoutBuildingAreaIds).toEqual([delta.id]);
  });

  it('district area of an umbrella never appears anywhere', () => {
    for (const m of [m2026, m2027]) {
      expect(m.underConstruction.all.areas.district_area.totalM2).toBe(0);
    }
  });
});

describe('umbrella and phases are not double counted', () => {
  it('under construction counts phase 2 only, not the umbrella', () => {
    expect(m2026.underConstruction.all.projectIds.sort()).toEqual([kappa.id, zetaPhase2.id].sort());
    expect(m2026.underConstruction.gradeA.areas.warehouse_gfa.totalM2).toBe(60_000);
  });

  it('investment value sums phases, never the umbrella', () => {
    const inv = m2026.investmentAnnouncements;
    expect(inv.projectIds).not.toContain(zeta.id);
    expect(inv.disclosed.byCurrency.AED).toEqual({ total: 200_000_000, projectIds: [zetaPhase1.id] });
    expect(inv.umbrellaProjectIds).toEqual([zeta.id]);
  });

  it('removing the phases makes the umbrella countable again', () => {
    const solo = FIXTURE_PROJECTS.filter((p) => p.parentId !== zeta.id);
    const m = computeMetrics(solo, 2026);
    expect(m.underConstruction.all.projectIds).toContain(zeta.id);
    expect(m.underConstruction.all.areas.warehouse_gfa.totalM2).toBe(100_000);
  });
});

describe('non-Dubai projects are excluded from Dubai totals', () => {
  it('Sharjah Grade-A delivered appears only in regionalContext', () => {
    expect(m2026.gradeADelivered.projectIds).not.toContain(theta.id);
    expect(m2026.gradeADelivered.areas.warehouse_gfa.totalM2).toBe(49981.84);
    expect(m2026.regionalContext.projectIds).toEqual([theta.id]);
    expect(m2026.regionalContext.byEmirate.Sharjah).toEqual({ count: 1, projectIds: [theta.id] });
    expect(m2026.regionalContext.deliveredInYear.areas.warehouse_gfa.totalM2).toBe(25_000);
    expect(m2026.regionalContext.byStatus.operational?.count).toBe(1);
  });

  it('switching a Dubai project to Abu Dhabi removes it from totals', () => {
    const ps = cloneProjects();
    ps.find((p) => p.id === alpha.id)!.emirate = 'Abu Dhabi';
    const m = computeMetrics(ps, 2026);
    expect(m.gradeADelivered.projectCount).toBe(0);
    expect(m.regionalContext.byEmirate['Abu Dhabi']?.projectIds).toEqual([alpha.id]);
  });
});

describe('delivery uses actual completion only', () => {
  it('a forecast date never counts as delivered', () => {
    // phase 2 and kappa have 2027 forecasts; neither counts in 2027
    const all2027 = [
      ...m2027.gradeADelivered.projectIds,
      ...m2027.gradeAProbableDelivered.projectIds,
      ...m2027.otherModernDelivered.projectIds,
    ];
    expect(all2027).toEqual([zetaPhase1.id]);
    expect(all2027).not.toContain(zetaPhase2.id);
    expect(all2027).not.toContain(kappa.id);
  });

  it('a delivered status with only a forecast date is not delivered', () => {
    const p: Project = { ...beta, actualCompletion: undefined, forecastCompletion: { date: '2026-06-01', datePrecision: 'month' } };
    expect(isDeliveredInYear(p, 2026)).toBe(false);
    expect(computeMetrics([p], 2026).otherModernDelivered.projectCount).toBe(0);
  });

  it('an actual completion date without delivered status is not delivered', () => {
    const p: Project = { ...beta, status: 'under_construction' };
    expect(isDeliveredInYear(p, 2026)).toBe(false);
  });
});

describe('year switching', () => {
  it('2026 delivered figures', () => {
    expect(m2026.gradeADelivered.projectIds).toEqual([alpha.id]);
    expect(m2026.gradeAProbableDelivered.projectIds).toEqual([gamma.id]);
    expect(m2026.gradeAProbableDelivered.areas.warehouse_gfa.totalM2).toBe(20_000);
    expect(m2026.otherModernDelivered.projectIds.sort()).toEqual([beta.id, epsilon.id, lambda.id].sort());
  });

  it('2027 delivered figures', () => {
    expect(m2027.gradeADelivered.projectIds).toEqual([zetaPhase1.id]);
    expect(m2027.gradeADelivered.areas.warehouse_gfa.totalM2).toBe(40_000);
    expect(m2027.gradeAProbableDelivered.projectCount).toBe(0);
    expect(m2027.otherModernDelivered.projectCount).toBe(0);
    expect(m2027.regionalContext.deliveredInYear.projectCount).toBe(0);
  });

  it('probable is never merged into confirmed', () => {
    expect(m2026.gradeADelivered.projectIds).not.toContain(gamma.id);
    expect(m2026.gradeADelivered.areas.warehouse_gfa.totalM2).not.toBe(49981.84 + 20_000);
  });

  it('investment announcements are year-specific', () => {
    const i26 = m2026.investmentAnnouncements;
    expect(i26.projectIds.sort()).toEqual([delta.id, eta.id, kappa.id, zetaPhase1.id, zetaPhase2.id].sort());
    expect(i26.eventCount).toBe(5);
    expect(i26.disclosed.byCurrency).toEqual({
      USD: { total: 150_000_000, projectIds: [delta.id, eta.id] },
      AED: { total: 200_000_000, projectIds: [zetaPhase1.id] },
    });
    expect(i26.disclosed.aedWhereAvailable.total).toBe(183_625_000 + 367_250_000 + 200_000_000);
    expect(i26.disclosed.aedWhereAvailable.derivedProjectIds.sort()).toEqual([delta.id, eta.id].sort());
    expect(i26.undisclosed.projectIds.sort()).toEqual([kappa.id, zetaPhase2.id].sort());
    expect(i26.projectIds).not.toContain(iota.id); // cancelled

    const i24 = computeMetrics(FIXTURE_PROJECTS, 2024).investmentAnnouncements;
    expect(i24.projectIds).toEqual([alpha.id]);
    expect(i24.disclosed.byCurrency.AED?.total).toBe(250_000_000);

    expect(m2027.investmentAnnouncements.projectCount).toBe(0);
  });
});

describe('pipeline-stage figures', () => {
  it('under construction splits Grade-A (confirmed+probable) vs other', () => {
    expect(m2026.underConstruction.gradeA.projectIds).toEqual([zetaPhase2.id]);
    expect(m2026.underConstruction.gradeAProbable.projectIds).toEqual([zetaPhase2.id]);
    expect(m2026.underConstruction.gradeAConfirmed.projectCount).toBe(0);
    expect(m2026.underConstruction.other.projectIds).toEqual([kappa.id]);
  });

  it('committed-not-started and non-binding counts', () => {
    expect(m2026.committedNotStarted.byStatus.signed_agreement).toEqual({ count: 1, projectIds: [delta.id] });
    expect(m2026.committedNotStarted.byStatus.investment_committed.count).toBe(0);
    expect(m2026.nonBinding.count).toBe(1);
    expect(m2026.nonBinding.byStatus.mou.projectIds).toEqual([eta.id]);
  });

  it('cancelled projects are excluded everywhere', () => {
    const json = JSON.stringify({ ...m2026, scope: undefined });
    expect(json).not.toContain(iota.id);
  });

  it('verified project count uses directly verified sources', () => {
    expect(m2026.verifiedProjectCount.count).toBe(10);
    const ps = cloneProjects();
    for (const s of ps.find((p) => p.id === alpha.id)!.sources) s.verification = 'indexed';
    expect(computeMetrics(ps, 2026).verifiedProjectCount.projectIds).not.toContain(alpha.id);
  });

  it('empty register yields zeroes', () => {
    const m = computeMetrics([], 2026);
    expect(m.gradeADelivered.projectCount).toBe(0);
    expect(m.gradeADelivered.areas.warehouse_gfa.totalM2).toBe(0);
    expect(m.investmentAnnouncements.disclosed.byCurrency).toEqual({});
  });
});
