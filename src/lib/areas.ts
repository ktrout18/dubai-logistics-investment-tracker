/**
 * Area helpers for the UI. The hard rule: a square-metre figure is always
 * tied to ONE basis. Nothing in here adds figures of different bases.
 */
import {
  NON_FLOOR_BASES,
  primaryAreaMeasure,
  selectAreasByBasis,
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

/** The measure that represents the project's floor space (primary if it is a building basis, else largest building measure). */
export function floorMeasure(p: Pick<Project, 'areas' | 'primaryAreaIndex'>): AreaMeasure | undefined {
  const primary = p.primaryAreaIndex !== undefined ? p.areas[p.primaryAreaIndex] : undefined;
  if (primary && (BUILDING_BASES as readonly AreaBasis[]).includes(primary.basis)) return primary;
  const sel = selectAreasByBasis(p);
  for (const b of BUILDING_BASES) {
    const s = sel[b];
    if (s) return p.areas[s.index];
  }
  return undefined;
}

/** The measure to show in a one-line table cell: floor measure, else primary, else the largest. */
export function headlineMeasure(p: Pick<Project, 'areas' | 'primaryAreaIndex'>): AreaMeasure | undefined {
  const floor = reportedFloorMeasure(p);
  if (floor) return floor;
  const primary = p.primaryAreaIndex !== undefined ? p.areas[p.primaryAreaIndex] : undefined;
  if (primary) return primary;
  return [...p.areas].sort((a, b) => b.valueM2 - a.valueM2)[0];
}

/** Floor measure, or failing that the source's area of unstated basis (reported as floor space). */
export function reportedFloorMeasure(p: Pick<Project, 'areas' | 'primaryAreaIndex'>): AreaMeasure | undefined {
  const floor = floorMeasure(p);
  if (floor) return floor;
  const primary = primaryAreaMeasure(p);
  return primary?.basis === 'unspecified' ? primary : undefined;
}

export const SIZE_BANDS = [
  { id: 'lt10k', label: 'Under 10,000 m²', min: 0, max: 10_000 },
  { id: '10k-50k', label: '10,000–50,000 m²', min: 10_000, max: 50_000 },
  { id: '50k-100k', label: '50,000–100,000 m²', min: 50_000, max: 100_000 },
  { id: 'gte100k', label: '100,000 m² and over', min: 100_000, max: Infinity },
  { id: 'undisclosed', label: 'Floor area not disclosed', min: NaN, max: NaN },
] as const;
export type SizeBandId = (typeof SIZE_BANDS)[number]['id'];

/** Size band by floor measure (GFA, GLA or mixed building area — whichever represents the facility). */
export function sizeBandOf(p: Pick<Project, 'areas' | 'primaryAreaIndex'>): SizeBandId {
  const m = reportedFloorMeasure(p);
  if (!m) return 'undisclosed';
  for (const b of SIZE_BANDS) if (m.valueM2 >= b.min && m.valueM2 < b.max) return b.id;
  return 'undisclosed';
}
