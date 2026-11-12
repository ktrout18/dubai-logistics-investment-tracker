/**
 * The briefing model: every headline sentence, row, chip, descriptor, date
 * label, colour category and subtotal shown on the Overview headline and the
 * briefing snapshot (and its print/PDF output) is built here, ONLY from the
 * audited structured fields of each record and the counting rules in
 * `definitions.ts` / `metrics.ts`. No wording or figure is hand-kept.
 *
 * Pure functions; no I/O, no Node or DOM APIs.
 */
import {
  DELIVERY_LABELS,
  assetGroupOf,
  deliveryKindOf,
  eligibleProjects,
  investmentScopeOf,
  isWarehouseAsset,
  sumInvestments,
  type AssetGroup,
  type DeliveryKind,
  type InvestmentSums,
} from './definitions.ts';
import { AREA_BASIS_SHORT, formatDate, formatM2, formatMeasureM2, formatMoney } from './format.ts';
import {
  FLOOR_FIGURE_BASES,
  floorFigure,
  isDeliveredInYear,
  sumFloorSpace,
  type FloorFigureBasis,
} from './metrics.ts';
import { cleanCompanyName, companyKey, normaliseText, normaliseZone } from './normalise.ts';
import type { AreaBasis, AreaQualifier, EventType, GradeAStatus, InvestmentScope, Project, ProjectEvent, ProjectStatus } from './schema.ts';
import {
  ASSET_TYPE_LABELS,
  COMMITTED_NOT_STARTED_STATUSES,
  EVENT_TYPE_LABELS,
  INVESTMENT_SCOPE_LABELS,
  NON_BINDING_STATUSES,
  PROJECT_STATUS_LABELS,
  periodEnd,
  periodStart,
} from './schema.ts';

// ---------------------------------------------------------------------------
// Colour categories (one rule, applied everywhere)
// ---------------------------------------------------------------------------

/**
 * Colour category of a row. Rule: other logistics infrastructure (any
 * non-warehouse asset) → `other_infrastructure`; a warehouse asset with
 * gradeA `confirmed` → `grade_a`; every other warehouse asset (including
 * Grade-A *probable*, which also carries the tag "Grade A (probable)") →
 * `other_modern`.
 */
export const BRIEFING_CATEGORIES = ['grade_a', 'other_modern', 'other_infrastructure'] as const;
export type BriefingCategory = (typeof BRIEFING_CATEGORIES)[number];
export const BRIEFING_CATEGORY_LABELS: Record<BriefingCategory, string> = {
  grade_a: 'Grade A warehouse (confirmed)',
  other_modern: 'Other modern warehouse',
  other_infrastructure: 'Other logistics infrastructure',
};
/** Tag shown on a row whose Grade-A status is probable (it keeps the other-modern colour). */
export const GRADE_A_PROBABLE_TAG = 'Grade A (probable)';

export function briefingCategoryOf(p: Pick<Project, 'assetType' | 'gradeA'>): BriefingCategory {
  if (!isWarehouseAsset(p)) return 'other_infrastructure';
  return p.gradeA === 'confirmed' ? 'grade_a' : 'other_modern';
}

// ---------------------------------------------------------------------------
// Partners and descriptor (derived from the parties fields and the name)
// ---------------------------------------------------------------------------

/**
 * Company chips: operator, developer, owner, investor, then other companies,
 * de-duplicated by `companyKey`; a name whose key is contained in one already
 * chosen (e.g. "Arcapita" after "Lintara Properties (Arcapita)"), or whose name
 * without its bracketed note is (e.g. "dnata (Emirates Group)" after "dnata
 * Logistics"), is dropped.
 */
export function partnersOf(p: Pick<Project, 'operator' | 'developer' | 'owner' | 'investor' | 'companies'>, max = 3): string[] {
  const out: string[] = [];
  const keys: string[] = [];
  for (const n of [p.operator, p.developer, p.owner, p.investor, ...p.companies]) {
    if (!n?.trim()) continue;
    const full = companyKey(n);
    const base = baseKey(n);
    if (!full || [full, base].some((k) => k && keys.some((q) => ` ${q} `.includes(` ${k} `)))) continue;
    keys.push(full);
    out.push(cleanCompanyName(n));
  }
  return out.slice(0, max);
}

/** Company key without any bracketed note: "CWT-SML Logistics (Toll Group)" → "cwt sml logistics". */
function baseKey(name: string): string {
  return companyKey(name.replace(/\s*\([^)]*\)/g, ''));
}

function stripLeading(text: string, prefixes: readonly string[]): string {
  let s = text.trim();
  let changed = true;
  while (changed && s) {
    changed = false;
    s = s.replace(/^[/&,–-]\s*/, '');
    for (const pre of prefixes) {
      if (!pre) continue;
      const re = new RegExp(`^${pre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\s/,–-]|$)`);
      if (re.test(s) && s.length > pre.length + 1) {
        s = s.replace(re, '').trim();
        changed = true;
      }
    }
  }
  return s;
}

/**
 * Short facility descriptor derived from the record: the record's name minus
 * its trailing location (after the last comma) and any bracketed note, minus
 * leading company names already shown as chips, plus the phase label, plus
 * "for {operator}" when a developer or owner is named and the operator is a
 * different company. E.g. "DSV build-to-suit warehouse, JAFZA South Campus
 * (Lintara / Arcapita)" → "Build-to-suit warehouse for DSV".
 */
export function describeFacility(
  p: Pick<Project, 'name' | 'operator' | 'developer' | 'owner' | 'investor' | 'companies' | 'zone' | 'phaseLabel' | 'assetType'>,
): string {
  let base = p.name.replace(/\s*\([^)]*\)/g, '').trim();
  const lastComma = base.lastIndexOf(',');
  if (lastComma > 0) base = base.slice(0, lastComma).trim();
  const names = [p.operator, p.developer, p.owner, p.investor, ...p.companies]
    .filter((n): n is string => Boolean(n?.trim()))
    .flatMap((n) => {
      const clean = cleanCompanyName(n.replace(/\s*\([^)]*\)/g, ''));
      return [clean, clean.split(/\s+/)[0]!];
    })
    .filter((n) => n.length >= 3)
    .sort((a, b) => b.length - a.length);
  let d = stripLeading(base, names);
  if (p.zone) {
    const z = normaliseZone(p.zone);
    d = d.replace(new RegExp(`\\s*[–-]\\s*${z.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), '').trim();
  }
  if (!d) d = ASSET_TYPE_LABELS[p.assetType];
  d = d.charAt(0).toUpperCase() + d.slice(1);
  if (p.phaseLabel && !normaliseText(d).includes(normaliseText(p.phaseLabel))) d = `${d}, ${p.phaseLabel}`;
  const op = p.operator?.trim();
  const others = [p.developer, p.owner].filter((n): n is string => Boolean(n?.trim()));
  if (op && others.length && others.every((n) => baseKey(n) !== baseKey(op)) && !normaliseText(d).includes(normaliseText(op))) {
    d = `${d} for ${cleanCompanyName(op)}`;
  }
  return d;
}

/** Location label: the normalised industrial zone, else the stated location. */
export function locationLabelOf(p: Pick<Project, 'zone' | 'location'>): string {
  return p.zone ? normaliseZone(p.zone) : p.location;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/** Event types whose own date can predate the release that reports them. */
const EVENT_TYPES_DATED_BY_EVENT: readonly EventType[] = [
  'opened',
  'commissioned',
  'construction_completed',
  'construction_start',
  'agreement_signed',
  'mou',
  'term_sheet',
];

function withinPeriod(iso: string | undefined, date: string, precision: Parameters<typeof periodStart>[1]): boolean {
  return iso !== undefined && iso >= periodStart(date, precision) && iso <= periodEnd(date, precision);
}

/**
 * True when the actual completion is stored at month/quarter/year precision
 * and its source was published inside that same period: the period was then
 * taken from the release, and the event itself may have happened earlier.
 */
export function completionMayBeEarlier(p: Pick<Project, 'actualCompletion' | 'sources'>): boolean {
  const c = p.actualCompletion;
  if (!c || c.datePrecision === 'day') return false;
  const src = p.sources.find((s) => s.url === c.sourceUrl);
  return withinPeriod(src?.publishedDate, c.date, c.datePrecision);
}

/** Same test for one event (event types that happen before they are reported). */
export function eventMayBeEarlier(e: Pick<ProjectEvent, 'type' | 'date' | 'datePrecision' | 'sourcePublishedDate'>): boolean {
  if (e.datePrecision === 'day' || !EVENT_TYPES_DATED_BY_EVENT.includes(e.type)) return false;
  return withinPeriod(e.sourcePublishedDate, e.date, e.datePrecision);
}

/** Sentence shown wherever a date may be earlier than stored. */
export const MAY_BE_EARLIER_NOTE =
  'The source gives no day for this event; the period shown is when the source reported it, and the event may have happened earlier.';

export interface DateLabel {
  text: string;
  kind: 'actual' | 'forecast' | 'milestone';
  mayBeEarlier: boolean;
  /** Forecast whose period has ended without a sourced completion. */
  forecastPassed: boolean;
}

/** Date wording for any record, from structured fields only. Forecasts are always labelled as forecasts. */
export function dateLabelOf(p: Project, today: string): DateLabel {
  if (p.actualCompletion) {
    return {
      text: formatDate(p.actualCompletion.date, p.actualCompletion.datePrecision),
      kind: 'actual',
      mayBeEarlier: completionMayBeEarlier(p),
      forecastPassed: false,
    };
  }
  const fc = p.forecastCompletion;
  const fcPassed = fc ? periodEnd(fc.date, fc.datePrecision) < today : false;
  const fcText = fc ? `forecast ${formatDate(fc.date, fc.datePrecision)}${fcPassed ? ' (date passed)' : ''}` : '';
  if (p.status === 'under_construction') {
    if (fc) return { text: fcText.charAt(0).toUpperCase() + fcText.slice(1), kind: 'forecast', mayBeEarlier: false, forecastPassed: fcPassed };
    const start = [...p.events].reverse().find((e) => e.type === 'construction_start');
    if (start) return { text: `Started ${formatDate(start.date, start.datePrecision)}`, kind: 'milestone', mayBeEarlier: eventMayBeEarlier(start), forecastPassed: false };
  }
  const last = p.events[p.events.length - 1];
  const lm = last
    ? `${EVENT_TYPE_LABELS[last.type]} ${formatDate(last.date, last.datePrecision)}`
    : `${PROJECT_STATUS_LABELS[p.status]} ${formatDate(p.latestMilestone.date, p.latestMilestone.datePrecision)}`;
  return {
    text: fc ? `${lm} · ${fcText}` : lm,
    kind: fc ? 'forecast' : 'milestone',
    mayBeEarlier: last ? eventMayBeEarlier(last) : false,
    forecastPassed: fcPassed,
  };
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export interface BriefingArea {
  valueM2: number;
  basis: AreaBasis;
  qualifier?: AreaQualifier;
  /** "over 67,000 m²" — the one formatter. */
  figure: string;
  /** "GFA", "GLA", "Built-up (mixed use)", "Basis not stated", "Site / land"… */
  basisTag: string;
  /** True only for a warehouse asset's floor figure: drawn as a floor-space bar and subtotalled. */
  bar: boolean;
  /** False for basis-not-stated figures (drawn outlined). */
  basisStated: boolean;
}

export interface BriefingRow {
  id: string;
  name: string;
  partners: string[];
  descriptor: string;
  location: string;
  assetTypeLabel: string;
  assetGroup: AssetGroup;
  status: ProjectStatus;
  statusLabel: string;
  deliveryKind?: DeliveryKind;
  deliveryLabel?: string;
  category: BriefingCategory;
  gradeA: GradeAStatus;
  /** "Grade A (probable)" for probable warehouse rows. */
  gradeTag?: string;
  date: DateLabel;
  /** The facility's floor figure (see `floorFigure`), if it has one. */
  floor?: BriefingArea;
  /** When there is no floor figure: the largest other measure (site, yard, district), never drawn as a bar. */
  otherArea?: BriefingArea;
  /** One-line area text: "26,013 m² GFA", "over 67,000 m² Basis not stated", "Area not disclosed". */
  areaText: string;
  investment?: { text: string; scope: InvestmentScope; scopeLabel: string };
}

function areaOf(valueM2: number, basis: AreaBasis, qualifier: AreaQualifier | undefined, bar: boolean): BriefingArea {
  return {
    valueM2,
    basis,
    ...(qualifier ? { qualifier } : {}),
    figure: formatMeasureM2({ valueM2, ...(qualifier ? { qualifier } : {}) }),
    basisTag: AREA_BASIS_SHORT[basis],
    bar,
    basisStated: basis !== 'unspecified',
  };
}

export function briefingRowOf(p: Project, today: string): BriefingRow {
  const wh = isWarehouseAsset(p);
  const ff = floorFigure(p);
  const floor = ff ? areaOf(ff.measure.valueM2, ff.basis, ff.measure.qualifier, wh) : undefined;
  let otherArea: BriefingArea | undefined;
  if (!floor && p.areas.length) {
    const m = [...p.areas].sort((a, b) => b.valueM2 - a.valueM2)[0]!;
    otherArea = areaOf(m.valueM2, m.basis, m.qualifier, false);
  }
  const shown = floor ?? otherArea;
  const dk = deliveryKindOf(p);
  const inv = p.investment;
  const scope = investmentScopeOf(inv);
  return {
    id: p.id,
    name: p.name,
    partners: partnersOf(p),
    descriptor: describeFacility(p),
    location: locationLabelOf(p),
    assetTypeLabel: ASSET_TYPE_LABELS[p.assetType],
    assetGroup: assetGroupOf(p),
    status: p.status,
    statusLabel: PROJECT_STATUS_LABELS[p.status],
    ...(dk ? { deliveryKind: dk, deliveryLabel: DELIVERY_LABELS[dk] } : {}),
    category: briefingCategoryOf(p),
    gradeA: p.gradeA,
    ...(wh && p.gradeA === 'probable' ? { gradeTag: GRADE_A_PROBABLE_TAG } : {}),
    date: dateLabelOf(p, today),
    ...(floor ? { floor } : {}),
    ...(otherArea ? { otherArea } : {}),
    areaText: shown ? `${shown.figure} ${shown.basisTag}` : 'Area not disclosed',
    ...(inv?.disclosed && inv.amount !== undefined && inv.currency
      ? { investment: { text: formatMoney(inv.amount, inv.currency), scope, scopeLabel: INVESTMENT_SCOPE_LABELS[scope] } }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Sections and subtotals
// ---------------------------------------------------------------------------

export interface FloorSubtotal {
  basis: FloorFigureBasis;
  basisTag: string;
  totalM2: number;
  /** formatM2(totalM2): the one formatter and rounding rule. */
  text: string;
  projectIds: string[];
  /** Contributing figures that carry a qualifier ("over", "nearly", "about"). */
  qualifiedIds: string[];
}

export interface BriefingSection {
  rows: BriefingRow[];
  warehouseIds: string[];
  otherInfrastructureIds: string[];
  /** Warehouse rows with a floor figure (they make the subtotals). */
  floorDisclosedIds: string[];
  /** Per-basis subtotals of warehouse rows' floor figures, in FLOOR_FIGURE_BASES order; empty bases omitted. Never added together. */
  floorSubtotals: FloorSubtotal[];
  investment: InvestmentSums;
}

export interface Briefing {
  year: number;
  /** Computed headline, e.g. "In 2026, 11 logistics facilities opened in Dubai and 3 more completed construction." */
  headline: string;
  /** Per-basis floor-space sentence for the delivered rows. */
  deliveredFloorSentence: string;
  delivered: BriefingSection & { openedIds: string[]; constructionCompletedIds: string[] };
  beingBuilt: BriefingSection;
  signedOrAnnounced: BriefingSection;
}

function rowSort(a: BriefingRow, b: BriefingRow): number {
  const g = (r: BriefingRow) => (r.assetGroup === 'warehouse' ? 0 : 1);
  if (g(a) !== g(b)) return g(a) - g(b);
  const v = (r: BriefingRow) => (r.floor?.bar ? r.floor.valueM2 : -1);
  return v(b) - v(a) || a.name.localeCompare(b.name);
}

function section(projects: readonly Project[], today: string, sort: (a: BriefingRow, b: BriefingRow) => number): BriefingSection {
  const wh = projects.filter(isWarehouseAsset);
  const fs = sumFloorSpace(wh);
  return {
    rows: projects.map((p) => briefingRowOf(p, today)).sort(sort),
    warehouseIds: wh.map((p) => p.id),
    otherInfrastructureIds: projects.filter((p) => !isWarehouseAsset(p)).map((p) => p.id),
    floorDisclosedIds: wh.filter((p) => floorFigure(p)).map((p) => p.id),
    floorSubtotals: FLOOR_FIGURE_BASES.filter((b) => fs[b].projectIds.length).map((b) => ({
      basis: b,
      basisTag: AREA_BASIS_SHORT[b],
      totalM2: fs[b].totalM2,
      text: formatM2(fs[b].totalM2),
      projectIds: fs[b].projectIds,
      qualifiedIds: fs[b].qualifiedIds,
    })),
    investment: sumInvestments(projects),
  };
}

const facilities = (n: number) => `${n} logistics ${n === 1 ? 'facility' : 'facilities'}`;

/** The headline sentence, computed from the two delivery counts. */
export function deliveryHeadline(year: number, opened: number, completed: number): string {
  if (opened && completed) return `In ${year}, ${facilities(opened)} opened in Dubai and ${completed} more completed construction.`;
  if (opened) return `In ${year}, ${facilities(opened)} opened in Dubai.`;
  if (completed) return `In ${year}, ${facilities(completed)} in Dubai completed construction; none is reported as opened.`;
  return `No openings or completions of logistics facilities in Dubai are recorded for ${year} yet.`;
}

/** "26,013 m² GFA · 20,000 m² GLA · …" — per-basis subtotals side by side, never combined. */
export function subtotalsText(subtotals: readonly FloorSubtotal[]): string {
  return subtotals.map((s) => `${s.text} ${s.basisTag}`).join(' · ');
}

function floorSentence(s: BriefingSection): string {
  const n = s.warehouseIds.length;
  const k = s.floorDisclosedIds.length;
  if (!n) return 'None of these is a warehouse-type facility, so no warehouse floor space is reported.';
  const head = `${k} of the ${n} warehouse ${n === 1 ? 'facility' : 'facilities'} disclosed a floor area`;
  if (!k) return `${head}.`;
  return `${head}: ${subtotalsText(s.floorSubtotals)}. Each basis is a separate figure; they are never added together.`;
}

/**
 * The briefing for `year`, from eligible records only (Dubai, not an umbrella,
 * not cancelled):
 * - delivered: delivered in `year` (status operational or construction
 *   completed AND an actual completion in `year`), opened and construction
 *   completed counted separately;
 * - being built: status under construction;
 * - signed or announced: committed-not-started and non-binding statuses.
 * `today` (YYYY-MM-DD) decides whether a forecast date has passed.
 */
export function computeBriefing(projects: readonly Project[], year: number, today: string): Briefing {
  const eligible = eligibleProjects(projects);
  const delivered = eligible.filter((p) => isDeliveredInYear(p, year));
  const built = eligible.filter((p) => p.status === 'under_construction');
  const signedStatuses: readonly ProjectStatus[] = [...COMMITTED_NOT_STARTED_STATUSES, ...NON_BINDING_STATUSES];
  const signed = eligible.filter((p) => signedStatuses.includes(p.status));

  const d = section(delivered, today, rowSort);
  const openedIds = delivered.filter((p) => deliveryKindOf(p) === 'opened').map((p) => p.id);
  const constructionCompletedIds = delivered.filter((p) => deliveryKindOf(p) === 'construction_completed').map((p) => p.id);
  const byMilestone = (a: BriefingRow, b: BriefingRow) => {
    const pa = projects.find((p) => p.id === a.id)!.latestMilestone.date;
    const pb = projects.find((p) => p.id === b.id)!.latestMilestone.date;
    return pb.localeCompare(pa) || a.name.localeCompare(b.name);
  };
  return {
    year,
    headline: deliveryHeadline(year, openedIds.length, constructionCompletedIds.length),
    deliveredFloorSentence: floorSentence(d),
    delivered: { ...d, openedIds, constructionCompletedIds },
    beingBuilt: section(built, today, rowSort),
    signedOrAnnounced: section(signed, today, byMilestone),
  };
}
