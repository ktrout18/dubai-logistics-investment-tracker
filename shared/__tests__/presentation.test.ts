import { describe, expect, it } from 'vitest';
import { ProjectSchema, computePresentedTotals, type Presentation, type Project } from '../index.ts';
import { alpha, beta, gamma, zeta, zetaPhase1 } from '../__fixtures__/projects.ts';

function withPresentation(p: Project, pres: Partial<Presentation> & Pick<Presentation, 'section' | 'sortOrder'>, id?: string): Project {
  return {
    ...p,
    id: id ?? p.id,
    presentation: {
      partners: ['Example Co'],
      descriptor: 'Fixture row',
      locationLabel: 'Fixture',
      areaLabel: pres.presentedAreaM2 ? String(pres.presentedAreaM2) : 'Not disclosed',
      countedInPresentedTotal: pres.presentedAreaM2 !== undefined,
      dateLabel: 'Q1',
      category: 'other_modern',
      ...pres,
    },
  };
}

const rows: Project[] = [
  // Deliberately out of sortOrder.
  withPresentation(alpha, { section: 'openings', sortOrder: 2, presentedAreaM2: 1000, presentedAreaKind: 'floor' }),
  withPresentation(beta, {
    section: 'openings',
    sortOrder: 1,
    presentedAreaM2: 500.5,
    presentedAreaKind: 'floor',
    presentedMilestone: 'completed_only',
  }),
  // Opened row with no charted figure.
  withPresentation(alpha, { section: 'openings', sortOrder: 3 }, 'alpha-no-area'),
  // Charted figure outside the subtotal (e.g. a land figure).
  withPresentation(
    alpha,
    { section: 'openings', sortOrder: 4, presentedAreaM2: 99_999, presentedAreaKind: 'land', countedInPresentedTotal: false },
    'alpha-land',
  ),
  withPresentation(gamma, { section: 'being_built', sortOrder: 1, presentedAreaM2: 250, presentedAreaKind: 'floor' }),
  withPresentation(
    gamma,
    { section: 'being_built', sortOrder: 2, presentedAreaM2: 1_000_000, countedInPresentedTotal: false },
    'gamma-uncounted',
  ),
  withPresentation(zetaPhase1, { section: 'signed_or_announced', sortOrder: 1 }),
  withPresentation(gamma, { section: 'not_counted', sortOrder: 1 }, 'gamma-nc'),
  withPresentation(gamma, { section: 'added_after_pdf', sortOrder: 1 }, 'gamma-added'),
  zeta, // umbrella, no presentation
];

describe('PresentationSchema', () => {
  it('accepts a presentation block on a project and rejects unknown keys', () => {
    expect(ProjectSchema.safeParse(rows[0]).success).toBe(true);
    const bad = { ...rows[0], presentation: { ...rows[0]!.presentation, extra: 1 } };
    expect(ProjectSchema.safeParse(bad).success).toBe(false);
    const badRef = { ...rows[0], presentation: { ...rows[0]!.presentation, pdfRef: 27 } };
    expect(ProjectSchema.safeParse(badRef).success).toBe(false);
  });
});

describe('computePresentedTotals', () => {
  const t = computePresentedTotals(rows, 2026);

  it('sorts rows by sortOrder within each section', () => {
    expect(t.year).toBe(2026);
    expect(t.openings.rows.map((p) => p.id)).toEqual([beta.id, alpha.id, 'alpha-no-area', 'alpha-land']);
    expect(t.beingBuilt.rows.map((p) => p.id)).toEqual([gamma.id, 'gamma-uncounted']);
    expect(t.signedOrAnnounced.rows.map((p) => p.id)).toEqual([zetaPhase1.id]);
    expect(t.notCounted.rows.map((p) => p.id)).toEqual(['gamma-nc']);
    expect(t.addedAfterPdf.rows.map((p) => p.id)).toEqual(['gamma-added']);
  });

  it('sums only counted presented areas (as reported)', () => {
    expect(t.openings.floorAreaM2).toBe(1500.5);
    expect(t.openings.disclosedFloorCount).toBe(2);
    expect(t.beingBuilt.floorAreaM2).toBe(250);
  });

  it('splits opened vs completed-only as the PDF reports it, and exposes the strict status count', () => {
    expect(t.openings.completedOnlyCount).toBe(1);
    expect(t.openings.openedCount).toBe(3);
    // beta fixture is construction_completed; alpha copies are operational.
    expect(beta.status).toBe('construction_completed');
    expect(t.openings.statusCompletedOnlyCount).toBe(1);
    // A row reported as opened whose strict status is only construction_completed
    // still counts as opened in the presented view, but shows up in the strict count.
    const extra = withPresentation(beta, { section: 'openings', sortOrder: 9 }, 'beta-reported-opened');
    const t2 = computePresentedTotals([...rows, extra], 2026);
    expect(t2.openings.openedCount).toBe(4);
    expect(t2.openings.completedOnlyCount).toBe(1);
    expect(t2.openings.statusCompletedOnlyCount).toBe(2);
  });

  it('ignores projects without presentation (umbrellas never appear)', () => {
    const all = Object.values(t).flatMap((v) => (typeof v === 'object' ? v.rows : []));
    expect(all.map((p: Project) => p.id)).not.toContain(zeta.id);
  });

  it('is empty for an empty register', () => {
    const e = computePresentedTotals([], 2026);
    expect(e.openings).toEqual({
      rows: [],
      openedCount: 0,
      completedOnlyCount: 0,
      statusCompletedOnlyCount: 0,
      disclosedFloorCount: 0,
      floorAreaM2: 0,
    });
    expect(e.beingBuilt.floorAreaM2).toBe(0);
  });
});
