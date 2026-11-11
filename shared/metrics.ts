/**
 * Headline metrics. Pure functions; no I/O.
 *
 * Counting rules (enforced here and nowhere else):
 * 1. Areas of different bases are NEVER summed together. Every area figure is
 *    an `AreaBreakdown` (one total per basis). Warehouse floor space means
 *    `warehouse_gfa` and `gla` only, reported as two separate numbers;
 *    `mixed_building_area` is reported separately; `site_land_area`,
 *    `open_yard`, `district_area` and `unspecified` sit in their own buckets
 *    and never enter floor-space figures.
 * 2. Only Dubai, countable (non-umbrella), non-cancelled projects enter
 *    totals. Regional (non-Dubai) projects get a separate summary.
 * 3. "Delivered in year Y" = status construction_completed or operational AND
 *    `actualCompletion.date` falls in Y. A forecast date never counts.
 *
 * Phasing: a project that has child phases (any project whose `parentId`
 * points at it) is an UMBRELLA. Umbrellas are excluded from all totals; their
 * phases count instead. `isUmbrella` / `countableProjects` are the single
 * place this rule lives.
 *
 * Area selection: per project and per basis exactly ONE measure is used, so
 * overlapping figures of the same basis are never added: the measure at
 * `primaryAreaIndex` for its own basis, otherwise the largest measure of that
 * basis. (The validator warns when a project has several measures of one basis.)
 */
import type { AreaBasis, Project, ProjectStatus } from './schema.ts';
import {
  AREA_BASES,
  COMMITTED_NOT_STARTED_STATUSES,
  INVESTMENT_ANNOUNCEMENT_EVENT_TYPES,
  NON_BINDING_STATUSES,
  WAREHOUSE_FLOOR_BASES,
  isDeliveredStatus,
  yearOf,
} from './schema.ts';
import { roundTo } from './units.ts';

// ---------------------------------------------------------------------------
// Phasing
// ---------------------------------------------------------------------------

/** Set of ids that are the `parentId` of at least one project. */
export function umbrellaIdSet(all: readonly Pick<Project, 'parentId'>[]): Set<string> {
  const s = new Set<string>();
  for (const p of all) if (p.parentId) s.add(p.parentId);
  return s;
}

/** True when any project in `all` names `project` as its parent. */
export function isUmbrella(project: Pick<Project, 'id'>, all: readonly Pick<Project, 'parentId'>[]): boolean {
  return all.some((q) => q.parentId === project.id);
}

/** Projects that may enter totals: everything except umbrellas (phases count instead). */
export function countableProjects<T extends Pick<Project, 'id' | 'parentId'>>(all: readonly T[]): T[] {
  const umbrellas = umbrellaIdSet(all);
  return all.filter((p) => !umbrellas.has(p.id));
}

/** Direct child phases of `parentId`, in register order. */
export function phasesOf<T extends Pick<Project, 'parentId'>>(parentId: string, all: readonly T[]): T[] {
  return all.filter((p) => p.parentId === parentId);
}

// ---------------------------------------------------------------------------
// Areas
// ---------------------------------------------------------------------------

export interface SelectedArea {
  valueM2: number;
  /** Index into `project.areas`. */
  index: number;
}

/** One measure per basis for a project (see module doc for the selection rule). */
export function selectAreasByBasis(p: Pick<Project, 'areas' | 'primaryAreaIndex'>): Partial<Record<AreaBasis, SelectedArea>> {
  const out: Partial<Record<AreaBasis, SelectedArea>> = {};
  const primary = p.primaryAreaIndex !== undefined ? p.areas[p.primaryAreaIndex] : undefined;
  if (primary && p.primaryAreaIndex !== undefined) {
    out[primary.basis] = { valueM2: primary.valueM2, index: p.primaryAreaIndex };
  }
  p.areas.forEach((a, i) => {
    if (primary && a.basis === primary.basis) return;
    const cur = out[a.basis];
    if (!cur || a.valueM2 > cur.valueM2) out[a.basis] = { valueM2: a.valueM2, index: i };
  });
  return out;
}

export interface BasisTotal {
  /** Sum in m², rounded to 2 dp. */
  totalM2: number;
  /** Projects contributing to this basis total. */
  projectIds: string[];
}

/** One total per area basis. Never add totals of different bases together. */
export type AreaBreakdown = Record<AreaBasis, BasisTotal>;

export function emptyAreaBreakdown(): AreaBreakdown {
  const b = {} as AreaBreakdown;
  for (const basis of AREA_BASES) b[basis] = { totalM2: 0, projectIds: [] };
  return b;
}

/** Per-basis totals for a set of projects (one measure per project per basis). */
export function sumAreasByBasis(projects: readonly Pick<Project, 'id' | 'areas' | 'primaryAreaIndex'>[]): AreaBreakdown {
  const raw: Record<string, number> = {};
  const b = emptyAreaBreakdown();
  for (const p of projects) {
    const sel = selectAreasByBasis(p);
    for (const basis of AREA_BASES) {
      const s = sel[basis];
      if (!s) continue;
      raw[basis] = (raw[basis] ?? 0) + s.valueM2;
      b[basis].projectIds.push(p.id);
    }
  }
  for (const basis of AREA_BASES) b[basis].totalM2 = roundTo(raw[basis] ?? 0, 2);
  return b;
}

/** True when the project has a warehouse_gfa, gla or mixed_building_area measure. */
export function hasBuildingArea(p: Pick<Project, 'areas'>): boolean {
  return p.areas.some(
    (a) => (WAREHOUSE_FLOOR_BASES as readonly AreaBasis[]).includes(a.basis) || a.basis === 'mixed_building_area',
  );
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** A set of projects with its per-basis area breakdown. */
export interface ProjectBucket {
  projectCount: number;
  projectIds: string[];
  areas: AreaBreakdown;
  /** Projects in the bucket with no warehouse_gfa / gla / mixed_building_area figure (floor space undisclosed). */
  withoutBuildingAreaIds: string[];
  /**
   * Reported area whose basis the source does not state: Σ over bucket
   * projects whose PRIMARY measure (`primaryAreaIndex`, else the first
   * measure) has basis `unspecified`, counting that primary measure only.
   * Secondary unspecified measures are excluded. Never add this to any other
   * basis total.
   */
  primaryUnspecified: BasisTotal;
  /** Projects in the bucket with no area measure at all (area not disclosed). */
  withoutAnyAreaIds: string[];
}

export interface StatusCount {
  count: number;
  projectIds: string[];
}

export interface CurrencyTotal {
  /** Sum of `investment.amount` in this currency (full units, not millions). */
  total: number;
  projectIds: string[];
}

export interface InvestmentAnnouncements {
  year: number;
  /** Event types that qualify (INVESTMENT_ANNOUNCEMENT_EVENT_TYPES). */
  eventTypes: readonly string[];
  /** Countable Dubai projects with ≥1 qualifying event dated in `year`. */
  projectCount: number;
  projectIds: string[];
  /** Number of qualifying events (a project can have several, e.g. MoU then agreement). */
  eventCount: number;
  events: { projectId: string; eventId: string; type: string; date: string }[];
  disclosed: {
    projectCount: number;
    projectIds: string[];
    /** Summed per currency; currencies are never converted or combined. */
    byCurrency: Record<string, CurrencyTotal>;
    /** Sum of `amountAed` where present (stated, native or peg-derived). Coverage may be partial. */
    aedWhereAvailable: {
      total: number;
      projectIds: string[];
      /** Subset whose AED figure was derived from USD at the peg rather than stated. */
      derivedProjectIds: string[];
    };
  };
  /** Qualifying projects with no investment value disclosed. */
  undisclosed: StatusCount;
  /**
   * Umbrella projects with a qualifying event in `year`. Listed for context
   * only: never counted or summed (their phases are counted instead).
   */
  umbrellaProjectIds: string[];
}

export interface RegionalSummary {
  /** Non-Dubai, countable, non-cancelled projects. */
  projectCount: number;
  projectIds: string[];
  byEmirate: Record<string, StatusCount>;
  byStatus: Partial<Record<ProjectStatus, StatusCount>>;
  deliveredInYear: ProjectBucket;
  underConstruction: ProjectBucket;
}

export interface Metrics {
  year: number;
  scope: {
    /** Dubai, countable, non-cancelled projects: the population for all Dubai figures. */
    includedProjectIds: string[];
    excludedUmbrellaIds: string[];
    excludedCancelledIds: string[];
    regionalProjectIds: string[];
  };
  /** Delivered in `year` with gradeA === 'confirmed'. */
  gradeADelivered: ProjectBucket;
  /** Delivered in `year` with gradeA === 'probable'. Never merged into confirmed. */
  gradeAProbableDelivered: ProjectBucket;
  /** Delivered in `year` with gradeA 'unverified' or 'not_applicable'. */
  otherModernDelivered: ProjectBucket;
  underConstruction: {
    /** Grade-A confirmed + probable. */
    gradeA: ProjectBucket;
    gradeAConfirmed: ProjectBucket;
    gradeAProbable: ProjectBucket;
    /** Not confirmed/probable Grade-A. */
    other: ProjectBucket;
    all: ProjectBucket;
  };
  committedNotStarted: ProjectBucket & {
    byStatus: Record<(typeof COMMITTED_NOT_STARTED_STATUSES)[number], StatusCount>;
  };
  nonBinding: StatusCount & {
    byStatus: Record<(typeof NON_BINDING_STATUSES)[number], StatusCount>;
  };
  investmentAnnouncements: InvestmentAnnouncements;
  /** Included projects with ≥1 source read directly (`verification === 'direct'`). */
  verifiedProjectCount: StatusCount;
  regionalContext: RegionalSummary;
}

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

/** Rule 3: delivered status AND actual (never forecast) completion dated in `year`. */
export function isDeliveredInYear(
  p: Pick<Project, 'status' | 'actualCompletion'>,
  year: number,
): boolean {
  return isDeliveredStatus(p.status) && p.actualCompletion !== undefined && yearOf(p.actualCompletion.date) === year;
}

/** The project's primary area measure: `primaryAreaIndex`, else the first measure. */
export function primaryAreaMeasure(p: Pick<Project, 'areas' | 'primaryAreaIndex'>): Project['areas'][number] | undefined {
  return (p.primaryAreaIndex !== undefined ? p.areas[p.primaryAreaIndex] : undefined) ?? p.areas[0];
}

/** Σ primary measures with basis `unspecified` (see `ProjectBucket.primaryUnspecified`). */
export function sumPrimaryUnspecified(projects: readonly Pick<Project, 'id' | 'areas' | 'primaryAreaIndex'>[]): BasisTotal {
  let total = 0;
  const projectIds: string[] = [];
  for (const p of projects) {
    const m = primaryAreaMeasure(p);
    if (m?.basis !== 'unspecified') continue;
    total += m.valueM2;
    projectIds.push(p.id);
  }
  return { totalM2: roundTo(total, 2), projectIds };
}

function bucket(projects: readonly Project[]): ProjectBucket {
  return {
    projectCount: projects.length,
    projectIds: projects.map((p) => p.id),
    areas: sumAreasByBasis(projects),
    withoutBuildingAreaIds: projects.filter((p) => !hasBuildingArea(p)).map((p) => p.id),
    primaryUnspecified: sumPrimaryUnspecified(projects),
    withoutAnyAreaIds: projects.filter((p) => p.areas.length === 0).map((p) => p.id),
  };
}

function statusCount(projects: readonly Project[]): StatusCount {
  return { count: projects.length, projectIds: projects.map((p) => p.id) };
}

const isGradeA = (p: Project) => p.gradeA === 'confirmed' || p.gradeA === 'probable';

// ---------------------------------------------------------------------------
// computeMetrics
// ---------------------------------------------------------------------------

/**
 * Compute every headline figure for calendar year `year` (delivery and
 * announcement figures are year-specific; pipeline-stage figures reflect
 * current status). Every number is accompanied by the project ids behind it.
 */
export function computeMetrics(projects: readonly Project[], year: number): Metrics {
  const umbrellas = umbrellaIdSet(projects);
  const countable = projects.filter((p) => !umbrellas.has(p.id));
  const dubai = countable.filter((p) => p.emirate === 'Dubai');
  const included = dubai.filter((p) => p.status !== 'cancelled');
  const regional = countable.filter((p) => p.emirate !== 'Dubai' && p.status !== 'cancelled');

  const delivered = included.filter((p) => isDeliveredInYear(p, year));
  const uc = included.filter((p) => p.status === 'under_construction');

  const committed = included.filter((p) =>
    (COMMITTED_NOT_STARTED_STATUSES as readonly ProjectStatus[]).includes(p.status),
  );
  const nonBinding = included.filter((p) => (NON_BINDING_STATUSES as readonly ProjectStatus[]).includes(p.status));

  const committedByStatus = {} as Metrics['committedNotStarted']['byStatus'];
  for (const s of COMMITTED_NOT_STARTED_STATUSES) committedByStatus[s] = statusCount(committed.filter((p) => p.status === s));
  const nonBindingByStatus = {} as Metrics['nonBinding']['byStatus'];
  for (const s of NON_BINDING_STATUSES) nonBindingByStatus[s] = statusCount(nonBinding.filter((p) => p.status === s));

  const byEmirate: Record<string, StatusCount> = {};
  const byStatus: Partial<Record<ProjectStatus, StatusCount>> = {};
  for (const p of regional) {
    (byEmirate[p.emirate] ??= { count: 0, projectIds: [] }).count++;
    byEmirate[p.emirate]!.projectIds.push(p.id);
    (byStatus[p.status] ??= { count: 0, projectIds: [] }).count++;
    byStatus[p.status]!.projectIds.push(p.id);
  }

  return {
    year,
    scope: {
      includedProjectIds: included.map((p) => p.id),
      excludedUmbrellaIds: projects.filter((p) => umbrellas.has(p.id)).map((p) => p.id),
      excludedCancelledIds: dubai.filter((p) => p.status === 'cancelled').map((p) => p.id),
      regionalProjectIds: projects.filter((p) => p.emirate !== 'Dubai').map((p) => p.id),
    },
    gradeADelivered: bucket(delivered.filter((p) => p.gradeA === 'confirmed')),
    gradeAProbableDelivered: bucket(delivered.filter((p) => p.gradeA === 'probable')),
    otherModernDelivered: bucket(delivered.filter((p) => !isGradeA(p))),
    underConstruction: {
      gradeA: bucket(uc.filter(isGradeA)),
      gradeAConfirmed: bucket(uc.filter((p) => p.gradeA === 'confirmed')),
      gradeAProbable: bucket(uc.filter((p) => p.gradeA === 'probable')),
      other: bucket(uc.filter((p) => !isGradeA(p))),
      all: bucket(uc),
    },
    committedNotStarted: { ...bucket(committed), byStatus: committedByStatus },
    nonBinding: { ...statusCount(nonBinding), byStatus: nonBindingByStatus },
    investmentAnnouncements: computeInvestmentAnnouncements(projects, included, umbrellas, year),
    verifiedProjectCount: statusCount(included.filter((p) => p.sources.some((s) => s.verification === 'direct'))),
    regionalContext: {
      projectCount: regional.length,
      projectIds: regional.map((p) => p.id),
      byEmirate,
      byStatus,
      deliveredInYear: bucket(regional.filter((p) => isDeliveredInYear(p, year))),
      underConstruction: bucket(regional.filter((p) => p.status === 'under_construction')),
    },
  };
}

function qualifyingEvents(p: Project, year: number) {
  return p.events.filter(
    (e) => (INVESTMENT_ANNOUNCEMENT_EVENT_TYPES as readonly string[]).includes(e.type) && yearOf(e.date) === year,
  );
}

function computeInvestmentAnnouncements(
  all: readonly Project[],
  included: readonly Project[],
  umbrellas: ReadonlySet<string>,
  year: number,
): InvestmentAnnouncements {
  const events: InvestmentAnnouncements['events'] = [];
  const announced: Project[] = [];
  for (const p of included) {
    const evs = qualifyingEvents(p, year);
    if (evs.length === 0) continue;
    announced.push(p);
    for (const e of evs) events.push({ projectId: p.id, eventId: e.id, type: e.type, date: e.date });
  }

  const disclosed = announced.filter((p) => p.investment?.disclosed === true && p.investment.amount !== undefined);
  const byCurrencyRaw: Record<string, CurrencyTotal> = {};
  const aed = { total: 0, projectIds: [] as string[], derivedProjectIds: [] as string[] };
  for (const p of disclosed) {
    const inv = p.investment!;
    const cur = inv.currency!;
    const t = (byCurrencyRaw[cur] ??= { total: 0, projectIds: [] });
    t.total += inv.amount!;
    t.projectIds.push(p.id);
    if (inv.amountAed !== undefined) {
      aed.total += inv.amountAed;
      aed.projectIds.push(p.id);
      if (inv.amountAedDerivation === 'usd_peg') aed.derivedProjectIds.push(p.id);
    }
  }
  for (const c of Object.values(byCurrencyRaw)) c.total = roundTo(c.total, 2);
  aed.total = roundTo(aed.total, 2);

  const undisclosed = announced.filter((p) => !disclosed.includes(p));
  const umbrellaProjectIds = all
    .filter((p) => umbrellas.has(p.id) && p.emirate === 'Dubai' && p.status !== 'cancelled')
    .filter((p) => qualifyingEvents(p, year).length > 0)
    .map((p) => p.id);

  return {
    year,
    eventTypes: INVESTMENT_ANNOUNCEMENT_EVENT_TYPES,
    projectCount: announced.length,
    projectIds: announced.map((p) => p.id),
    eventCount: events.length,
    events,
    disclosed: {
      projectCount: disclosed.length,
      projectIds: disclosed.map((p) => p.id),
      byCurrency: byCurrencyRaw,
      aedWhereAvailable: aed,
    },
    undisclosed: statusCount(undisclosed),
    umbrellaProjectIds,
  };
}
