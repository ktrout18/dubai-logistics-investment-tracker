/**
 * Briefing-view ("as reported") totals reproducing the owner's Nov 2026 PDF.
 *
 * IMPORTANT: these figures follow the PDF's own convention. `floorAreaM2` adds
 * up the area figure each PDF row charts (`presentation.presentedAreaM2`) for
 * rows inside the PDF subtotals (`presentation.countedInPresentedTotal`),
 * regardless of the measurement basis the sources give (GFA, GLA, mixed
 * building area, unstated). It is therefore NOT a strict like-for-like
 * warehouse floor-space metric. Strict figures come only from
 * `computeMetrics` (metrics.ts), which never sums different bases.
 *
 * The opened / completed-only split follows the same "as reported" rule: it
 * uses `presentation.presentedMilestone` (the PDF's own classification), not
 * the strict `status`. Sources sometimes support only "construction
 * completed" for a row the PDF lists as opened (e.g. "commissioning"
 * wording); the strict count is exposed separately as
 * `statusCompletedOnlyCount` so the UI can show the difference.
 *
 * Pure functions; no I/O, no Node or DOM APIs.
 */
import type { PresentationSection, Project } from './schema.ts';
import { roundTo } from './units.ts';

export interface PresentedTotals {
  year: number;
  openings: {
    rows: Project[];
    /** Openings rows the PDF reports as opened (`presentedMilestone` absent or 'opened'). */
    openedCount: number;
    /** Openings rows the PDF reports as completed but not opened (`presentedMilestone: 'completed_only'`). */
    completedOnlyCount: number;
    /** Strict view: openings rows whose current `status` is `construction_completed` (no source says they opened). */
    statusCompletedOnlyCount: number;
    /** Openings rows with a charted area figure that is inside the PDF subtotal. */
    disclosedFloorCount: number;
    /** Σ presentedAreaM2 of counted openings rows — "as reported", not strict. */
    floorAreaM2: number;
  };
  beingBuilt: {
    rows: Project[];
    /** Σ presentedAreaM2 of counted being-built rows — "as reported", not strict. */
    floorAreaM2: number;
  };
  signedOrAnnounced: { rows: Project[] };
  notCounted: { rows: Project[] };
  addedAfterPdf: { rows: Project[] };
}

/** Projects carrying a presentation in `section`, sorted by `sortOrder` (then id for stability). */
export function presentedRows(projects: readonly Project[], section: PresentationSection): Project[] {
  return projects
    .filter((p) => p.presentation?.section === section)
    .sort((a, b) => a.presentation!.sortOrder - b.presentation!.sortOrder || a.id.localeCompare(b.id));
}

/** True when the row's charted figure is inside the PDF subtotal. */
export function isCountedPresentedArea(p: Project): boolean {
  return p.presentation?.countedInPresentedTotal === true && p.presentation.presentedAreaM2 !== undefined;
}

/** Σ presentedAreaM2 over rows counted in the presented total (as reported; mixed bases). */
export function sumPresentedArea(rows: readonly Project[]): number {
  let total = 0;
  for (const p of rows) if (isCountedPresentedArea(p)) total += p.presentation!.presentedAreaM2!;
  return roundTo(total, 2);
}

/**
 * Totals for the briefing view of `year`. Only projects with a `presentation`
 * appear; umbrellas never carry one. See the module doc: `floorAreaM2` is the
 * briefing's "as reported" convention, explicitly NOT a strict metric.
 */
export function computePresentedTotals(projects: readonly Project[], year: number): PresentedTotals {
  const openingRows = presentedRows(projects, 'openings');
  const completedOnlyCount = openingRows.filter((p) => p.presentation!.presentedMilestone === 'completed_only').length;
  const beingBuiltRows = presentedRows(projects, 'being_built');
  return {
    year,
    openings: {
      rows: openingRows,
      openedCount: openingRows.length - completedOnlyCount,
      completedOnlyCount,
      statusCompletedOnlyCount: openingRows.filter((p) => p.status === 'construction_completed').length,
      disclosedFloorCount: openingRows.filter(isCountedPresentedArea).length,
      floorAreaM2: sumPresentedArea(openingRows),
    },
    beingBuilt: { rows: beingBuiltRows, floorAreaM2: sumPresentedArea(beingBuiltRows) },
    signedOrAnnounced: { rows: presentedRows(projects, 'signed_or_announced') },
    notCounted: { rows: presentedRows(projects, 'not_counted') },
    addedAfterPdf: { rows: presentedRows(projects, 'added_after_pdf') },
  };
}
