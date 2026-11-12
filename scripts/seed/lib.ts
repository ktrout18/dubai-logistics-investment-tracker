/**
 * Builders for the hand-curated 2026 seed register.
 *
 * Every fact (event, area, investment, completion) names a key in the source
 * registry (`sources.ts`); the builder copies that source's URL, type,
 * verification level and publication date, and lists every cited source in
 * `project.sources`. This makes it impossible to cite a URL that is not in
 * the project's sources, and keeps verification levels consistent.
 */
import {
  deriveCompanies,
  makeEventId,
  periodStart,
  roundTo,
  toSquareMetres,
  type AreaBasis,
  type AreaUnit,
  type AssetType,
  type Confidence,
  type DatePrecision,
  type Emirate,
  type EventType,
  type AreaQualifier,
  type GradeAStatus,
  type InvestmentScope,
  type NetNew,
  type Project,
  type ProjectEvent,
  type ProjectStatus,
  type Sector,
  type Source,
} from '../../shared/index.ts';
import { SOURCES, type SourceKey } from './sources.ts';

/** Seed timestamp and verification date (the day the seed was assembled). */
export const SEED_TS = '2026-11-11T12:00:00Z';
export const SEED_DATE = '2026-11-11';

export interface EventInput {
  date: string;
  precision?: DatePrecision;
  type: EventType;
  summary: string;
  src: SourceKey;
  statusAfter?: ProjectStatus;
  /** Override the source's verification for this event (e.g. 'inferred'). */
  verification?: Source['verification'];
}

export interface AreaInput {
  value: number;
  unit: AreaUnit;
  basis: AreaBasis;
  src: SourceKey;
  label?: string;
  note?: string;
  /** The source's own qualifier: "over 67,000 sqm" → 'over'; "nearly"/"almost" → 'nearly'. */
  qualifier?: AreaQualifier;
  /** When the stored m² must differ from the exact conversion (e.g. a source's own rounded m² figure). */
  valueM2?: number;
}

export interface DatedInput {
  date: string;
  precision: DatePrecision;
  src: SourceKey;
}

export interface ProjectInput {
  id: string;
  name: string;
  facilityName?: string;
  summary: string;
  developer?: string;
  investor?: string;
  owner?: string;
  operator?: string;
  extraCompanies?: string[];
  emirate?: Emirate;
  location: string;
  zone?: string;
  sectors: Sector[];
  assetType: AssetType;
  status: ProjectStatus;
  originalAnnouncement?: DatedInput;
  investment?:
    | { disclosed: false; basis: string; src?: SourceKey }
    | {
        disclosed: true;
        amount: number;
        currency: string;
        basis: string;
        /** What the amount covers (required for every disclosed amount in the seed). */
        scope: InvestmentScope;
        src: SourceKey;
        aed?: 'native_aed' | 'usd_peg';
      };
  areas?: AreaInput[];
  primaryAreaIndex?: number;
  gradeA: GradeAStatus;
  gradeAEvidence?: string;
  netNew: NetNew;
  netNewEvidence?: string;
  forecastCompletion?: DatedInput;
  actualCompletion?: DatedInput;
  /** Sources consulted but not cited by a specific field (still listed). */
  alsoSources?: SourceKey[];
  confidence: Confidence;
  unresolvedQuestions?: string[];
  events: EventInput[];
  parentId?: string;
  phaseLabel?: string;
  seedNote?: string;
  /** 'seed_pdf' for the 26 projects of the owner's Nov 2026 briefing PDF; default 'manual'. */
  provenance?: Project['provenance'];
}

function src(key: SourceKey): Source {
  const s = SOURCES[key];
  if (!s) throw new Error(`Unknown source key ${key}`);
  return s;
}

/** Normalise a coarse date to the first day of its period (the data-model convention). */
function norm(date: string, precision: DatePrecision): string {
  return periodStart(date, precision);
}

export function buildProject(input: ProjectInput): Project {
  const cited: SourceKey[] = [];
  const cite = (k: SourceKey | undefined) => {
    if (k && !cited.includes(k)) cited.push(k);
  };

  const events: ProjectEvent[] = [];
  const ids: string[] = [];
  for (const e of input.events) {
    const s = src(e.src);
    cite(e.src);
    const precision = e.precision ?? 'day';
    const date = norm(e.date, precision);
    const id = makeEventId(date, e.type, ids);
    ids.push(id);
    events.push({
      id,
      date,
      datePrecision: precision,
      type: e.type,
      ...(e.statusAfter ? { statusAfter: e.statusAfter } : {}),
      summary: e.summary,
      sourceUrl: s.url,
      ...(s.publishedDate ? { sourcePublishedDate: s.publishedDate } : {}),
      sourceType: s.type,
      verification: e.verification ?? s.verification,
    });
  }
  for (let i = 1; i < events.length; i++) {
    if (events[i]!.date < events[i - 1]!.date) throw new Error(`${input.id}: events not in date order at ${i}`);
  }
  const last = events[events.length - 1];
  if (!last) throw new Error(`${input.id}: needs at least one event`);

  const areas = (input.areas ?? []).map((a) => {
    cite(a.src);
    const exact = roundTo(toSquareMetres(a.value, a.unit), 2);
    return {
      valueM2: a.valueM2 ?? exact,
      basis: a.basis,
      ...(a.label ? { label: a.label } : {}),
      ...(a.qualifier ? { qualifier: a.qualifier } : {}),
      originalValue: a.value,
      originalUnit: a.unit,
      sourceUrl: src(a.src).url,
      ...(a.note ? { note: a.note } : {}),
    };
  });

  let investment: Project['investment'];
  if (input.investment) {
    const inv = input.investment;
    cite(inv.src);
    if (inv.disclosed) {
      const amountAed =
        inv.aed === 'native_aed' ? inv.amount : inv.aed === 'usd_peg' ? roundTo(inv.amount * 3.6725, 2) : undefined;
      investment = {
        amount: inv.amount,
        currency: inv.currency,
        ...(amountAed !== undefined ? { amountAed, amountAedDerivation: inv.aed } : {}),
        basis: inv.basis,
        scope: inv.scope,
        disclosed: true,
        sourceUrl: src(inv.src).url,
      };
    } else {
      investment = { basis: inv.basis, disclosed: false, ...(inv.src ? { sourceUrl: src(inv.src).url } : {}) };
    }
  }

  const dated = (d?: DatedInput) => {
    if (!d) return undefined;
    cite(d.src);
    return { date: norm(d.date, d.precision), datePrecision: d.precision, sourceUrl: src(d.src).url };
  };
  const originalAnnouncement = input.originalAnnouncement
    ? { ...dated(input.originalAnnouncement)!, ...(src(input.originalAnnouncement.src).title ? { sourceTitle: src(input.originalAnnouncement.src).title } : {}) }
    : undefined;
  const forecastCompletion = dated(input.forecastCompletion);
  const actualCompletion = dated(input.actualCompletion);
  (input.alsoSources ?? []).forEach(cite);

  const extra = input.extraCompanies ?? [];
  const project: Project = {
    id: input.id,
    name: input.name,
    ...(input.facilityName ? { facilityName: input.facilityName } : {}),
    summary: input.summary,
    ...(input.developer ? { developer: input.developer } : {}),
    ...(input.investor ? { investor: input.investor } : {}),
    ...(input.owner ? { owner: input.owner } : {}),
    ...(input.operator ? { operator: input.operator } : {}),
    companies: deriveCompanies(input, extra),
    emirate: input.emirate ?? 'Dubai',
    location: input.location,
    ...(input.zone ? { zone: input.zone } : {}),
    sectors: input.sectors,
    assetType: input.assetType,
    status: input.status,
    ...(originalAnnouncement ? { originalAnnouncement } : {}),
    latestMilestone: { date: last.date, datePrecision: last.datePrecision, description: last.summary, sourceUrl: last.sourceUrl },
    ...(investment ? { investment } : {}),
    areas,
    ...(input.primaryAreaIndex !== undefined ? { primaryAreaIndex: input.primaryAreaIndex } : {}),
    gradeA: input.gradeA,
    ...(input.gradeAEvidence ? { gradeAEvidence: input.gradeAEvidence } : {}),
    netNew: input.netNew,
    ...(input.netNewEvidence ? { netNewEvidence: input.netNewEvidence } : {}),
    ...(forecastCompletion ? { forecastCompletion } : {}),
    ...(actualCompletion ? { actualCompletion } : {}),
    sources: cited.map((k) => src(k)),
    lastVerified: SEED_DATE,
    confidence: input.confidence,
    unresolvedQuestions: input.unresolvedQuestions ?? [],
    events,
    ...(input.parentId ? { parentId: input.parentId } : {}),
    ...(input.phaseLabel ? { phaseLabel: input.phaseLabel } : {}),
    provenance: input.provenance ?? 'manual',
    ...(input.seedNote ? { seedNote: input.seedNote } : {}),
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  };
  return project;
}
