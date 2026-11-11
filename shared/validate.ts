/**
 * Data validation for the canonical data files.
 *
 * `validateRegister(input, options)` runs schema checks on each supplied file
 * plus every semantic / cross-record rule, and returns issues split by
 * severity. Errors must block a commit (the CLI and the pipeline exit
 * non-zero); warnings are surfaced for human review but do not fail;
 * notices are informational (e.g. a project flagged as regional context).
 *
 * Network checks (dead links) are NOT done here; the pipeline owns them.
 */
import type { z } from 'zod';
import type { AreaBasis, DataFileKey, Project } from './schema.ts';
import {
  AED_PER_USD,
  ChangelogFileSchema,
  MetaFileSchema,
  PendingReviewFileSchema,
  ProjectSchema,
  SCHEMA_VERSION,
  SourcesFileSchema,
  WAREHOUSE_FLOOR_BASES,
  isDeliveredStatus,
  periodEnd,
  periodStart,
  todayIso,
} from './schema.ts';
import { conversionMatches, toSquareMetres } from './units.ts';
import { companyKey, findKnownZone, isHttpUrl, jaccard, nameTokens, normaliseText, normaliseUrl } from './normalise.ts';
import { replayEvents } from './transitions.ts';
import { selectAreasByBasis } from './metrics.ts';

export type Severity = 'error' | 'warning' | 'notice';

/** Every issue code with its severity and meaning. Severity is fixed per code. */
export const ISSUE_CODES = {
  SCHEMA_INVALID: { severity: 'error', description: 'A file or record does not match its zod schema.' },
  DUPLICATE_ID: { severity: 'error', description: 'Two projects share an id.' },
  DUPLICATE_EVENT_ID: { severity: 'error', description: 'Two events in one project share an id.' },
  DUPLICATE_RECORD_ID: { severity: 'error', description: 'Two changelog or review records share an id.' },
  PROBABLE_DUPLICATE: {
    severity: 'warning',
    description: 'Two unrelated projects look like the same facility (similar name, same zone, compatible operator).',
  },
  SHARED_SOURCE_URL: {
    severity: 'warning',
    description: 'The same source URL is cited by two projects that are not phases of one another.',
  },
  DUPLICATE_SOURCE_URL: { severity: 'warning', description: 'A project lists the same source URL twice.' },
  NO_EVENTS: { severity: 'warning', description: 'A project has no events, so its status cannot be traced.' },
  EVENTS_NOT_SORTED: { severity: 'error', description: 'Events are not in chronological (date ascending) order.' },
  EVENT_IN_FUTURE: { severity: 'error', description: 'An event is dated after today.' },
  STATUS_EVENT_MISMATCH: {
    severity: 'error',
    description: 'The status implied by replaying the events differs from `status`.',
  },
  STATUS_NO_SUPPORTING_EVENT: {
    severity: 'warning',
    description: 'Events exist but none of them implies a status.',
  },
  INVALID_TRANSITION: {
    severity: 'error',
    description: 'Event history moves backwards (or out of cancelled) without a correction event.',
  },
  LATEST_MILESTONE_STALE: {
    severity: 'error',
    description: '`latestMilestone` is older than the most recent event.',
  },
  LATEST_MILESTONE_NOT_IN_EVENTS: {
    severity: 'warning',
    description: '`latestMilestone` does not correspond to any event (same date and source URL).',
  },
  DELIVERED_WITHOUT_ACTUAL_COMPLETION: {
    severity: 'error',
    description: 'Status is construction_completed/operational but there is no sourced `actualCompletion`.',
  },
  ACTUAL_COMPLETION_STATUS_MISMATCH: {
    severity: 'error',
    description: '`actualCompletion` is set but the status is not delivered.',
  },
  ACTUAL_COMPLETION_IN_FUTURE: { severity: 'error', description: '`actualCompletion` is dated after today.' },
  FORECAST_PROMOTED_WITHOUT_SOURCE: {
    severity: 'error',
    description: '`actualCompletion` repeats the forecast date and source: a forecast was promoted to actual without new evidence.',
  },
  ACTUAL_COMPLETION_SOURCE_PREDATES: {
    severity: 'error',
    description: 'The source cited for `actualCompletion` was published before the completion period began, so it can only be a forecast.',
  },
  ACTUAL_COMPLETION_NO_EVENT: {
    severity: 'warning',
    description: 'Delivered project has no construction_completed / commissioned / opened event.',
  },
  FORECAST_OVERDUE: {
    severity: 'warning',
    description: 'Forecast completion period has passed but the project is not delivered or cancelled.',
  },
  FORECAST_UNSOURCED: { severity: 'warning', description: '`forecastCompletion` has no source URL.' },
  PARENT_NOT_FOUND: { severity: 'error', description: '`parentId` does not match any project.' },
  PARENT_SELF: { severity: 'error', description: 'A project names itself as parent.' },
  PHASE_CYCLE: { severity: 'error', description: '`parentId` links form a cycle.' },
  PHASE_AREA_EXCEEDS_PARENT: {
    severity: 'warning',
    description: 'Sum of phase areas of one basis exceeds the parent umbrella area of that basis.',
  },
  PHASE_EMIRATE_MISMATCH: { severity: 'warning', description: 'A phase is in a different emirate than its parent.' },
  PHASE_LABEL_MISSING: { severity: 'warning', description: 'A phase (has parentId) has no `phaseLabel`.' },
  PHASE_LABEL_WITHOUT_PARENT: { severity: 'warning', description: '`phaseLabel` set but no `parentId`.' },
  AREA_CONVERSION_MISMATCH: {
    severity: 'error',
    description: '`valueM2` does not equal the exact conversion of `originalValue` `originalUnit` (tolerance max(1 m², 0.1%)).',
  },
  AREA_IMPLAUSIBLE: { severity: 'warning', description: 'Area value is implausibly small or large for its basis.' },
  AREA_UNSOURCED: { severity: 'error', description: 'An area measure has no source URL.' },
  MULTIPLE_AREAS_SAME_BASIS: {
    severity: 'warning',
    description: 'Several area measures share a basis; metrics use only one (primary, else largest).',
  },
  PRIMARY_AREA_INDEX_OUT_OF_RANGE: { severity: 'error', description: '`primaryAreaIndex` points past `areas`.' },
  PRIMARY_AREA_NOT_FLOOR: {
    severity: 'warning',
    description: '`primaryAreaIndex` points at a land / yard / district / unspecified measure, not floor space.',
  },
  INVESTMENT_UNSOURCED: { severity: 'error', description: 'A disclosed investment has no source URL.' },
  AED_CONVERSION_MISMATCH: {
    severity: 'error',
    description: '`amountAed` disagrees with the amount for native_aed / usd_peg derivations.',
  },
  GRADE_A_EVIDENCE_MISSING: {
    severity: 'error',
    description: 'gradeA is confirmed without `gradeAEvidence`.',
  },
  GRADE_A_PROBABLE_EVIDENCE_MISSING: {
    severity: 'warning',
    description: 'gradeA is probable without `gradeAEvidence` explaining why.',
  },
  NET_NEW_EVIDENCE_MISSING: { severity: 'warning', description: 'netNew yes/no without `netNewEvidence`.' },
  URL_NOT_IN_SOURCES: {
    severity: 'warning',
    description: 'A URL cited in a field group is not listed in the project `sources`.',
  },
  INVALID_URL: { severity: 'error', description: 'A URL is not an absolute http(s) URL.' },
  REGIONAL_PROJECT: {
    severity: 'notice',
    description: 'Project is outside Dubai: shown as regional context only, never in Dubai totals.',
  },
  ZONE_EMIRATE_MISMATCH: { severity: 'warning', description: 'A known zone belongs to a different emirate.' },
  ZONE_NOT_NORMALISED: {
    severity: 'warning',
    description: '`zone` matches a known zone alias but not its canonical spelling (use normaliseZone).',
  },
  COMPANIES_MISSING_ROLE: {
    severity: 'warning',
    description: '`companies` does not include a developer/investor/owner/operator name (use deriveCompanies).',
  },
  DATE_PRECISION_NOT_NORMALISED: {
    severity: 'warning',
    description: 'A month/quarter/year-precision date is not set to the first day of its period.',
  },
  LAST_VERIFIED_IN_FUTURE: { severity: 'error', description: '`lastVerified` is after today.' },
  UPDATED_BEFORE_CREATED: { severity: 'error', description: '`updatedAt` is earlier than `createdAt`.' },
  CHANGELOG_UNKNOWN_PROJECT: {
    severity: 'error',
    description: 'A change record references a project id not in the register.',
  },
  REVIEW_UNKNOWN_PROJECT: {
    severity: 'error',
    description: 'A review item references a project id not in the register.',
  },
} as const satisfies Record<string, { severity: Severity; description: string }>;

export type IssueCode = keyof typeof ISSUE_CODES;

export interface ValidationIssue {
  code: IssueCode;
  severity: Severity;
  message: string;
  file?: DataFileKey;
  projectId?: string;
  /** Path within the record, e.g. "areas[1].valueM2". */
  path?: string;
}

export interface ValidationResult {
  /** True when there are no errors. */
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  notices: ValidationIssue[];
}

export interface ValidateInput {
  /** Parsed data/register.json (envelope `{ schemaVersion, projects }`). */
  register: unknown;
  changelog?: unknown;
  pendingReview?: unknown;
  meta?: unknown;
  sources?: unknown;
}

export interface ValidateOptions {
  /** "Today" as YYYY-MM-DD for future-date checks. Defaults to the current UTC date. */
  today?: string;
}

class Collector {
  issues: ValidationIssue[] = [];
  add(code: IssueCode, message: string, extra: Omit<ValidationIssue, 'code' | 'severity' | 'message'> = {}) {
    this.issues.push({ code, severity: ISSUE_CODES[code].severity, message, ...extra });
  }
  result(): ValidationResult {
    const errors = this.issues.filter((i) => i.severity === 'error');
    return {
      ok: errors.length === 0,
      errors,
      warnings: this.issues.filter((i) => i.severity === 'warning'),
      notices: this.issues.filter((i) => i.severity === 'notice'),
    };
  }
}

function zodPath(path: (string | number)[]): string {
  return path.reduce<string>((acc, seg) => (typeof seg === 'number' ? `${acc}[${seg}]` : acc ? `${acc}.${seg}` : seg), '');
}

function addZodIssues(c: Collector, err: z.ZodError, file: DataFileKey, prefix = '', projectId?: string) {
  for (const i of err.issues) {
    const p = zodPath(i.path as (string | number)[]);
    const path = prefix && p ? `${prefix}.${p}` : prefix || p;
    c.add('SCHEMA_INVALID', `${path || '(root)'}: ${i.message}`, { file, path, ...(projectId ? { projectId } : {}) });
  }
}

/**
 * Validate any subset of the data files. `register` is required; other files
 * are checked when supplied. See ISSUE_CODES for every rule.
 */
export function validateRegister(input: ValidateInput, options: ValidateOptions = {}): ValidationResult {
  const today = options.today ?? todayIso();
  const c = new Collector();

  // --- register envelope + per-project schema ---------------------------
  const projects: Project[] = [];
  const allIds = new Set<string>();
  const reg = input.register as { schemaVersion?: unknown; projects?: unknown } | null;
  if (!reg || typeof reg !== 'object' || !Array.isArray(reg.projects)) {
    c.add('SCHEMA_INVALID', 'register must be an object with a "projects" array', { file: 'register' });
  } else {
    if (reg.schemaVersion !== SCHEMA_VERSION) {
      c.add('SCHEMA_INVALID', `register.schemaVersion must be ${SCHEMA_VERSION}`, { file: 'register', path: 'schemaVersion' });
    }
    const extraKeys = Object.keys(reg).filter((k) => !['schemaVersion', 'updatedAt', 'projects'].includes(k));
    if (extraKeys.length) {
      c.add('SCHEMA_INVALID', `register has unknown keys: ${extraKeys.join(', ')}`, { file: 'register' });
    }
    (reg.projects as unknown[]).forEach((raw, i) => {
      const rawId = raw && typeof raw === 'object' && typeof (raw as { id?: unknown }).id === 'string' ? (raw as { id: string }).id : undefined;
      if (rawId) allIds.add(rawId);
      const parsed = ProjectSchema.safeParse(raw);
      if (!parsed.success) addZodIssues(c, parsed.error, 'register', `projects[${i}]`, rawId);
      else projects.push(parsed.data);
    });
  }

  runProjectChecks(c, projects, today);

  // --- other files ---------------------------------------------------------
  const knownIds = allIds;
  if (input.changelog !== undefined) {
    const r = ChangelogFileSchema.safeParse(input.changelog);
    if (!r.success) addZodIssues(c, r.error, 'changelog');
    else {
      const seen = new Set<string>();
      r.data.changes.forEach((ch, i) => {
        if (seen.has(ch.id)) c.add('DUPLICATE_RECORD_ID', `Duplicate change id ${ch.id}`, { file: 'changelog', path: `changes[${i}].id` });
        seen.add(ch.id);
        if (!knownIds.has(ch.projectId)) {
          c.add('CHANGELOG_UNKNOWN_PROJECT', `Change ${ch.id} references unknown project ${ch.projectId}`, {
            file: 'changelog',
            path: `changes[${i}].projectId`,
            projectId: ch.projectId,
          });
        }
        checkUrl(c, ch.evidenceUrl, { file: 'changelog', path: `changes[${i}].evidenceUrl` });
      });
    }
  }
  if (input.pendingReview !== undefined) {
    const r = PendingReviewFileSchema.safeParse(input.pendingReview);
    if (!r.success) addZodIssues(c, r.error, 'pendingReview');
    else {
      const seen = new Set<string>();
      r.data.items.forEach((it, i) => {
        if (seen.has(it.id)) c.add('DUPLICATE_RECORD_ID', `Duplicate review id ${it.id}`, { file: 'pendingReview', path: `items[${i}].id` });
        seen.add(it.id);
        if (it.projectId && it.kind !== 'new_project' && !knownIds.has(it.projectId)) {
          c.add('REVIEW_UNKNOWN_PROJECT', `Review item ${it.id} references unknown project ${it.projectId}`, {
            file: 'pendingReview',
            path: `items[${i}].projectId`,
            projectId: it.projectId,
          });
        }
        it.evidence.forEach((e, j) => checkUrl(c, e.url, { file: 'pendingReview', path: `items[${i}].evidence[${j}].url` }));
        if (it.issueUrl) checkUrl(c, it.issueUrl, { file: 'pendingReview', path: `items[${i}].issueUrl` });
      });
    }
  }
  if (input.meta !== undefined) {
    const r = MetaFileSchema.safeParse(input.meta);
    if (!r.success) addZodIssues(c, r.error, 'meta');
  }
  if (input.sources !== undefined) {
    const r = SourcesFileSchema.safeParse(input.sources);
    if (!r.success) addZodIssues(c, r.error, 'sources');
  }

  return c.result();
}

function checkUrl(c: Collector, url: string, where: Omit<ValidationIssue, 'code' | 'severity' | 'message'>) {
  if (!isHttpUrl(url)) c.add('INVALID_URL', `Not an absolute http(s) URL: "${url}"`, where);
}

/**
 * Semantic checks on already schema-valid projects (no file envelope).
 * Useful for the pipeline to check a candidate register in memory before
 * writing.
 */
export function validateProjects(projects: readonly Project[], options: ValidateOptions = {}): ValidationResult {
  const c = new Collector();
  runProjectChecks(c, projects, options.today ?? todayIso());
  return c.result();
}

function runProjectChecks(c: Collector, projects: readonly Project[], today: string): void {
  const byId = new Map<string, Project>();

  for (const p of projects) {
    if (byId.has(p.id)) c.add('DUPLICATE_ID', `Duplicate project id "${p.id}"`, { file: 'register', projectId: p.id, path: 'id' });
    else byId.set(p.id, p);
  }

  for (const p of projects) checkProject(c, p, today);
  checkPhasing(c, projects, byId);
  checkDuplicates(c, projects);
}

const DELIVERY_EVENT_TYPES = new Set(['construction_completed', 'commissioned', 'opened']);

const PLAUSIBLE_M2: Record<AreaBasis, [number, number]> = {
  warehouse_gfa: [50, 1_500_000],
  gla: [50, 1_500_000],
  mixed_building_area: [50, 2_000_000],
  site_land_area: [100, 25_000_000],
  open_yard: [100, 10_000_000],
  district_area: [10_000, 150_000_000],
  unspecified: [50, 150_000_000],
};

function checkProject(c: Collector, p: Project, today: string) {
  const at = (path: string) => ({ file: 'register' as const, projectId: p.id, path });
  const sourceUrls = new Set(p.sources.map((s) => normaliseUrl(s.url)));

  // URLs: syntax everywhere + presence in sources for field-group citations
  const cited: [string, string][] = [];
  if (p.originalAnnouncement) cited.push([p.originalAnnouncement.sourceUrl, 'originalAnnouncement.sourceUrl']);
  cited.push([p.latestMilestone.sourceUrl, 'latestMilestone.sourceUrl']);
  if (p.investment?.sourceUrl) cited.push([p.investment.sourceUrl, 'investment.sourceUrl']);
  p.areas.forEach((a, i) => a.sourceUrl && cited.push([a.sourceUrl, `areas[${i}].sourceUrl`]));
  if (p.forecastCompletion?.sourceUrl) cited.push([p.forecastCompletion.sourceUrl, 'forecastCompletion.sourceUrl']);
  if (p.actualCompletion) cited.push([p.actualCompletion.sourceUrl, 'actualCompletion.sourceUrl']);
  p.events.forEach((e, i) => cited.push([e.sourceUrl, `events[${i}].sourceUrl`]));
  const seenSrc = new Set<string>();
  p.sources.forEach((s, i) => {
    checkUrl(c, s.url, at(`sources[${i}].url`));
    const n = normaliseUrl(s.url);
    if (seenSrc.has(n)) c.add('DUPLICATE_SOURCE_URL', `Source listed twice: ${s.url}`, at(`sources[${i}].url`));
    seenSrc.add(n);
  });
  for (const [url, path] of cited) {
    checkUrl(c, url, at(path));
    if (isHttpUrl(url) && !sourceUrls.has(normaliseUrl(url))) {
      c.add('URL_NOT_IN_SOURCES', `${path} cites ${url}, which is not in sources[]`, at(path));
    }
  }

  // Dates: precision normalisation
  const dated: [string, string, string][] = [];
  if (p.originalAnnouncement) dated.push([p.originalAnnouncement.date, p.originalAnnouncement.datePrecision, 'originalAnnouncement']);
  dated.push([p.latestMilestone.date, p.latestMilestone.datePrecision, 'latestMilestone']);
  if (p.forecastCompletion) dated.push([p.forecastCompletion.date, p.forecastCompletion.datePrecision, 'forecastCompletion']);
  if (p.actualCompletion) dated.push([p.actualCompletion.date, p.actualCompletion.datePrecision, 'actualCompletion']);
  p.events.forEach((e, i) => dated.push([e.date, e.datePrecision, `events[${i}]`]));
  for (const [d, prec, path] of dated) {
    if (periodStart(d, prec as never) !== d) {
      c.add('DATE_PRECISION_NOT_NORMALISED', `${path}.date ${d} with ${prec} precision should be ${periodStart(d, prec as never)}`, at(`${path}.date`));
    }
  }
  if (p.lastVerified > today) c.add('LAST_VERIFIED_IN_FUTURE', `lastVerified ${p.lastVerified} is after ${today}`, at('lastVerified'));
  if (Date.parse(p.updatedAt) < Date.parse(p.createdAt)) c.add('UPDATED_BEFORE_CREATED', 'updatedAt is before createdAt', at('updatedAt'));

  // Events
  const eventIds = new Set<string>();
  p.events.forEach((e, i) => {
    if (eventIds.has(e.id)) c.add('DUPLICATE_EVENT_ID', `Duplicate event id ${e.id}`, at(`events[${i}].id`));
    eventIds.add(e.id);
    if (i > 0 && e.date < p.events[i - 1]!.date) {
      c.add('EVENTS_NOT_SORTED', `events[${i}] (${e.date}) is earlier than events[${i - 1}] (${p.events[i - 1]!.date})`, at(`events[${i}].date`));
    }
    if (periodStart(e.date, e.datePrecision) > today) c.add('EVENT_IN_FUTURE', `Event ${e.id} is dated ${e.date}, after ${today}`, at(`events[${i}].date`));
  });

  if (p.events.length === 0) {
    c.add('NO_EVENTS', 'Project has no events; status cannot be traced to evidence', at('events'));
  } else {
    const sorted = [...p.events].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const replay = replayEvents(sorted);
    for (const v of replay.violations) {
      c.add('INVALID_TRANSITION', `Event ${v.eventId} moves status ${v.from} → ${v.to} without a correction`, at(`events[${p.events.findIndex((e) => e.id === v.eventId)}]`));
    }
    if (replay.status === undefined) {
      c.add('STATUS_NO_SUPPORTING_EVENT', `No event implies a status; status "${p.status}" is unsupported by events`, at('status'));
    } else if (replay.status !== p.status) {
      c.add('STATUS_EVENT_MISMATCH', `Events imply status "${replay.status}" but status is "${p.status}"`, at('status'));
    }
    const latest = sorted[sorted.length - 1]!;
    if (p.latestMilestone.date < latest.date) {
      c.add('LATEST_MILESTONE_STALE', `latestMilestone (${p.latestMilestone.date}) is older than event ${latest.id} (${latest.date})`, at('latestMilestone'));
    }
    const lmUrl = normaliseUrl(p.latestMilestone.sourceUrl);
    if (!p.events.some((e) => e.date === p.latestMilestone.date && normaliseUrl(e.sourceUrl) === lmUrl)) {
      c.add('LATEST_MILESTONE_NOT_IN_EVENTS', 'latestMilestone has no matching event (same date and source URL)', at('latestMilestone'));
    }
  }

  // Delivery / completion
  const delivered = isDeliveredStatus(p.status);
  if (delivered && !p.actualCompletion) {
    c.add('DELIVERED_WITHOUT_ACTUAL_COMPLETION', `Status ${p.status} requires a sourced actualCompletion`, at('actualCompletion'));
  }
  if (p.actualCompletion) {
    const ac = p.actualCompletion;
    if (!delivered) {
      c.add('ACTUAL_COMPLETION_STATUS_MISMATCH', `actualCompletion set but status is ${p.status}`, at('actualCompletion'));
    }
    if (periodStart(ac.date, ac.datePrecision) > today) {
      c.add('ACTUAL_COMPLETION_IN_FUTURE', `actualCompletion ${ac.date} is after ${today}`, at('actualCompletion.date'));
    }
    const fc = p.forecastCompletion;
    if (fc && fc.date === ac.date && fc.sourceUrl && normaliseUrl(fc.sourceUrl) === normaliseUrl(ac.sourceUrl)) {
      c.add('FORECAST_PROMOTED_WITHOUT_SOURCE', 'actualCompletion has the same date and source as forecastCompletion', at('actualCompletion'));
    }
    const acSrc = p.sources.find((s) => normaliseUrl(s.url) === normaliseUrl(ac.sourceUrl));
    if (acSrc?.publishedDate && acSrc.publishedDate < periodStart(ac.date, ac.datePrecision)) {
      c.add(
        'ACTUAL_COMPLETION_SOURCE_PREDATES',
        `Source for actualCompletion was published ${acSrc.publishedDate}, before completion ${ac.date}`,
        at('actualCompletion.sourceUrl'),
      );
    }
    if (delivered && !p.events.some((e) => DELIVERY_EVENT_TYPES.has(e.type))) {
      c.add('ACTUAL_COMPLETION_NO_EVENT', 'No construction_completed / commissioned / opened event', at('events'));
    }
  }
  if (p.forecastCompletion) {
    const fc = p.forecastCompletion;
    if (!fc.sourceUrl) c.add('FORECAST_UNSOURCED', 'forecastCompletion has no sourceUrl', at('forecastCompletion'));
    if (!delivered && p.status !== 'cancelled' && periodEnd(fc.date, fc.datePrecision) < today) {
      c.add('FORECAST_OVERDUE', `Forecast completion ${fc.date} (${fc.datePrecision}) has passed; status is ${p.status}`, at('forecastCompletion'));
    }
  }

  // Areas
  const basisCount = new Map<AreaBasis, number>();
  p.areas.forEach((a, i) => {
    basisCount.set(a.basis, (basisCount.get(a.basis) ?? 0) + 1);
    if (!a.sourceUrl) c.add('AREA_UNSOURCED', `areas[${i}] (${a.basis}) has no sourceUrl`, at(`areas[${i}]`));
    if (a.originalValue !== undefined && a.originalUnit !== undefined && !conversionMatches(a.valueM2, a.originalValue, a.originalUnit)) {
      c.add(
        'AREA_CONVERSION_MISMATCH',
        `areas[${i}].valueM2 ${a.valueM2} ≠ ${a.originalValue} ${a.originalUnit} = ${toSquareMetres(a.originalValue, a.originalUnit)} m²`,
        at(`areas[${i}].valueM2`),
      );
    }
    const [lo, hi] = PLAUSIBLE_M2[a.basis];
    if (a.valueM2 < lo || a.valueM2 > hi) {
      c.add('AREA_IMPLAUSIBLE', `areas[${i}] ${a.basis} ${a.valueM2} m² is outside the plausible range ${lo}–${hi}`, at(`areas[${i}].valueM2`));
    }
  });
  for (const [basis, n] of basisCount) {
    if (n > 1) c.add('MULTIPLE_AREAS_SAME_BASIS', `${n} measures with basis ${basis}; metrics use one`, at('areas'));
  }
  if (p.primaryAreaIndex !== undefined) {
    const prim = p.areas[p.primaryAreaIndex];
    if (!prim) c.add('PRIMARY_AREA_INDEX_OUT_OF_RANGE', `primaryAreaIndex ${p.primaryAreaIndex} but only ${p.areas.length} areas`, at('primaryAreaIndex'));
    else if (!(WAREHOUSE_FLOOR_BASES as readonly AreaBasis[]).includes(prim.basis) && prim.basis !== 'mixed_building_area') {
      c.add('PRIMARY_AREA_NOT_FLOOR', `primaryAreaIndex points at a ${prim.basis} measure`, at('primaryAreaIndex'));
    }
  }

  // Investment
  const inv = p.investment;
  if (inv?.disclosed && !inv.sourceUrl) c.add('INVESTMENT_UNSOURCED', 'Disclosed investment has no sourceUrl', at('investment.sourceUrl'));
  if (inv?.amountAed !== undefined && inv.amount !== undefined) {
    const expected =
      inv.amountAedDerivation === 'native_aed' ? inv.amount : inv.amountAedDerivation === 'usd_peg' ? inv.amount * AED_PER_USD : undefined;
    if (expected !== undefined && Math.abs(inv.amountAed - expected) > Math.max(1, expected * 1e-9)) {
      c.add('AED_CONVERSION_MISMATCH', `amountAed ${inv.amountAed} ≠ expected ${expected} (${inv.amountAedDerivation})`, at('investment.amountAed'));
    }
  }

  // Grade-A / net new evidence
  if (p.gradeA === 'confirmed' && !p.gradeAEvidence?.trim()) {
    c.add('GRADE_A_EVIDENCE_MISSING', 'gradeA confirmed requires gradeAEvidence', at('gradeAEvidence'));
  } else if (p.gradeA === 'probable' && !p.gradeAEvidence?.trim()) {
    c.add('GRADE_A_PROBABLE_EVIDENCE_MISSING', 'gradeA probable should state gradeAEvidence', at('gradeAEvidence'));
  }
  if (p.netNew !== 'unknown' && !p.netNewEvidence?.trim()) {
    c.add('NET_NEW_EVIDENCE_MISSING', `netNew "${p.netNew}" without netNewEvidence`, at('netNewEvidence'));
  }

  // Geography
  if (p.emirate !== 'Dubai') {
    c.add('REGIONAL_PROJECT', `${p.emirate} project: regional context only, excluded from Dubai totals`, at('emirate'));
  }
  if (p.zone) {
    const kz = findKnownZone(p.zone);
    if (kz) {
      if (kz.emirate !== p.emirate) c.add('ZONE_EMIRATE_MISMATCH', `Zone ${kz.name} is in ${kz.emirate}, project emirate is ${p.emirate}`, at('zone'));
      if (kz.name !== p.zone) c.add('ZONE_NOT_NORMALISED', `zone "${p.zone}" should be "${kz.name}"`, at('zone'));
    }
  }

  // Companies
  const keys = new Set(p.companies.map(companyKey));
  for (const role of ['developer', 'investor', 'owner', 'operator'] as const) {
    const v = p[role];
    if (v && v.trim() && !keys.has(companyKey(v))) {
      c.add('COMPANIES_MISSING_ROLE', `${role} "${v}" is missing from companies[]`, at('companies'));
    }
  }

  // Phase label hygiene (parent existence is checked in checkPhasing)
  if (p.parentId && !p.phaseLabel?.trim()) c.add('PHASE_LABEL_MISSING', 'Phase has no phaseLabel', at('phaseLabel'));
  if (!p.parentId && p.phaseLabel) c.add('PHASE_LABEL_WITHOUT_PARENT', 'phaseLabel set without parentId', at('phaseLabel'));
}

function checkPhasing(c: Collector, projects: readonly Project[], byId: ReadonlyMap<string, Project>) {
  for (const p of projects) {
    if (!p.parentId) continue;
    const at = { file: 'register' as const, projectId: p.id, path: 'parentId' };
    if (p.parentId === p.id) {
      c.add('PARENT_SELF', 'Project is its own parent', at);
      continue;
    }
    const parent = byId.get(p.parentId);
    if (!parent) {
      c.add('PARENT_NOT_FOUND', `parentId "${p.parentId}" not found`, at);
      continue;
    }
    // cycle detection
    const seen = new Set<string>([p.id]);
    let cur: Project | undefined = parent;
    while (cur) {
      if (seen.has(cur.id)) {
        c.add('PHASE_CYCLE', `parentId chain from ${p.id} loops back to ${cur.id}`, at);
        break;
      }
      seen.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    if (parent.emirate !== p.emirate) {
      c.add('PHASE_EMIRATE_MISMATCH', `Phase in ${p.emirate}, parent ${parent.id} in ${parent.emirate}`, { ...at, path: 'emirate' });
    }
  }

  // phase area sum vs parent, per basis
  const children = new Map<string, Project[]>();
  for (const p of projects) if (p.parentId && byId.has(p.parentId)) (children.get(p.parentId) ?? children.set(p.parentId, []).get(p.parentId)!).push(p);
  for (const [parentId, kids] of children) {
    const parent = byId.get(parentId)!;
    const parentSel = selectAreasByBasis(parent);
    const sums: Partial<Record<AreaBasis, number>> = {};
    for (const k of kids) {
      const sel = selectAreasByBasis(k);
      for (const [basis, s] of Object.entries(sel) as [AreaBasis, { valueM2: number }][]) sums[basis] = (sums[basis] ?? 0) + s.valueM2;
    }
    for (const [basis, sum] of Object.entries(sums) as [AreaBasis, number][]) {
      const pv = parentSel[basis]?.valueM2;
      if (pv !== undefined && sum > pv * 1.001) {
        c.add('PHASE_AREA_EXCEEDS_PARENT', `Phases sum to ${sum} m² ${basis}, parent states ${pv} m²`, {
          file: 'register',
          projectId: parentId,
          path: 'areas',
        });
      }
    }
  }
}

function related(a: Project, b: Project): boolean {
  return a.parentId === b.id || b.parentId === a.id || (a.parentId !== undefined && a.parentId === b.parentId);
}

/** Similarity threshold (Jaccard on name tokens) for PROBABLE_DUPLICATE. */
export const DUPLICATE_NAME_SIMILARITY = 0.6;

function checkDuplicates(c: Collector, projects: readonly Project[]) {
  const toks = projects.map((p) => {
    const t = nameTokens(p.name);
    if (p.facilityName) for (const x of nameTokens(p.facilityName)) t.add(x);
    return t;
  });
  const zone = (p: Project) => (p.zone ? normaliseText(findKnownZone(p.zone)?.name ?? p.zone) : undefined);
  for (let i = 0; i < projects.length; i++) {
    for (let j = i + 1; j < projects.length; j++) {
      const a = projects[i]!;
      const b = projects[j]!;
      if (a.id === b.id || related(a, b)) continue;
      const za = zone(a);
      const zb = zone(b);
      if (!za || za !== zb) continue;
      const opCompatible = !a.operator || !b.operator || companyKey(a.operator) === companyKey(b.operator);
      if (!opCompatible) continue;
      const sim = jaccard(toks[i]!, toks[j]!);
      if (sim >= DUPLICATE_NAME_SIMILARITY) {
        c.add('PROBABLE_DUPLICATE', `"${a.name}" and "${b.name}" look like the same facility (name similarity ${sim.toFixed(2)}, same zone)`, {
          file: 'register',
          projectId: b.id,
          path: `duplicateOf:${a.id}`,
        });
      }
    }
  }

  const urlOwners = new Map<string, Project[]>();
  for (const p of projects) {
    for (const u of new Set(p.sources.map((s) => normaliseUrl(s.url)))) {
      (urlOwners.get(u) ?? urlOwners.set(u, []).get(u)!).push(p);
    }
  }
  for (const [url, owners] of urlOwners) {
    if (owners.length < 2) continue;
    const unrelated = owners.filter((p) => owners.some((q) => q !== p && !related(p, q)));
    if (unrelated.length < 2) continue;
    c.add('SHARED_SOURCE_URL', `${url} is cited by unrelated projects: ${unrelated.map((p) => p.id).join(', ')}`, {
      file: 'register',
      projectId: unrelated[0]!.id,
      path: 'sources',
    });
  }
}

/** Convenience: format an issue as one line for CLI / CI logs. */
export function formatIssue(i: ValidationIssue): string {
  const where = [i.file, i.projectId, i.path].filter(Boolean).join(' › ');
  return `${i.severity.toUpperCase()} ${i.code}${where ? ` [${where}]` : ''}: ${i.message}`;
}
