/**
 * Publication rules. A grounded fact is auto-published only when ALL hold:
 *  - authority: a primary source read directly, or two independent sources
 *    (different sites, at least one read directly) that agree on the milestone;
 *  - grounding passed (grounding.ts);
 *  - identity unambiguous (unique match, or clearly new with name + party);
 *  - location: emirate known and grounded; zone or location given;
 *  - area reported and grounded, or none mentioned at all (recorded as "not disclosed");
 *  - milestone unambiguous (a status-bearing event type, dated, not in the future);
 *  - status transition valid; no conflict with existing values;
 *  - validateRegister passes on the resulting register (checked by the caller).
 * Anything else becomes a PendingReviewItem with the reasons. Nothing is dropped.
 */
import {
  AED_PER_USD,
  EVENT_TYPE_LABELS,
  INVESTMENT_ANNOUNCEMENT_EVENT_TYPES,
  deriveCompanies,
  isDeliveredStatus,
  isValidTransition,
  makeEventId,
  makeProjectId,
  normaliseUrl,
  normaliseZone,
  statusFromEvent,
  type AreaMeasure,
  type ChangeVerificationStatus,
  type EventType,
  type Investment,
  type Project,
  type ProjectEvent,
  type ReviewKind,
  type Source,
} from '../shared/index.ts';
import type { DocumentRecord } from './types.ts';
import type { GroundedFact } from './grounding.ts';
import { matchFact, factParties, type MatchCandidate } from './match.ts';
import { patchToProposed, type PatchOp } from './patch.ts';
import { daysBetween } from './dates.ts';

export interface FactItem {
  doc: DocumentRecord;
  grounded: GroundedFact;
  groundingOk: boolean;
  failures: string[];
  notes: string[];
}

export type Decision =
  | { action: 'skip'; reason: string }
  | { action: 'publish'; kind: 'new_project'; project: Project; verification: ChangeVerificationStatus; reason: string }
  | { action: 'publish'; kind: 'update'; projectId: string; ops: PatchOp[]; verification: ChangeVerificationStatus; reason: string }
  | { action: 'hold'; kind: ReviewKind; projectId?: string; proposed: Record<string, unknown>; reasons: string[] };

const NON_STATUS_EVENTS: EventType[] = ['expansion', 'correction', 'other'];
/** Same milestone reported again within this many days counts as the same event. */
export const SAME_EVENT_WINDOW_DAYS = 14;

function quoteShort(q: string, n = 200): string {
  const s = q.replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function sourceFromDoc(doc: DocumentRecord, today: string): Source {
  return {
    url: doc.url,
    ...(doc.title ? { title: doc.title } : {}),
    publisher: doc.publisher,
    ...(doc.publishedDate ? { publishedDate: doc.publishedDate } : {}),
    type: doc.tier,
    accessedDate: today,
    verification: doc.verification,
  };
}

export function eventFromFact(item: FactItem, existingIds: Iterable<string>): ProjectEvent {
  const { doc, grounded } = item;
  const f = grounded.fact;
  const date = grounded.eventDate!;
  const status = statusFromEvent({ type: f.eventType });
  return {
    id: makeEventId(date.date, f.eventType, existingIds),
    date: date.date,
    datePrecision: date.precision,
    type: f.eventType,
    ...(status ? { statusAfter: status } : {}),
    summary: `${EVENT_TYPE_LABELS[f.eventType]} reported by ${doc.publisher}: "${quoteShort(f.eventQuote)}"`,
    sourceUrl: doc.url,
    ...(doc.publishedDate ? { sourcePublishedDate: doc.publishedDate } : {}),
    sourceType: doc.tier,
    verification: doc.verification,
  };
}

function areaMeasure(a: GroundedFact['areas'][number], url: string): AreaMeasure {
  return {
    valueM2: a.valueM2,
    basis: a.basis,
    originalValue: a.value,
    originalUnit: a.unit,
    sourceUrl: url,
    note: a.note ? `${a.note}. Source: "${quoteShort(a.quote, 160)}"` : `Source: "${quoteShort(a.quote, 160)}"`,
  };
}

function investmentFrom(item: FactItem): Investment | undefined {
  const inv = item.grounded.fact.investment;
  if (!inv) return undefined;
  const currency = inv.currency.toUpperCase();
  const base: Investment = {
    amount: inv.amount,
    currency,
    basis: `As stated by ${item.doc.publisher}: "${quoteShort(inv.quote, 160)}"`,
    disclosed: true,
    sourceUrl: item.doc.url,
  };
  if (currency === 'AED') return { ...base, amountAed: inv.amount, amountAedDerivation: 'native_aed' };
  if (currency === 'USD') return { ...base, amountAed: inv.amount * AED_PER_USD, amountAedDerivation: 'usd_peg' };
  return base;
}

/** Signature used to group reports of the same milestone across documents. */
export function milestoneKey(item: FactItem, projectId: string | undefined): string {
  const f = item.grounded.fact;
  const who = projectId ?? `${factParties(f).map((p) => p.toLowerCase()).sort().join('+')}|${(f.zone ?? '').toLowerCase()}`;
  return `${who}|${f.eventType}`;
}

/**
 * Authority for publishing: primary + direct, or ≥2 independent sites (one direct)
 * reporting the same milestone (same key, dates within the window).
 */
export function authority(item: FactItem, corroborating: FactItem[]): { ok: boolean; verification: ChangeVerificationStatus; reason: string } {
  if (item.doc.tier === 'primary' && item.doc.verification === 'direct') {
    return { ok: true, verification: 'verified_official', reason: `official source read directly (${item.doc.publisher})` };
  }
  const sites = new Map<string, FactItem>();
  for (const c of [item, ...corroborating]) {
    if (!c.groundingOk) continue;
    const key = new URL(c.doc.url).hostname.replace(/^www\./, '').split('.').slice(-2).join('.');
    if (!sites.has(key)) sites.set(key, c);
  }
  const anyDirect = [...sites.values()].some((c) => c.doc.verification === 'direct');
  if (sites.size >= 2 && anyDirect) {
    return { ok: true, verification: 'verified_multiple', reason: `${sites.size} independent sources agree (${[...sites.keys()].join(', ')})` };
  }
  if (item.doc.verification === 'indexed') {
    return { ok: false, verification: 'indexed_only', reason: 'seen only as a search-index snippet; the page itself could not be read' };
  }
  return { ok: false, verification: 'unverified', reason: `single ${item.doc.tier} source (${item.doc.publisher}); needs an official source or a second independent source` };
}

function heldProposalNew(item: FactItem, project: Project | undefined, candidates: MatchCandidate[]): Record<string, unknown> {
  return {
    ...(project ? { project } : {}),
    _fact: item.grounded.fact,
    _document: { url: item.doc.url, title: item.doc.title, publisher: item.doc.publisher, tier: item.doc.tier, verification: item.doc.verification, publishedDate: item.doc.publishedDate ?? null },
    ...(candidates.length ? { _possibleMatches: candidates } : {}),
    ...(item.notes.length ? { _notes: item.notes } : {}),
  };
}

export interface DecideContext {
  projects: readonly Project[];
  usedIds: Set<string>;
  today: string;
  nowIso: string;
  /** Other grounded items this run, for corroboration. */
  allItems: readonly FactItem[];
}

export function buildNewProject(item: FactItem, ctx: DecideContext): Project {
  const { doc, grounded } = item;
  const f = grounded.fact;
  const date = grounded.eventDate!;
  const event = eventFromFact(item, []);
  const status = statusFromEvent(event) ?? 'proposed';
  const zone = f.zone ? normaliseZone(f.zone) : undefined;
  const id = makeProjectId({ operator: f.operator ?? f.developer ?? undefined, name: f.projectName, zone }, ctx.usedIds);
  const areas = grounded.areas.map((a) => areaMeasure(a, doc.url));
  const floorIdx = areas.findIndex((a) => a.basis === 'warehouse_gfa' || a.basis === 'gla' || a.basis === 'mixed_building_area');
  const investment = investmentFrom(item);
  const actual =
    isDeliveredStatus(status) && date
      ? grounded.actualCompletion
        ? { date: grounded.actualCompletion.date, datePrecision: grounded.actualCompletion.precision, sourceUrl: doc.url }
        : { date: date.date, datePrecision: date.precision, sourceUrl: doc.url }
      : undefined;
  const unresolved: string[] = [];
  if (!areas.length) unresolved.push('Floor area not disclosed in the cited source.');
  if (!investment) unresolved.push('Investment value not disclosed in the cited source.');
  if (date.from === 'publication_date') unresolved.push('Milestone date is the source publication date; the exact event date was not stated.');
  const gradeA = grounded.gradeAQuote ? (doc.tier === 'primary' && doc.verification === 'direct' ? 'confirmed' : 'probable') : 'unverified';
  const parties = { developer: f.developer ?? undefined, operator: f.operator ?? undefined, investor: f.investor ?? undefined, owner: f.owner ?? undefined };
  const project: Project = {
    id,
    name: f.projectName,
    ...(f.facilityName ? { facilityName: f.facilityName } : {}),
    summary: `${EVENT_TYPE_LABELS[f.eventType]} reported by ${doc.publisher} (${date.date}): "${quoteShort(f.eventQuote, 280)}"`,
    ...Object.fromEntries(Object.entries(parties).filter(([, v]) => v)),
    companies: deriveCompanies(parties),
    emirate: f.emirate!,
    location: f.location ?? zone ?? f.emirate!,
    ...(zone ? { zone } : {}),
    sectors: f.sectors.length ? [...new Set(f.sectors)] : ['other'],
    assetType: f.assetType,
    status,
    ...((INVESTMENT_ANNOUNCEMENT_EVENT_TYPES as readonly string[]).includes(f.eventType)
      ? { originalAnnouncement: { date: date.date, datePrecision: date.precision, sourceUrl: doc.url, ...(doc.title ? { sourceTitle: doc.title } : {}) } }
      : {}),
    latestMilestone: { date: event.date, datePrecision: event.datePrecision, description: event.summary, sourceUrl: doc.url },
    ...(investment ? { investment } : {}),
    areas,
    ...(floorIdx >= 0 ? { primaryAreaIndex: floorIdx } : {}),
    gradeA,
    ...(grounded.gradeAQuote ? { gradeAEvidence: `${doc.publisher}: "${quoteShort(grounded.gradeAQuote, 200)}"` } : {}),
    netNew: 'unknown',
    ...(grounded.forecastCompletion && !actual
      ? { forecastCompletion: { date: grounded.forecastCompletion.date, datePrecision: grounded.forecastCompletion.precision, sourceUrl: doc.url } }
      : {}),
    ...(actual ? { actualCompletion: actual } : {}),
    sources: [sourceFromDoc(doc, ctx.today)],
    lastVerified: ctx.today,
    confidence: doc.tier === 'primary' && doc.verification === 'direct' ? 'high' : 'medium',
    unresolvedQuestions: unresolved,
    events: [event],
    provenance: 'pipeline',
    createdAt: ctx.nowIso,
    updatedAt: ctx.nowIso,
  };
  return project;
}

/** Build the patch for an existing project, or report why it cannot be auto-applied. */
export function buildUpdate(
  item: FactItem,
  project: Project,
  today: string,
): { ops: PatchOp[]; conflicts: string[]; duplicate: boolean; notes: string[] } {
  const { doc, grounded } = item;
  const f = grounded.fact;
  const ops: PatchOp[] = [];
  const conflicts: string[] = [];
  const notes: string[] = [];
  const url = normaliseUrl(doc.url);
  const date = grounded.eventDate!;
  const sourceKnown = project.sources.some((s) => normaliseUrl(s.url) === url);

  if (f.emirate && f.emirate !== project.emirate) conflicts.push(`emirate ${f.emirate} differs from the register (${project.emirate})`);

  // Event (dedupe: same type within the window, or the same URL).
  const sameEvent = project.events.find(
    (e) => e.type === f.eventType && (normaliseUrl(e.sourceUrl) === url || Math.abs(daysBetween(e.date, date.date)) <= SAME_EVENT_WINDOW_DAYS),
  );
  let newStatus = project.status;
  // A source this project already cites, already recorded as a different
  // milestone, is being re-read: a human interpreted it once, so a different
  // reading (e.g. "commissioning" now read as "opened") goes to review.
  const recordedFromSource = project.events.filter((e) => normaliseUrl(e.sourceUrl) === url);
  if (!sameEvent && recordedFromSource.length) {
    conflicts.push(
      `this source is already recorded for the project as ${recordedFromSource.map((e) => `"${e.type}" (${e.id})`).join(', ')}; the extraction reads it as "${f.eventType}"`,
    );
  }
  if (!sameEvent) {
    if (NON_STATUS_EVENTS.includes(f.eventType)) {
      conflicts.push(`milestone type "${f.eventType}" does not imply a status and needs a human summary`);
    }
    const implied = statusFromEvent({ type: f.eventType });
    const latest = project.events[project.events.length - 1];
    if (implied && latest && date.date >= latest.date) {
      if (!isValidTransition(project.status, implied)) {
        conflicts.push(`status transition ${project.status} → ${implied} is not allowed without a correction`);
      } else newStatus = implied;
    }
    ops.push({ op: 'append', field: 'events', value: eventFromFact(item, project.events.map((e) => e.id)) });
  } else {
    notes.push(`milestone already recorded as event ${sameEvent.id}`);
  }
  if (!sourceKnown) ops.push({ op: 'append', field: 'sources', value: sourceFromDoc(doc, today) });

  // Completion dates
  if (isDeliveredStatus(newStatus) && !isDeliveredStatus(project.status)) {
    const actual = grounded.actualCompletion
      ? { date: grounded.actualCompletion.date, datePrecision: grounded.actualCompletion.precision, sourceUrl: doc.url }
      : { date: date.date, datePrecision: date.precision, sourceUrl: doc.url };
    ops.push({ op: 'set', field: 'actualCompletion', value: actual });
  } else if (grounded.forecastCompletion && !isDeliveredStatus(newStatus)) {
    const fc = { date: grounded.forecastCompletion.date, datePrecision: grounded.forecastCompletion.precision, sourceUrl: doc.url };
    const prev = project.forecastCompletion;
    if (!prev || prev.date !== fc.date || prev.datePrecision !== fc.datePrecision) ops.push({ op: 'set', field: 'forecastCompletion', value: fc });
  }

  // Areas: same basis must agree (±1 %); a new basis is added.
  for (const a of grounded.areas) {
    const existing = project.areas.filter((x) => x.basis === a.basis);
    if (!existing.length) {
      ops.push({ op: 'append', field: 'areas', value: areaMeasure(a, doc.url) });
      continue;
    }
    const agrees = existing.some((x) => Math.abs(x.valueM2 - a.valueM2) <= Math.max(1, x.valueM2 * 0.01));
    if (!agrees) {
      conflicts.push(
        `${a.basis} ${a.valueM2} m² ("${quoteShort(a.quote, 100)}") conflicts with the register (${existing.map((x) => `${x.valueM2} m²`).join(', ')})`,
      );
    }
  }

  // Investment
  const inv = investmentFrom(item);
  if (inv) {
    const cur = project.investment;
    if (!cur || !cur.disclosed) ops.push({ op: 'set', field: 'investment', value: inv });
    else if (cur.currency !== inv.currency || Math.abs((cur.amount ?? 0) - (inv.amount ?? 0)) > Math.max(1, (cur.amount ?? 0) * 0.005)) {
      conflicts.push(`investment ${inv.currency} ${inv.amount} conflicts with the register (${cur.currency} ${cur.amount})`);
    }
  }

  const duplicate = !!sameEvent && ops.every((o) => o.field === 'sources');
  return { ops, conflicts, duplicate, notes };
}

export function decide(item: FactItem, ctx: DecideContext): Decision {
  const { doc, grounded } = item;
  const f = grounded.fact;
  if (!f.inScope) return { action: 'skip', reason: `out of scope: ${f.outOfScopeReason ?? 'not a logistics/warehousing facility'}` };

  const match = matchFact(f, doc.url, ctx.projects, doc.recheckProjectId);
  const projectId = match.kind === 'existing' ? match.project.id : undefined;
  const corroborating = ctx.allItems.filter(
    (o) => o !== item && o.doc.url !== doc.url && milestoneKey(o, projectId) === milestoneKey(item, projectId),
  );
  const auth = authority(item, corroborating);
  const reasons: string[] = [];

  if (!item.groundingOk) reasons.push(...item.failures.map((r) => `grounding: ${r}`));
  const implied = statusFromEvent({ type: f.eventType });
  if (implied && grounded.eventDate?.from === 'publication_date' && !/\btoday\b/i.test(f.eventQuote)) {
    // A results report or market round-up published today says nothing about
    // when a facility opened or broke ground; only "today" ties the milestone
    // to the publication date. Otherwise the date would be invented.
    const what = isDeliveredStatus(implied) ? 'completion date' : 'milestone date';
    reasons.push(
      `the date of the "${f.eventType}" milestone is not stated and the quote does not say "today"; the publication date (${grounded.eventDate.date}) is not used as a ${what}`,
    );
  }

  if (match.kind === 'ambiguous') {
    reasons.push(`identity ambiguous: possible matches ${match.candidates.map((c) => `${c.projectId} (${c.score.toFixed(1)})`).join(', ')}`);
    return { action: 'hold', kind: 'new_project', proposed: heldProposalNew(item, undefined, match.candidates), reasons };
  }

  if (match.kind === 'existing') {
    const project = match.project;
    if (!grounded.eventDate) {
      return { action: 'hold', kind: 'update', projectId: project.id, proposed: heldProposalNew(item, undefined, match.candidates), reasons };
    }
    const upd = buildUpdate(item, project, ctx.today);
    if (upd.duplicate && item.groundingOk) {
      const hasNewSource = upd.ops.length > 0;
      if (!hasNewSource) return { action: 'skip', reason: `already recorded (${upd.notes.join('; ')})` };
      return { action: 'publish', kind: 'update', projectId: project.id, ops: upd.ops, verification: auth.verification, reason: `additional source for an existing milestone (${upd.notes.join('; ')})` };
    }
    if (upd.conflicts.length) reasons.push(...upd.conflicts);
    if (!auth.ok) reasons.push(auth.reason);
    if (!upd.ops.length && !reasons.length) return { action: 'skip', reason: 'nothing new' };
    if (reasons.length) {
      const kind: ReviewKind = upd.conflicts.length ? 'conflict' : 'update';
      return { action: 'hold', kind, projectId: project.id, proposed: { ...patchToProposed(upd.ops), _fact: f, _document: { url: doc.url, publisher: doc.publisher, tier: doc.tier, verification: doc.verification } }, reasons };
    }
    return { action: 'publish', kind: 'update', projectId: project.id, ops: upd.ops, verification: auth.verification, reason: `${EVENT_TYPE_LABELS[f.eventType]}: ${auth.reason}` };
  }

  // New project
  if (!f.emirate) reasons.push('emirate not stated in the source');
  if (!factParties(f).length) reasons.push('no company named as developer/operator/investor/owner');
  if (!f.zone && !f.location) reasons.push('no location or zone stated');
  if (NON_STATUS_EVENTS.includes(f.eventType) || f.eventType === 'cancelled') reasons.push(`milestone type "${f.eventType}" cannot start a new project record`);
  if (!grounded.areas.length && grounded.textHasUnextractedArea) reasons.push('the text mentions area figures that were not extracted');
  if (!grounded.eventDate) reasons.push('milestone date unknown');
  if (!auth.ok) reasons.push(auth.reason);
  let project: Project | undefined;
  if (f.emirate && grounded.eventDate && factParties(f).length) {
    try {
      project = buildNewProject(item, ctx);
    } catch (e) {
      reasons.push(`could not build a project record: ${(e as Error).message}`);
    }
  }
  if (reasons.length || !project) {
    return { action: 'hold', kind: 'new_project', proposed: heldProposalNew(item, project, match.candidates), reasons: reasons.length ? reasons : ['incomplete record'] };
  }
  return { action: 'publish', kind: 'new_project', project, verification: auth.verification, reason: `New project, ${EVENT_TYPE_LABELS[f.eventType]}: ${auth.reason}` };
}
