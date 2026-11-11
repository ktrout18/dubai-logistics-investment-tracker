/**
 * Briefing-view labels for any project. Projects carrying a `presentation`
 * (the PDF's own wording) use it verbatim; projects without one (e.g. later
 * pipeline additions) get labels derived from their structured fields, so they
 * appear everywhere with sensible wording. Derived labels are never counted in
 * the briefing ("as reported") totals.
 */
import {
  ASSET_TYPE_LABELS,
  PROJECT_STATUS_LABELS,
  cleanCompanyName,
  companyKey,
  isDeliveredStatus,
  normaliseZone,
  yearOf,
  type AssetType,
  type Presentation,
  type PresentationCategory,
  type PresentationSection,
  type PresentedAreaKind,
  type Project,
  type Sector,
} from '../../shared/index.ts';
import { reportedFloorMeasure } from './areas.ts';
import { formatDate, formatM2, formatMoney } from './format.ts';

export const CATEGORY_COLORS: Record<PresentationCategory, string> = {
  grade_a_developer: '#00606B',
  other_modern: '#5DB7BF',
  specialised: '#37474F',
  land_site_yard: '#9AA3A8',
};

const SPECIALISED_SECTORS: readonly Sector[] = [
  'finished_vehicles',
  'chemicals_dangerous_goods',
  'aerospace_air_cargo',
  'multimodal_container_inland',
  'industrial_machinery',
];
const SPECIALISED_ASSETS: readonly AssetType[] = [
  'vehicle_processing_centre',
  'dangerous_goods_store',
  'air_cargo_terminal',
  'mro_aerospace_facility',
  'container_terminal_or_depot',
  'inland_port_or_rail',
];

export function partnersOf(p: Project): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const n of [p.developer, p.operator, p.investor, p.owner, ...p.companies]) {
    if (!n) continue;
    const k = companyKey(n);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(cleanCompanyName(n));
  }
  return out.slice(0, 3);
}

function derivedCategory(p: Project, kind: PresentedAreaKind | undefined): PresentationCategory {
  if (p.gradeA === 'confirmed' || p.gradeA === 'probable') return 'grade_a_developer';
  if (kind && kind !== 'floor') return 'land_site_yard';
  if (p.sectors.some((s) => SPECIALISED_SECTORS.includes(s)) || SPECIALISED_ASSETS.includes(p.assetType)) return 'specialised';
  return 'other_modern';
}

function derivedSection(p: Project): PresentationSection {
  if (isDeliveredStatus(p.status)) return 'openings';
  if (p.status === 'under_construction') return 'being_built';
  if (p.status === 'cancelled') return 'not_counted';
  return 'signed_or_announced';
}

/** Date wording in the briefing's style, from structured fields. Forecasts are always labelled. */
export function derivedDateLabel(p: Project): string {
  if (p.actualCompletion) return formatDate(p.actualCompletion.date, p.actualCompletion.datePrecision);
  if (p.forecastCompletion) return `Due ${formatDate(p.forecastCompletion.date, p.forecastCompletion.datePrecision)} (forecast)`;
  return `${PROJECT_STATUS_LABELS[p.status]}, ${formatDate(p.latestMilestone.date, p.latestMilestone.datePrecision)}`;
}

/** Presentation derived from structured fields (never counted in briefing totals unless `counted`). */
export function derivePresentation(p: Project, opts: { counted?: boolean } = {}): Presentation {
  const floor = reportedFloorMeasure(p);
  let presentedAreaM2: number | undefined;
  let kind: PresentedAreaKind | undefined;
  let areaLabel: string;
  if (floor) {
    presentedAreaM2 = floor.valueM2;
    kind = 'floor';
    areaLabel = formatM2(floor.valueM2);
  } else {
    const other = [...p.areas].sort((a, b) => b.valueM2 - a.valueM2)[0];
    if (other && other.basis !== 'unspecified') {
      presentedAreaM2 = other.valueM2;
      kind = other.basis === 'open_yard' ? 'yard' : other.basis === 'district_area' ? 'district' : 'land';
      areaLabel = `${formatM2(other.valueM2)} ${kind === 'yard' ? 'yard' : kind === 'district' ? 'district' : 'site'}`;
    } else {
      const inv = p.investment?.disclosed && p.investment.amount && p.investment.currency
        ? ` (${formatMoney(p.investment.amount, p.investment.currency)})`
        : '';
      areaLabel = `Not disclosed${inv}`;
    }
  }
  const inv =
    p.investment?.disclosed && p.investment.amount && p.investment.currency
      ? `, ${formatMoney(p.investment.amount, p.investment.currency)}`
      : '';
  return {
    section: derivedSection(p),
    partners: partnersOf(p),
    descriptor: `${p.facilityName ?? ASSET_TYPE_LABELS[p.assetType]}${inv}`,
    locationLabel: p.zone ? normaliseZone(p.zone) : p.location,
    areaLabel,
    ...(presentedAreaM2 !== undefined ? { presentedAreaM2, presentedAreaKind: kind } : {}),
    countedInPresentedTotal: Boolean(opts.counted && kind === 'floor'),
    dateLabel: derivedDateLabel(p),
    category: derivedCategory(p, kind),
    ...(p.status === 'construction_completed' ? { presentedMilestone: 'completed_only' as const } : {}),
    sortOrder: 1000 + (presentedAreaM2 ? -presentedAreaM2 / 1e7 : 0),
  };
}

/** The project's presentation, or a derived one (flagged) when it has none. */
export function displayPresentation(p: Project): Presentation & { derived: boolean } {
  return p.presentation ? { ...p.presentation, derived: false } : { ...derivePresentation(p), derived: true };
}

/** The year the briefing describes: the most common actual-completion year among its openings rows. */
export function briefingYearOf(openingRows: readonly Project[]): number | undefined {
  const counts = new Map<number, number>();
  for (const p of openingRows) if (p.actualCompletion) {
    const y = yearOf(p.actualCompletion.date);
    counts.set(y, (counts.get(y) ?? 0) + 1);
  }
  let best: number | undefined;
  let bestN = 0;
  for (const [y, n] of counts) if (n > bestN || (n === bestN && best !== undefined && y > best)) {
    best = y;
    bestN = n;
  }
  return best;
}
