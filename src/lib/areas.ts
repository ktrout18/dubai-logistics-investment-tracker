/**
 * Area helpers for the UI. The hard rule: a square-metre figure is always
 * tied to ONE basis. Nothing in here adds figures of different bases.
 */
import {
  NON_FLOOR_BASES,
  floorFigure,
  type AreaBasis,
  type AreaBreakdown,
  type AreaMeasure,
  type Project,
} from '../../shared/index.ts';

/** Bases shown as building / floor space, each as its own figure. */
export const BUILDING_BASES = ['warehouse_gfa', 'gla', 'mixed_building_area'] as const satisfies readonly AreaBasis[];
/** Land, yard and district: never floor space; shown only in their own labelled place. */
export const LAND_BASES = NON_FLOOR_BASES.filter((b) => b !== 'unspecified');
/** @deprecated alias kept for readability in older call sites. */
export const NON_BUILDING_BASES = LAND_BASES;

export interface BasisFigure {
  basis: AreaBasis;
  totalM2: number;
  projectIds: string[];
}

/**
 * The non-empty per-basis figures of a breakdown, restricted to `bases`, in
 * the given order. One entry per basis; never combined.
 */
export function basisFigures(breakdown: AreaBreakdown, bases: readonly AreaBasis[]): BasisFigure[] {
  return bases
    .map((basis) => ({ basis, totalM2: breakdown[basis].totalM2, projectIds: breakdown[basis].projectIds }))
    .filter((f) => f.projectIds.length > 0);
}

/** The facility's floor measure (the shared `floorFigure`: GFA, GLA, built-up, else a basis-not-stated primary figure). */
export function floorMeasure(p: Pick<Project, 'areas' | 'primaryAreaIndex'>): AreaMeasure | undefined {
  return floorFigure(p)?.measure;
}

/** The measure to show in a one-line table cell: the floor figure, else the primary, else the largest measure. */
export function headlineMeasure(p: Pick<Project, 'areas' | 'primaryAreaIndex'>): AreaMeasure | undefined {
  const floor = floorMeasure(p);
  if (floor) return floor;
  const primary = p.primaryAreaIndex !== undefined ? p.areas[p.primaryAreaIndex] : undefined;
  if (primary) return primary;
  return [...p.areas].sort((a, b) => b.valueM2 - a.valueM2)[0];
}

export const SIZE_BANDS = [
  { id: 'lt10k', label: 'Under 10,000 m²', min: 0, max: 10_000 },
  { id: '10k-50k', label: '10,000–50,000 m²', min: 10_000, max: 50_000 },
  { id: '50k-100k', label: '50,000–100,000 m²', min: 50_000, max: 100_000 },
  { id: 'gte100k', label: '100,000 m² and over', min: 100_000, max: Infinity },
  { id: 'undisclosed', label: 'Area not disclosed', min: NaN, max: NaN },
] as const;
export type SizeBandId = (typeof SIZE_BANDS)[number]['id'];

/** Size band by the facility's floor figure (whatever its basis). */
export function sizeBandOf(p: Pick<Project, 'areas' | 'primaryAreaIndex'>): SizeBandId {
  const m = floorMeasure(p);
  if (!m) return 'undisclosed';
  for (const b of SIZE_BANDS) if (m.valueM2 >= b.min && m.valueM2 < b.max) return b.id;
  return 'undisclosed';
}
