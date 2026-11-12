/**
 * One ingestion run: discover → fetch → extract → ground → match/decide →
 * apply (validated) → write atomically → issues → report.
 *
 * Safety properties:
 *  - Data files are written only after validateRegister passes on the exact
 *    bytes about to be written; otherwise nothing is written.
 *  - If every source scan fails, register/changelog/pending are untouched; meta
 *    records the failure; lastSuccessfulRun does not advance.
 *  - A dry run writes no data files and opens no issues (it still writes its
 *    report under pipeline-runs/).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  collectUsedIds,
  fnv1a,
  formatIssue,
  makeReviewId,
  normaliseUrl,
  todayIso,
  validateRegister,
  type ChangeRecord,
  type MetaFile,
  type PendingReviewItem,
  type Project,
  type ScanStatus,
  type ValidationResult,
} from '../shared/index.ts';
import type { PipelineConfig } from './config.ts';
import { CostTracker, type CostReport } from './cost.ts';
import { addDays } from './dates.ts';
import { decide, type Decision, type FactItem } from './decide.ts';
import { fetchArticles, scanSource, type DiscoveryContext, type DocOutcome } from './discovery.ts';
import { extractFacts, looksRelevant } from './extraction.ts';
import { groundFact } from './grounding.ts';
import { normaliseWhitespace } from './html.ts';
import { applyPatch, creationRecord, type PatchMeta } from './patch.ts';
import { recheckSearch, selectRecheck } from './recheck.ts';
import { SearchBudget } from './search/budget.ts';
import { parseSources, type PipelineSource } from './sources.ts';
import { preserveRaw, rawJson, readSnapshot, writeAtomically, nodeFs, type DataSnapshot, type PipelineState, type RunSummary, type WriteFs } from './store.ts';
import type { Clock, DocumentRecord, Extractor, Fetcher, IssueTracker, Logger, SearchProvider, SourceScanResult } from './types.ts';

export interface RunOptions {
  root: string;
  dryRun: boolean;
  /** Window start, YYYY-MM-DD. */
  since: string;
  sourceIds?: string[];
  maxSearches?: number;
  issues: boolean;
  recheck?: number;
  /** Where the JSON run report goes (default <root>/pipeline-runs). Set to null to skip. */
  reportDir?: string | null;
}

export interface RunDeps {
  fetcher: Fetcher;
  search: SearchProvider;
  extractor: Extractor;
  issues: IssueTracker;
  clock: Clock;
  logger: Logger;
  config: PipelineConfig;
  fs?: WriteFs;
}

export interface HeldReport {
  reviewId: string;
  kind: string;
  projectId?: string;
  url: string;
  /** What the extraction claimed (event type, project, quote), for reviewers reading the log. */
  claim?: string;
  reasons: string[];
  issueUrl?: string;
}

export interface RunReport {
  runId: string;
  startedAt: string;
  finishedAt: string;
  status: 'success' | 'partial' | 'failed';
  dryRun: boolean;
  window: { since: string; until: string };
  summary: string;
  sources: SourceScanResult[];
  failedSources: { id: string; name: string; note: string }[];
  documents: { fetched: number; httpRequests: number; extracted: number; outcomes: DocOutcome[] };
  candidates: number;
  published: { kind: string; projectId: string; reason: string; url: string; claim?: string }[];
  held: HeldReport[];
  skipped: { url: string; reason: string }[];
  recheck: { projectId: string; results: number; error?: string }[];
  searches: { used: number; cap: number; provider: string; log: SearchBudget['log'] };
  cost: CostReport;
  filesWritten: string[];
  validation: { ok: boolean; errors: string[]; warnings: number };
  errors: string[];
}

/** One-line description of an extracted claim: event type, project and a short quote. */
export function describeClaim(item: Pick<FactItem, 'grounded'>): string {
  const f = item.grounded.fact;
  const date = item.grounded.eventDate ? ` ${item.grounded.eventDate.date}${item.grounded.eventDate.from === 'publication_date' ? ' (publication date)' : ''}` : '';
  const quote = f.eventQuote ? ` — "${f.eventQuote.replace(/\s+/g, ' ').slice(0, 160)}"` : '';
  return `${f.eventType}${date}: ${f.projectName || 'unnamed'}${quote}`;
}

function runIdFor(now: Date): string {
  return `run-${now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`;
}

function validateAll(snap: { register: unknown; changelog: unknown; pendingReview: unknown; meta: unknown; sources: unknown }, today: string): ValidationResult {
  return validateRegister(snap, { today });
}

/** Items from the same document stay in order; official direct sources first; then by date. */
function orderItems(items: FactItem[]): FactItem[] {
  const rank = (i: FactItem) => (i.doc.tier === 'primary' && i.doc.verification === 'direct' ? 0 : i.doc.verification === 'direct' ? 1 : 2);
  return [...items].sort((a, b) => {
    const da = a.grounded.eventDate?.date ?? '9999';
    const db = b.grounded.eventDate?.date ?? '9999';
    if (da !== db) return da.localeCompare(db);
    return rank(a) - rank(b);
  });
}

export async function runIngest(opts: RunOptions, deps: RunDeps): Promise<RunReport> {
  const { clock, logger, config } = deps;
  const started = clock.now();
  const startedAt = started.toISOString().replace(/\.\d+Z$/, 'Z');
  const today = todayIso(started);
  const runId = runIdFor(started);
  const cost = new CostTracker(config);
  const search = new SearchBudget(deps.search, opts.maxSearches ?? config.maxSearchesPerRun, cost, logger);
  const report: RunReport = {
    runId,
    startedAt,
    finishedAt: startedAt,
    status: 'failed',
    dryRun: opts.dryRun,
    window: { since: opts.since, until: today },
    summary: '',
    sources: [],
    failedSources: [],
    documents: { fetched: 0, httpRequests: 0, extracted: 0, outcomes: [] },
    candidates: 0,
    published: [],
    held: [],
    skipped: [],
    recheck: [],
    searches: { used: 0, cap: opts.maxSearches ?? config.maxSearchesPerRun, provider: deps.search.name, log: [] },
    cost: cost.report(),
    filesWritten: [],
    validation: { ok: false, errors: [], warnings: 0 },
    errors: [],
  };
  const finish = async (rebuildSummary = false): Promise<RunReport> => {
    report.finishedAt = clock.now().toISOString().replace(/\.\d+Z$/, 'Z');
    report.cost = cost.report();
    report.searches.used = search.searchesUsed;
    report.searches.log = search.log;
    report.documents.httpRequests = deps.fetcher.requestCount();
    // The summary quotes searches and cost, so it is built only after the totals are final.
    if (rebuildSummary) report.summary = buildSummary(report);
    if (opts.reportDir !== null) {
      const dir = opts.reportDir ?? resolve(opts.root, 'pipeline-runs');
      try {
        await mkdir(dir, { recursive: true });
        // Run reports are local artefacts: keep the folder out of git without touching the root .gitignore.
        await writeFile(resolve(dir, '.gitignore'), '*\n', 'utf8');
        await writeFile(resolve(dir, `${runId}${opts.dryRun ? '-dry' : ''}.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      } catch (e) {
        logger.warn(`could not write run report: ${(e as Error).message}`);
      }
    }
    return report;
  };

  // ---- Load and check the starting state ----------------------------------
  let snap: DataSnapshot;
  let sources: PipelineSource[];
  try {
    snap = await readSnapshot(opts.root);
    sources = parseSources(snap.sourcesRaw).sources;
  } catch (e) {
    report.errors.push(`could not load data files: ${(e as Error).message}`);
    report.summary = `Run failed before scanning: ${(e as Error).message}. No data files were changed.`;
    return finish();
  }
  const baseline = validateAll(
    { register: snap.register, changelog: snap.changelog, pendingReview: snap.pendingReview, meta: snap.meta, sources: snap.sourcesRaw },
    today,
  );
  if (!baseline.ok) {
    report.errors.push(...baseline.errors.map(formatIssue));
    report.summary = `Run aborted: the data files fail validation before any change (${baseline.errors.length} error(s)). Fix them first; no data files were changed.`;
    return finish();
  }

  const state: PipelineState = structuredClone(snap.state);
  const selected = sources.filter((s) => !opts.sourceIds?.length || opts.sourceIds.includes(s.id));
  if (opts.sourceIds?.length) {
    const unknown = opts.sourceIds.filter((id) => !sources.some((s) => s.id === id));
    if (unknown.length) {
      report.errors.push(`unknown source id(s): ${unknown.join(', ')}`);
      report.summary = `Run aborted: unknown source id(s) ${unknown.join(', ')}. No data files were changed.`;
      return finish();
    }
  }

  // ---- Discovery -----------------------------------------------------------
  const ctx: DiscoveryContext = { fetcher: deps.fetcher, search, config, logger, sources, state, since: opts.since, today, articleSearchReserve: 0 };
  const docs: DocumentRecord[] = [];
  const recheckN = opts.recheck ?? config.recheckPerRun;
  const plannedRechecks = !opts.sourceIds?.length && recheckN > 0 ? recheckN : 0;
  const usesSearch = (s: PipelineSource) => s.enabled && s.accessMethods.some((m) => m.type === 'site_search');
  for (const [i, source] of selected.entries()) {
    // Searches for blocked articles may not eat into the searches that later
    // sources (site_search) and the rotating recheck still need.
    ctx.articleSearchReserve = selected.slice(i + 1).filter(usesSearch).length + plannedRechecks;
    logger.info(`scan ${source.id} …`);
    const { scan, items } = await scanSource(source, ctx);
    if (scan.status === 'ok' || scan.status === 'fallback_used') {
      const found = await fetchArticles(source, items, scan.method ?? 'listing', ctx, report.documents.outcomes);
      scan.documents = found.length;
      docs.push(...found);
    }
    report.sources.push(scan);
    logger.info(`  ${scan.status}${scan.method ? ` via ${scan.method}` : ''}: ${scan.note ?? ''} (${scan.documents} new document(s))`);
  }

  // ---- Rotating recheck of active projects ---------------------------------
  if (plannedRechecks > 0) {
    if (!search.available) {
      report.recheck.push({ projectId: '*', results: 0, error: `skipped: no search provider (${deps.search.name})` });
    } else {
      for (const p of selectRecheck(snap.register.projects, state, recheckN)) {
        const r = await recheckSearch(p, search, sources, config.resultsPerSearch);
        report.recheck.push({ projectId: p.id, results: r.bySource.reduce((n, g) => n + g.items.length, 0), ...(r.error ? { error: r.error } : {}) });
        if (!r.error) state.recheck[p.id] = startedAt;
        for (const g of r.bySource) {
          docs.push(...(await fetchArticles(g.source, g.items, 'recheck', ctx, report.documents.outcomes, { recheckProjectId: p.id })));
        }
      }
    }
  }

  // ---- Extraction + grounding ----------------------------------------------
  const knownUrls = new Set<string>([...deps.fetcher.fetchedUrls(), ...search.returnedUrls()]);
  const items: FactItem[] = [];
  const processed = (url: string, outcome: string, text?: string) => {
    state.processed[normaliseUrl(url)] = { at: startedAt, outcome, ...(text ? { contentHash: fnv1a(normaliseWhitespace(text).toLowerCase()) } : {}) };
  };
  const seenDocs = new Set<string>();
  let extractions = 0;
  let fatal: string | undefined;
  for (const doc of docs) {
    const key = normaliseUrl(doc.url);
    if (seenDocs.has(key)) continue;
    seenDocs.add(key);
    report.documents.fetched++;
    const out = (outcome: string) => report.documents.outcomes.push({ url: doc.url, sourceId: doc.sourceId, outcome });
    const project = doc.recheckProjectId ? snap.register.projects.find((p) => p.id === doc.recheckProjectId) : undefined;
    const windowStart = project && project.lastVerified < opts.since ? project.lastVerified : opts.since;
    if (!doc.publishedDate) {
      out('no_publication_date');
      processed(doc.url, 'no_publication_date', doc.text);
      continue;
    }
    if (doc.publishedDate < windowStart) {
      out('outside_window');
      processed(doc.url, 'outside_window', doc.text);
      continue;
    }
    if (!looksRelevant(doc)) {
      out('not_relevant');
      processed(doc.url, 'not_relevant', doc.text);
      continue;
    }
    if (doc.text.length > config.maxDocumentChars) {
      out('too_long_not_sent');
      processed(doc.url, 'too_long_not_sent', doc.text);
      continue;
    }
    if (fatal) {
      out('not_extracted_run_aborted');
      continue;
    }
    if (extractions >= config.maxExtractionsPerRun) {
      out('deferred_extraction_cap');
      continue; // not marked processed: picked up next run
    }
    extractions++;
    let res;
    try {
      res = await extractFacts(deps.extractor, doc);
    } catch (e) {
      fatal = `extraction aborted: ${(e as Error).message}`;
      out('extraction_error');
      continue;
    }
    cost.addLlm(res.usage);
    if (!res.ok) {
      const transient = /rate limited|API error|no ANTHROPIC_API_KEY|extraction disabled/.test(res.reason);
      out(`extraction_failed: ${res.reason}`);
      if (!transient) processed(doc.url, `extraction_failed: ${res.reason}`, doc.text);
      continue;
    }
    report.documents.extracted++;
    processed(doc.url, `extracted ${res.facts.length} fact(s)`, doc.text);
    out(`extracted ${res.facts.length} fact(s)`);
    for (const fact of res.facts) {
      const g = groundFact(fact, doc, { knownUrls, today });
      items.push({ doc, grounded: g.grounded, groundingOk: g.ok, failures: g.failures, notes: g.notes });
    }
  }
  report.candidates = items.length;
  if (fatal) report.errors.push(fatal);

  // ---- Decide + apply (each change validated) -------------------------------
  let projects: Project[] = structuredClone(snap.register.projects);
  let changes: ChangeRecord[] = structuredClone(snap.changelog.changes);
  let pending: PendingReviewItem[] = structuredClone(snap.pendingReview.items);
  const changeIds = new Set(changes.map((c) => c.id));
  const nowIso = startedAt;
  const newReviewIds: string[] = [];

  const stateFor = (ps: Project[], cs: ChangeRecord[], pend: PendingReviewItem[]) => ({
    register: { ...snap.register, projects: ps },
    changelog: { ...snap.changelog, changes: cs },
    pendingReview: { ...snap.pendingReview, items: pend },
    meta: snap.meta,
    sources: snap.sourcesRaw,
  });

  const hold = (item: FactItem, d: Extract<Decision, { action: 'hold' }>) => {
    const evidence = [
      {
        url: item.doc.url,
        ...(item.doc.publishedDate ? { publishedDate: item.doc.publishedDate } : {}),
        quote: item.grounded.fact.eventQuote.slice(0, 500),
      },
    ];
    const dup = pending.find(
      (p) => p.state === 'open' && p.kind === d.kind && (p.projectId ?? '') === (d.projectId ?? '') && p.evidence.some((e) => normaliseUrl(e.url) === normaliseUrl(item.doc.url)),
    );
    if (dup) {
      report.skipped.push({ url: item.doc.url, reason: `already pending review as ${dup.id}` });
      return;
    }
    const base = { createdAt: nowIso, evidence, proposed: d.proposed };
    const id = makeReviewId(base, pending.map((p) => p.id));
    const reasonHeld = d.reasons.join('; ');
    pending = [
      ...pending,
      { id, createdAt: nowIso, runId, kind: d.kind, ...(d.projectId ? { projectId: d.projectId } : {}), proposed: d.proposed, evidence, reasonHeld, state: 'open' },
    ];
    newReviewIds.push(id);
    report.held.push({ reviewId: id, kind: d.kind, ...(d.projectId ? { projectId: d.projectId } : {}), url: item.doc.url, claim: describeClaim(item), reasons: d.reasons });
  };

  for (const item of orderItems(items)) {
    const usedIds = collectUsedIds({ projects, changelog: changes, pending });
    const d = decide(item, { projects, usedIds, today, nowIso, allItems: items });
    if (d.action === 'skip') {
      report.skipped.push({ url: item.doc.url, reason: d.reason });
      continue;
    }
    if (d.action === 'hold') {
      hold(item, d);
      continue;
    }
    const meta: PatchMeta = {
      evidenceUrl: item.doc.url,
      evidenceDate: item.doc.publishedDate ?? item.grounded.eventDate?.date ?? today,
      reason: d.reason,
      verificationStatus: d.verification,
      appliedBy: 'pipeline',
      appliedAt: nowIso,
      runId,
    };
    const trialChangeIds = new Set(changeIds);
    let nextProjects: Project[];
    let nextChanges: ChangeRecord[];
    let projectId: string;
    if (d.kind === 'new_project') {
      projectId = d.project.id;
      nextProjects = [...projects, d.project];
      nextChanges = [...changes, creationRecord(d.project, meta, trialChangeIds)];
    } else {
      projectId = d.projectId;
      const current = projects.find((p) => p.id === d.projectId)!;
      const applied = applyPatch(current, d.ops, meta, trialChangeIds);
      nextProjects = projects.map((p) => (p.id === d.projectId ? applied.project : p));
      nextChanges = [...changes, ...applied.changes];
    }
    const v = validateAll(stateFor(nextProjects, nextChanges, pending), today);
    if (!v.ok) {
      hold(item, {
        action: 'hold',
        kind: d.kind === 'new_project' ? 'new_project' : 'update',
        ...(d.kind === 'update' ? { projectId: d.projectId } : {}),
        proposed: d.kind === 'new_project' ? { project: d.project } : { _ops: d.ops },
        reasons: ['the change would fail register validation', ...v.errors.slice(0, 5).map(formatIssue)],
      });
      continue;
    }
    projects = nextProjects;
    changes = nextChanges;
    for (const id of trialChangeIds) changeIds.add(id);
    report.published.push({ kind: d.kind, projectId, reason: d.reason, url: item.doc.url, claim: describeClaim(item) });
  }

  // ---- Run status, meta, state ---------------------------------------------
  const enabledScans = report.sources.filter((s) => s.status !== 'skipped');
  const failed = enabledScans.filter((s) => s.status === 'failed');
  report.failedSources = failed.map((s) => ({ id: s.sourceId, name: s.name, note: s.note ?? '' }));
  const allFailed = enabledScans.length > 0 && failed.length === enabledScans.length;
  report.status = fatal || allFailed || enabledScans.length === 0 ? 'failed' : failed.length ? 'partial' : 'success';

  const scanMap = new Map(snap.meta.sourceScans.map((s) => [s.sourceId, s]));
  for (const s of report.sources) {
    const prev = scanMap.get(s.sourceId);
    const okNow = s.status === 'ok' || s.status === 'fallback_used';
    scanMap.set(s.sourceId, {
      sourceId: s.sourceId,
      name: s.name,
      lastAttempt: startedAt,
      ...(okNow ? { lastSuccess: startedAt } : prev?.lastSuccess ? { lastSuccess: prev.lastSuccess } : {}),
      status: s.status as ScanStatus,
      ...(s.method ? { method: s.method } : {}),
      ...(s.note ? { note: s.note.slice(0, 500) } : {}),
    });
  }
  const meta: MetaFile = {
    ...snap.meta,
    lastAttemptedRun: startedAt,
    lastRunStatus: report.status,
    ...(report.status !== 'failed' ? { lastSuccessfulRun: startedAt } : {}),
    sourceScans: [...scanMap.values()].sort((a, b) => a.sourceId.localeCompare(b.sourceId)),
  };

  // On a failed run, keep register/changelog/pending exactly as they were, and
  // forget which URLs were processed so the next run looks at them again.
  if (report.status === 'failed') {
    state.processed = snap.state.processed;
    projects = snap.register.projects;
    changes = snap.changelog.changes;
    pending = snap.pendingReview.items;
    if (report.published.length || report.held.length) {
      report.errors.push('run failed: proposed changes were discarded');
      report.published = [];
      report.held = [];
    }
  }

  const registerChanged = report.published.length > 0;
  const rawReg = rawJson(snap.raw.register);
  const rawLog = rawJson(snap.raw.changelog);
  const rawPend = rawJson(snap.raw.pendingReview);
  const nextRegister = { ...rawReg, ...(registerChanged ? { updatedAt: nowIso } : {}), projects: preserveRaw(rawReg.projects, snap.register.projects, projects, (p) => p.id) };
  const nextChangelog = { ...rawLog, changes: preserveRaw(rawLog.changes, snap.changelog.changes, changes, (c) => c.id) };
  const pendingFile = (items: PendingReviewItem[]) => ({ ...rawPend, items: preserveRaw(rawPend.items, snap.pendingReview.items, items, (i) => i.id) });
  const files = {
    register: nextRegister,
    changelog: nextChangelog,
    pendingReview: pendingFile(pending),
    meta,
  };
  const finalCheck = validateAll({ ...files, sources: snap.sourcesRaw }, today);
  report.validation = { ok: finalCheck.ok, errors: finalCheck.errors.map(formatIssue), warnings: finalCheck.warnings.length };
  if (!finalCheck.ok) {
    report.status = 'failed';
    report.errors.push('final validation failed: nothing was written');
    return finish(true);
  }

  const summary: RunSummary = {
    runId,
    startedAt,
    finishedAt: clock.now().toISOString().replace(/\.\d+Z$/, 'Z'),
    status: report.status,
    dryRun: opts.dryRun,
    sourcesOk: enabledScans.length - failed.length,
    sourcesFailed: failed.map((s) => s.sourceId),
    documents: report.documents.fetched,
    published: report.published.length,
    held: report.held.length,
    searches: search.searchesUsed,
    estimatedCostUsd: cost.report().totalUsd,
  };
  state.runs = [...state.runs, summary].slice(-config.runHistoryLength);

  if (opts.dryRun) {
    logger.info('dry run: no data files written, no issues opened');
    return finish(true);
  }

  const fs = deps.fs ?? nodeFs;
  try {
    report.filesWritten = await writeAtomically(opts.root, snap.raw, { ...files, state }, fs);
  } catch (e) {
    report.status = 'failed';
    report.errors.push(`writing data files failed (rolled back): ${(e as Error).message}`);
    return finish(true);
  }

  // ---- Issues for pending-review items --------------------------------------
  if (report.status !== 'failed') {
    if (!opts.issues) logger.info('issues: skipped (--no-issues)');
    else if (!deps.issues.enabled) logger.info('issues: skipped (no GITHUB_TOKEN / GITHUB_REPOSITORY); pending items are in data/pending-review.json');
    else {
      const needing = pending.filter((p) => p.state === 'open' && !p.issueUrl).slice(0, 20);
      let updated = false;
      for (const item of needing) {
        try {
          const url = await deps.issues.ensureIssue({ key: item.id, title: `[pending-review] ${item.id}: ${issueTitle(item)}`, body: issueBody(item), labels: ['pending-review'] });
          item.issueUrl = url;
          updated = true;
          const h = report.held.find((x) => x.reviewId === item.id);
          if (h) h.issueUrl = url;
        } catch (e) {
          logger.warn(`issue for ${item.id} not created: ${(e as Error).message}`);
        }
      }
      if (updated) {
        const nextPending = pendingFile(pending);
        const v = validateAll({ ...files, pendingReview: nextPending, sources: snap.sourcesRaw }, today);
        if (v.ok) {
          const reread = await readSnapshot(opts.root);
          const extra = await writeAtomically(opts.root, reread.raw, { pendingReview: nextPending }, fs);
          report.filesWritten = [...new Set([...report.filesWritten, ...extra])];
        } else report.errors.push('issue URLs not saved: validation failed');
      }
    }
  }
  return finish(true);
}

function issueTitle(item: PendingReviewItem): string {
  const fact = (item.proposed as { _fact?: { projectName?: string; eventType?: string } })._fact;
  const what = fact?.projectName ? `${fact.projectName}${fact.eventType ? ` (${fact.eventType})` : ''}` : item.projectId ?? 'new announcement';
  return `${item.kind} — ${what}`.slice(0, 200);
}

function issueBody(item: PendingReviewItem): string {
  return [
    `Pending review item **${item.id}** (${item.kind}${item.projectId ? `, project \`${item.projectId}\`` : ''}).`,
    '',
    `**Why it was held:** ${item.reasonHeld}`,
    '',
    '**Evidence:**',
    ...item.evidence.map((e) => `- ${e.url}${e.publishedDate ? ` (${e.publishedDate})` : ''}${e.quote ? `\n  > ${e.quote.replace(/\n/g, ' ')}` : ''}`),
    '',
    'To resolve: `npm run review -- accept ' + item.id + '` or `npm run review -- reject ' + item.id + ' --note "..."`, or edit `data/pending-review.json` in a pull request. See docs/REVIEW_GUIDE.md.',
    '',
    '_Opened automatically by the ingestion pipeline. The proposed values are in data/pending-review.json._',
  ].join('\n');
}

export function buildSummary(r: RunReport): string {
  const lines: string[] = [];
  const scanned = r.sources.filter((s) => s.status !== 'skipped');
  lines.push(`Run ${r.runId}${r.dryRun ? ' (dry run)' : ''}: ${r.status.toUpperCase()}.`);
  if (r.failedSources.length) {
    lines.push(
      `${r.failedSources.length} of ${scanned.length} source(s) could NOT be scanned: ${r.failedSources.map((s) => s.id).join(', ')}. Existing data for them was kept; announcements from them may be missing.`,
    );
  }
  const ok = scanned.length - r.failedSources.length;
  lines.push(`${ok} source(s) scanned (${scanned.filter((s) => s.status === 'fallback_used').length} via a fallback method); ${r.documents.fetched} new document(s); ${r.documents.extracted} extracted; ${r.candidates} candidate fact(s).`);
  lines.push(`${r.published.length} change(s) published; ${r.held.length} held for review; searches used ${r.searches.used}/${r.searches.cap}; estimated cost $${r.cost.totalUsd.toFixed(4)}.`);
  // Documents that reached the extraction step but were not analysed: never claim "nothing new" over them.
  const notAnalysed = r.documents.outcomes.filter((o) => /^(extraction_failed|extraction_error|deferred_extraction_cap|not_extracted_run_aborted|too_long_not_sent)/.test(o.outcome));
  if (notAnalysed.length) {
    const reasons = [...new Set(notAnalysed.map((o) => o.outcome.replace(/^extraction_failed: /, '')))].slice(0, 3).join('; ');
    lines.push(`${notAnalysed.length} relevant document(s) were NOT analysed (${reasons}); whether they contain new announcements is unknown.`);
  }
  if (r.status !== 'failed' && !r.failedSources.length && r.published.length === 0 && r.held.length === 0 && !notAnalysed.length) {
    lines.push(`No new in-scope announcements were found in the ${ok} scanned source(s) between ${r.window.since} and ${r.window.until} (coverage is not exhaustive).`);
  }
  if (r.errors.length) lines.push(`Errors: ${r.errors.slice(0, 5).join(' | ')}`);
  return lines.join('\n');
}

/**
 * Cost by model, searches, rechecks and per-document outcomes as log lines.
 * The run report artifact is not always reachable, so the log carries these too.
 */
export function reportDigest(r: RunReport): string[] {
  const lines: string[] = [];
  const c = r.cost;
  const models = Object.entries(c.byModel).map(([m, t]) => {
    const cache = t.cacheReadInputTokens || t.cacheCreationInputTokens ? `, ${t.cacheReadInputTokens} cache read, ${t.cacheCreationInputTokens} cache write` : '';
    return `${m}: ${t.calls} call(s), ${t.inputTokens} input / ${t.outputTokens} output tokens${cache}, $${t.costUsd.toFixed(4)}`;
  });
  lines.push(`Cost: $${c.totalUsd.toFixed(4)} in total; web searches billed: ${c.webSearches} ($${c.webSearchCostUsd.toFixed(4)})`);
  for (const m of models) lines.push(`  ${m}`);
  if (c.unpricedModels.length) lines.push(`  UNPRICED (not in the total): ${c.unpricedModels.join(', ')}`);
  const searchErrors = r.searches.log.filter((l) => l.error);
  const errText = searchErrors.length ? `; ${searchErrors.length} failed: ${[...new Set(searchErrors.map((l) => l.error))].slice(0, 3).join(' | ')}` : '';
  lines.push(`Searches: ${r.searches.used}/${r.searches.cap} via ${r.searches.provider}${errText}`);
  if (r.recheck.length) lines.push(`Recheck: ${r.recheck.map((x) => `${x.projectId} ${x.error ? `(${x.error})` : `${x.results} result(s)`}`).join('; ')}`);
  const counts = new Map<string, number>();
  for (const o of r.documents.outcomes) {
    const k = o.outcome.replace(/:.*$/, '');
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const countText = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ');
  lines.push(`Document outcomes: ${countText || 'none'}`);
  for (const o of r.documents.outcomes) {
    if (/^(extracted|extraction_failed|extraction_error|deferred_extraction_cap|too_long_not_sent|fallback_search_skipped)/.test(o.outcome)) {
      lines.push(`  doc ${o.sourceId}: ${o.outcome} — ${o.url}`);
    }
  }
  for (const s of r.skipped) lines.push(`  skipped ${s.url}: ${s.reason}`);
  return lines;
}

/** Default window start for `--since 7d` style values. */
export function sinceFromArg(arg: string | undefined, today: string, defaultDays: number): string {
  if (!arg) return addDays(today, -defaultDays);
  const m = /^(\d+)d$/.exec(arg);
  if (m) return addDays(today, -Number(m[1]));
  if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) return arg;
  throw new Error(`--since must look like 7d or YYYY-MM-DD (got "${arg}")`);
}
