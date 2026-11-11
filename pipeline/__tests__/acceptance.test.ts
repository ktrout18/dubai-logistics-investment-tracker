/**
 * Owner's acceptance checks a–i (offline; fakes for fetch, search, LLM, clock, GitHub).
 */
import { describe, expect, it } from 'vitest';
import { computeMetrics, validateRegister, type ChangelogFile, type MetaFile, type PendingReviewFile, type RegisterFile } from '../../shared/index.ts';
import { CostTracker } from '../cost.ts';
import { DEFAULT_CONFIG } from '../config.ts';
import { checkAreaBasis, groundFact } from '../grounding.ts';
import type { DocumentRecord } from '../types.ts';
import {
  FakeExtractor,
  FakeIssues,
  FakeSearch,
  acmeProject,
  article,
  betaProject,
  fact,
  listing,
  makeDataDir,
  newsSitemap,
  quietWeb,
  readBytes,
  readJson,
  run,
} from './helpers.ts';

// ---------------------------------------------------------------------------
// Shared fixtures for the Acme opening (tests a, b)
// ---------------------------------------------------------------------------

const ACME_URL = 'https://www.jafza.ae/news/acme-opens-cold-store/';
const ACME_TEXT = [
  'Dubai, 9 November 2026: Acme Logistics today officially opened its cold store in Jebel Ali Free Zone (Jafza).',
  'The facility, which offers 20,000 square metres of warehouse space, was inaugurated in the presence of senior Jafza officials.',
];
const acmeOpenedFact = fact({
  projectName: 'Acme Logistics Jafza Cold Store',
  operator: 'Acme Logistics',
  partiesQuote: 'Acme Logistics today officially opened its cold store',
  zone: 'Jafza',
  location: 'Jebel Ali Free Zone',
  locationQuote: 'Jebel Ali Free Zone (Jafza)',
  emirate: 'Dubai',
  emirateQuote: 'Dubai, 9 November 2026',
  assetType: 'cold_store',
  sectors: ['food_fmcg_cold_chain'],
  eventType: 'opened',
  eventQuote: 'Acme Logistics today officially opened its cold store in Jebel Ali Free Zone (Jafza)',
  eventDate: { date: '2026-11-09', precision: 'day', quote: 'Dubai, 9 November 2026' },
  areas: [{ value: 20000, unit: 'sqm', basis: 'warehouse_gfa', quote: 'The facility, which offers 20,000 square metres of warehouse space' }],
});

function acmeWeb() {
  const web = quietWeb();
  web.set('https://www.jafza.ae/news/', { status: 200, body: listing([{ url: ACME_URL, title: 'Acme opens cold store', date: '9 November 2026' }]) });
  web.set(ACME_URL, { status: 200, body: article({ title: 'Acme Logistics opens cold store in Jafza', date: '2026-11-09', paragraphs: ACME_TEXT }) });
  return web;
}

describe('a. official opening of an existing under-construction project', () => {
  it('updates the same project to operational, appends an event, writes ChangeRecords, and delivered totals rise', async () => {
    const root = await makeDataDir([acmeProject(), betaProject()]);
    const before = await readJson<RegisterFile>(root, 'register.json');
    const metricsBefore = computeMetrics(before.projects, 2026);

    const report = await run(root, { web: acmeWeb(), extractor: new FakeExtractor({ [ACME_URL]: [acmeOpenedFact] }) });

    expect(report.status).toBe('partial'); // pcfc is 403 with no search provider
    expect(report.published).toHaveLength(1);
    const reg = await readJson<RegisterFile>(root, 'register.json');
    expect(reg.projects).toHaveLength(2);
    const acme = reg.projects.find((p) => p.id === 'acme-logistics-jafza-cold-store')!;
    expect(acme.status).toBe('operational');
    expect(acme.events).toHaveLength(3);
    expect(acme.events[2]).toMatchObject({ type: 'opened', date: '2026-11-09', sourceUrl: ACME_URL, sourceType: 'primary', verification: 'direct' });
    expect(acme.actualCompletion).toEqual({ date: '2026-11-09', datePrecision: 'day', sourceUrl: ACME_URL });
    expect(acme.latestMilestone.sourceUrl).toBe(ACME_URL);
    expect(acme.lastVerified).toBe('2026-11-11');
    expect(acme.sources.map((s) => s.url)).toContain(ACME_URL);

    const log = await readJson<ChangelogFile>(root, 'changelog.json');
    const fields = log.changes.map((c) => c.field);
    expect(fields).toEqual(expect.arrayContaining(['events', 'sources', 'actualCompletion', 'status', 'latestMilestone', 'lastVerified']));
    const statusChange = log.changes.find((c) => c.field === 'status')!;
    expect(statusChange).toMatchObject({ previousValue: 'under_construction', newValue: 'operational', evidenceUrl: ACME_URL, evidenceDate: '2026-11-09', verificationStatus: 'verified_official', appliedBy: 'pipeline' });

    const metricsAfter = computeMetrics(reg.projects, 2026);
    expect(metricsBefore.otherModernDelivered.areas.warehouse_gfa.totalM2).toBe(0);
    expect(metricsAfter.otherModernDelivered.areas.warehouse_gfa.totalM2).toBe(20000);
    expect(metricsAfter.otherModernDelivered.projectIds).toContain(acme.id);
    expect(metricsAfter.underConstruction.all.projectIds).not.toContain(acme.id);

    expect(metricsAfter.otherModernDelivered.projectIds.length).toBe(metricsBefore.otherModernDelivered.projectIds.length + 1);
    expect(metricsBefore.underConstruction.all.projectIds).toContain(acme.id);
    // Every ChangeRecord belongs to this project and cites the opening article.
    expect(log.changes.every((c) => c.projectId === acme.id && c.evidenceUrl === ACME_URL && c.appliedBy === 'pipeline')).toBe(true);
    expect(new Set(log.changes.map((c) => c.id)).size).toBe(log.changes.length);

    const meta = await readJson<MetaFile>(root, 'meta.json');
    expect(meta.lastSuccessfulRun).toBe('2026-11-11T06:00:00Z');
    expect(meta.sourceScans.find((s) => s.sourceId === 'jafza')?.status).toBe('ok');
    // The written file set passes the same validator CI and the site rely on.
    const files = {
      register: reg,
      changelog: log,
      pendingReview: await readJson(root, 'pending-review.json'),
      meta,
      sources: await readJson(root, 'sources.json'),
    };
    expect(validateRegister(files, { today: '2026-11-11' }).errors).toEqual([]);
  });
});

describe('b. the same article again, and a syndicated copy', () => {
  it('creates no duplicate project and no duplicate event', async () => {
    const root = await makeDataDir([acmeProject(), betaProject()]);
    const extractor = new FakeExtractor({ [ACME_URL]: [acmeOpenedFact] });
    await run(root, { web: acmeWeb(), extractor });
    const afterFirst = await readJson<RegisterFile>(root, 'register.json');

    // Same URL again: skipped as already processed (no second extraction call).
    const logAfterFirst = await readBytes(root, 'changelog.json');
    const again = await run(root, { web: acmeWeb(), extractor });
    expect(extractor.calls.filter((u) => u === ACME_URL)).toHaveLength(1);
    expect(again.published).toHaveLength(0);
    expect(again.held).toHaveLength(0);
    expect(await readJson<RegisterFile>(root, 'register.json')).toEqual(afterFirst);
    expect(await readBytes(root, 'changelog.json')).toBe(logAfterFirst);

    // Syndicated copy at another URL (secondary source).
    const GN = 'https://gulfnews.com/business/acme-opens-jafza-cold-store-1.500900';
    const gnText = ['Acme Logistics on 9 November 2026 opened its cold store in Jebel Ali Free Zone (Jafza), Dubai, adding 20,000 square metres of warehouse space.'];
    const web = acmeWeb();
    web.set('https://gulfnews.com/news_sitemap.xml', { status: 200, contentType: 'text/xml', body: newsSitemap([{ url: GN, date: '2026-11-10', title: 'Acme opens Jafza cold store' }]) });
    web.set(GN, { status: 200, body: article({ title: 'Acme opens Jafza cold store', date: '2026-11-10', paragraphs: gnText }) });
    const gnFact = fact({
      ...acmeOpenedFact,
      partiesQuote: 'Acme Logistics on 9 November 2026 opened its cold store',
      emirateQuote: 'Jebel Ali Free Zone (Jafza), Dubai',
      eventQuote: 'Acme Logistics on 9 November 2026 opened its cold store in Jebel Ali Free Zone (Jafza)',
      eventDate: { date: '2026-11-09', precision: 'day', quote: 'on 9 November 2026' },
      areas: [{ value: 20000, unit: 'sqm', basis: 'warehouse_gfa', quote: 'adding 20,000 square metres of warehouse space' }],
    });
    const third = await run(root, { web, extractor: new FakeExtractor({ [GN]: [gnFact] }) });
    const reg = await readJson<RegisterFile>(root, 'register.json');
    expect(reg.projects).toHaveLength(2);
    const acme = reg.projects.find((p) => p.id === 'acme-logistics-jafza-cold-store')!;
    expect(acme.events.filter((e) => e.type === 'opened')).toHaveLength(1);
    expect(acme.sources.map((s) => s.url)).toContain(GN); // a syndicated copy adds a source, not a project
    expect(acme.status).toBe('operational');
    expect(third.held).toHaveLength(0);
    const newRecords = (await readJson<ChangelogFile>(root, 'changelog.json')).changes.filter((c) => c.evidenceUrl === GN);
    expect(newRecords.map((c) => c.field)).not.toEqual(expect.arrayContaining(['events']));
    expect(newRecords.map((c) => c.field)).not.toEqual(expect.arrayContaining(['status']));
    expect(newRecords.map((c) => c.field)).not.toContain('*');
  });

  it('a new project announced officially, then re-reported by the media in a later run, stays one project', async () => {
    const root = await makeDataDir([acmeProject(), betaProject()]);
    const DS = 'https://www.dubaisouth.ae/en/newsroom/zeta-cold-chain-signs-agreement-for-cold-store';
    const dsText = ['Dubai South, 6 November 2026: Zeta Cold Chain today signed an agreement with Dubai South to develop a cold store in the Logistics District of Dubai South.'];
    const web1 = quietWeb();
    web1.set('https://www.dubaisouth.ae/en/newsroom', { status: 200, body: listing([{ url: DS, title: 'Zeta Cold Chain signs agreement', date: '6 November 2026' }]) });
    web1.set(DS, { status: 200, body: article({ title: 'Zeta Cold Chain signs agreement for cold store', date: '2026-11-06', paragraphs: dsText }) });
    const base = {
      projectName: 'Zeta Cold Chain Dubai South Cold Store', operator: 'Zeta Cold Chain', zone: 'Dubai South', location: 'Logistics District of Dubai South',
      emirate: 'Dubai' as const, assetType: 'cold_store' as const, sectors: ['food_fmcg_cold_chain' as const], eventType: 'agreement_signed' as const,
    };
    const official = fact({
      ...base, partiesQuote: 'Zeta Cold Chain today signed an agreement with Dubai South', locationQuote: 'in the Logistics District of Dubai South', emirateQuote: 'Dubai South, 6 November 2026',
      eventQuote: 'Zeta Cold Chain today signed an agreement with Dubai South to develop a cold store', eventDate: { date: '2026-11-06', precision: 'day', quote: 'Dubai South, 6 November 2026' },
    });
    const first = await run(root, { web: web1, extractor: new FakeExtractor({ [DS]: [official] }) });
    expect(first.published).toEqual([expect.objectContaining({ kind: 'new_project' })]);
    const zetaId = first.published[0]!.projectId;

    const GN = 'https://gulfnews.com/business/zeta-cold-chain-to-build-dubai-south-cold-store-1.500990';
    const gnText = ['Zeta Cold Chain signed an agreement on 6 November 2026 to develop a cold store in the Logistics District of Dubai South, Dubai, the company said.'];
    const web2 = quietWeb();
    web2.set('https://gulfnews.com/news_sitemap.xml', { status: 200, contentType: 'text/xml', body: newsSitemap([{ url: GN, date: '2026-11-07', title: 'Zeta Cold Chain to build Dubai South cold store' }]) });
    web2.set(GN, { status: 200, body: article({ title: 'Zeta Cold Chain to build Dubai South cold store', date: '2026-11-07', paragraphs: gnText }) });
    const media = fact({
      ...base, partiesQuote: 'Zeta Cold Chain signed an agreement', locationQuote: 'in the Logistics District of Dubai South, Dubai', emirateQuote: 'Dubai South, Dubai',
      eventQuote: 'Zeta Cold Chain signed an agreement on 6 November 2026 to develop a cold store', eventDate: { date: '2026-11-06', precision: 'day', quote: 'on 6 November 2026' },
    });
    const second = await run(root, { web: web2, extractor: new FakeExtractor({ [GN]: [media] }) });
    expect(second.published.every((p) => p.kind !== 'new_project')).toBe(true);
    const reg = await readJson<RegisterFile>(root, 'register.json');
    expect(reg.projects).toHaveLength(3);
    const zeta = reg.projects.filter((p) => p.operator === 'Zeta Cold Chain');
    expect(zeta).toHaveLength(1);
    expect(zeta[0]!.id).toBe(zetaId);
    expect(zeta[0]!.events.filter((e) => e.type === 'agreement_signed')).toHaveLength(1);
    // Either recorded as an extra source on the same project, or held for a reviewer, but never a second project.
    const pending = await readJson<PendingReviewFile>(root, 'pending-review.json');
    expect(pending.items.every((i) => i.kind !== 'new_project')).toBe(true);
  });

  it('an identical copy of an already-processed article at another URL is not extracted again', async () => {
    const root = await makeDataDir([acmeProject(), betaProject()]);
    const extractor = new FakeExtractor({ [ACME_URL]: [acmeOpenedFact] });
    await run(root, { web: acmeWeb(), extractor });
    const COPY = 'https://www.jafza.ae/news/acme-opens-cold-store-copy/';
    const web = acmeWeb();
    web.set('https://www.jafza.ae/news/', { status: 200, body: listing([{ url: COPY, title: 'Acme opens cold store', date: '9 November 2026' }]) });
    web.set(COPY, { status: 200, body: article({ title: 'Acme Logistics opens cold store in Jafza', date: '2026-11-09', paragraphs: ACME_TEXT }) });
    const regBefore = await readBytes(root, 'register.json');
    const r = await run(root, { web, extractor });
    expect(extractor.calls).not.toContain(COPY);
    expect(r.published).toHaveLength(0);
    expect(await readBytes(root, 'register.json')).toBe(regBefore);
  });
});

describe('c. MoU followed by a signed agreement', () => {
  it("advances the existing project's status with one event and no second project", async () => {
    const root = await makeDataDir([acmeProject(), betaProject()]);
    const URL = 'https://www.dubaisouth.ae/en/newsroom/beta-and-gamma-sign-agreement-for-distribution-centre';
    const text = [
      'Dubai South, 5 November 2026: Beta Developments and Gamma Retail today signed a development agreement for a distribution centre in the Logistics District of Dubai South.',
      'The agreement follows the memorandum of understanding signed in June.',
    ];
    const web = quietWeb();
    web.set('https://www.dubaisouth.ae/en/newsroom', { status: 200, body: listing([{ url: URL, title: 'Beta and Gamma sign agreement', date: '5 November 2026' }]) });
    web.set(URL, { status: 200, body: article({ title: 'Beta and Gamma sign agreement for distribution centre', date: '2026-11-05', paragraphs: text }) });
    const f = fact({
      projectName: 'Beta Developments Dubai South Distribution Centre',
      developer: 'Beta Developments',
      operator: 'Gamma Retail',
      partiesQuote: 'Beta Developments and Gamma Retail today signed a development agreement',
      zone: 'Dubai South',
      location: 'Logistics District of Dubai South',
      locationQuote: 'in the Logistics District of Dubai South',
      emirate: 'Dubai',
      emirateQuote: 'Dubai South, 5 November 2026',
      assetType: 'distribution_centre',
      eventType: 'agreement_signed',
      eventQuote: 'Beta Developments and Gamma Retail today signed a development agreement for a distribution centre',
      eventDate: { date: '2026-11-05', precision: 'day', quote: '5 November 2026' },
    });
    const report = await run(root, { web, extractor: new FakeExtractor({ [URL]: [f] }) });
    expect(report.published).toEqual([expect.objectContaining({ kind: 'update', projectId: 'beta-developments-dubai-south-dc' })]);
    const reg = await readJson<RegisterFile>(root, 'register.json');
    expect(reg.projects).toHaveLength(2);
    const beta = reg.projects.find((p) => p.id === 'beta-developments-dubai-south-dc')!;
    expect(beta.status).toBe('signed_agreement');
    expect(beta.events.map((e) => e.type)).toEqual(['mou', 'agreement_signed']);
    expect(beta.latestMilestone).toMatchObject({ date: '2026-11-05', sourceUrl: URL });
    const log = await readJson<ChangelogFile>(root, 'changelog.json');
    expect(log.changes.find((c) => c.field === 'status')).toMatchObject({ projectId: beta.id, previousValue: 'mou', newValue: 'signed_agreement', evidenceUrl: URL });
    expect(log.changes.some((c) => c.field === '*')).toBe(false); // no project was created
    expect(beta.actualCompletion).toBeUndefined();
  });
});

describe('d. primary source returning 403', () => {
  it('runs the fallback chain (alt URL, then site search) and still finds the document', async () => {
    const root = await makeDataDir([acmeProject()]);
    const PCFC = 'https://pcfc.ae/en/pages/newsdetails.aspx?newsid=501';
    const MO = 'https://www.mediaoffice.ae/en/news/2026/november/08-11/pcfc-announces-new-logistics-hub';
    const web = quietWeb(); // both PCFC listing pages answer 403
    web.set(PCFC, { status: 403, body: 'Forbidden' });
    web.set(MO, {
      status: 200,
      body: article({ title: 'PCFC announces new logistics hub', date: '2026-11-08', paragraphs: ['PCFC announced a new logistics hub in Jebel Ali on 8 November 2026, according to the Dubai Media Office.'] }),
    });
    const search = new FakeSearch((q) => {
      if (q.site === 'pcfc.ae' && q.query === 'PCFC news') {
        return [{ url: PCFC, title: 'PCFC announces new logistics hub', snippet: 'PCFC announced a new logistics hub in Jebel Ali.', pageAge: '2026-11-08' }];
      }
      if (q.query.includes('PCFC announces new logistics hub')) return [{ url: MO, title: 'PCFC announces new logistics hub' }];
      return [];
    });
    const extractor = new FakeExtractor({});
    const report = await run(root, { web, search, extractor }, { sourceIds: ['pcfc'] });

    const scan = report.sources.find((s) => s.sourceId === 'pcfc')!;
    expect(scan.status).toBe('fallback_used');
    expect(scan.method).toBe('site_search');
    expect(scan.attempts.map((a) => a.method)).toEqual(['html_list', 'alt_url', 'site_search']);
    expect(scan.attempts[0]!.result).toMatch(/403/);
    expect(scan.attempts[1]!.result).toMatch(/403/);
    // The announcement was still found: as an indexed snippet and via the syndicated Media Office copy.
    expect(extractor.calls).toEqual(expect.arrayContaining([PCFC, MO]));
    // The 403 article was requested once only (no retries).
    expect(web.requests.filter((r) => r === `GET ${PCFC}`)).toHaveLength(1);
    const meta = await readJson<MetaFile>(root, 'meta.json');
    expect(meta.sourceScans.find((s) => s.sourceId === 'pcfc')).toMatchObject({ status: 'fallback_used', method: 'site_search' });
  });
});

describe('e. claims that must be held for review', () => {
  it('holds single-secondary, unquotable, conflicting-area and ambiguous claims; requests issues; register unchanged', async () => {
    const twin = { ...acmeProject(), id: 'acme-logistics-jafza-cold-store-2', name: 'Acme Logistics Jafza Cold Store Two' };
    const root = await makeDataDir([acmeProject(), betaProject(), twin]);
    const registerBefore = await readBytes(root, 'register.json');

    const GN = 'https://gulfnews.com/business/delta-freight-to-build-warehouse-1.500901';
    const JZ = 'https://www.jafza.ae/news/acme-expands/';
    const DS = 'https://www.dubaisouth.ae/en/newsroom/beta-distribution-centre-update';
    const web = quietWeb();
    web.set('https://gulfnews.com/news_sitemap.xml', { status: 200, contentType: 'text/xml', body: newsSitemap([{ url: GN, date: '2026-11-07', title: 'Delta Freight to build warehouse' }]) });
    web.set(GN, {
      status: 200,
      body: article({ title: 'Delta Freight to build warehouse', date: '2026-11-07', paragraphs: ['Delta Freight will build a 15,000 square metre warehouse in Dubai Industrial City, Dubai, the company said on 7 November 2026.'] }),
    });
    web.set('https://www.jafza.ae/news/', { status: 200, body: listing([{ url: JZ, title: 'Acme update' }]) });
    web.set(JZ, { status: 200, body: article({ title: 'Acme update', date: '2026-11-06', paragraphs: ['Acme Logistics said on 6 November 2026 that work continues in Jafza, Dubai.'] }) });
    web.set('https://www.dubaisouth.ae/en/newsroom', { status: 200, body: listing([{ url: DS, title: 'Beta update' }]) });
    web.set(DS, {
      status: 200,
      body: article({ title: 'Beta distribution centre update', date: '2026-11-08', paragraphs: ['Beta Developments said on 8 November 2026 that its distribution centre in Dubai South will offer 50,000 square metres of warehouse space.'] }),
    });

    const singleSecondary = fact({
      projectName: 'Delta Freight Dubai Industrial City Warehouse', operator: 'Delta Freight', partiesQuote: 'Delta Freight will build',
      zone: 'Dubai Industrial City', location: 'Dubai Industrial City', locationQuote: 'in Dubai Industrial City, Dubai', emirate: 'Dubai', emirateQuote: 'Dubai Industrial City, Dubai',
      eventType: 'announcement', eventQuote: 'Delta Freight will build a 15,000 square metre warehouse',
      eventDate: { date: '2026-11-07', precision: 'day', quote: 'on 7 November 2026' },
      areas: [{ value: 15000, unit: 'sqm', basis: 'warehouse_gfa', quote: 'a 15,000 square metre warehouse' }],
    });
    const notInText = fact({
      projectName: 'Acme Logistics Jafza Cold Store', operator: 'Acme Logistics', partiesQuote: 'Acme Logistics said',
      zone: 'Jafza', emirate: 'Dubai', emirateQuote: 'Jafza, Dubai', assetType: 'cold_store',
      eventType: 'construction_completed', eventQuote: 'Acme Logistics completed construction of its cold store', // not in the page
      eventDate: { date: '2026-11-06', precision: 'day', quote: 'on 6 November 2026' },
    });
    const conflictingArea = fact({
      projectName: 'Beta Developments Dubai South Distribution Centre', developer: 'Beta Developments', partiesQuote: 'Beta Developments said',
      zone: 'Dubai South', emirate: 'Dubai', emirateQuote: 'in Dubai South', assetType: 'distribution_centre',
      eventType: 'mou', eventQuote: 'its distribution centre in Dubai South will offer 50,000 square metres of warehouse space',
      eventDate: { date: '2026-06-10', precision: 'day', quote: 'Beta Developments said on 8 November 2026' },
      areas: [{ value: 50000, unit: 'sqm', basis: 'warehouse_gfa', quote: 'will offer 50,000 square metres of warehouse space' }],
    });
    conflictingArea.eventDate = null; // publication date is used
    const issues = new FakeIssues();
    const report = await run(root, { web, issues, extractor: new FakeExtractor({ [GN]: [singleSecondary], [JZ]: [notInText], [DS]: [conflictingArea] }) });

    expect(report.published).toHaveLength(0);
    expect(await readBytes(root, 'register.json')).toBe(registerBefore);
    const pending = await readJson<PendingReviewFile>(root, 'pending-review.json');
    expect(pending.items).toHaveLength(3);
    const by = (url: string) => pending.items.find((i) => i.evidence[0]!.url === url)!;
    expect(by(GN).reasonHeld).toMatch(/single secondary source/);
    expect(by(GN).kind).toBe('new_project');
    expect(by(JZ).reasonHeld).toMatch(/quote not found in the page text/);
    expect(by(JZ).reasonHeld).toMatch(/identity ambiguous/); // two near-identical Acme projects
    expect(by(DS).kind).toBe('conflict');
    expect(by(DS).projectId).toBe('beta-developments-dubai-south-dc');
    expect(by(DS).reasonHeld).toMatch(/50000 m² .* conflicts with the register \(30000 m²\)/);
    for (const item of pending.items) {
      expect(item.state).toBe('open');
      expect(item.issueUrl).toMatch(/^https:\/\/github\.example\.com\//);
    }
    expect(issues.created.map((c) => c.key).sort()).toEqual(pending.items.map((i) => i.id).sort());
    expect(issues.created[0]!.title).toMatch(/^\[pending-review\] rev-/);
    const log = await readJson<ChangelogFile>(root, 'changelog.json');
    expect(log.changes).toHaveLength(0);
  });
});

describe('f. all sources failing', () => {
  it('leaves register and changelog byte-identical, marks the run failed and lists the failed sources', async () => {
    const root = await makeDataDir([acmeProject(), betaProject()]);
    const reg = await readBytes(root, 'register.json');
    const log = await readBytes(root, 'changelog.json');
    const pend = await readBytes(root, 'pending-review.json');
    const srcs = await readBytes(root, 'sources.json');
    const web = quietWeb();
    web.pages.clear();
    web.defaultPage = { status: 503, body: 'Service Unavailable' };
    web.set('https://www.jafza.ae/robots.txt', { status: 404 });
    web.set('https://www.jafza.ae/news/', { status: 0, throws: 'ETIMEDOUT' });
    const report = await run(root, { web });

    expect(report.status).toBe('failed');
    expect(await readBytes(root, 'register.json')).toBe(reg);
    expect(await readBytes(root, 'changelog.json')).toBe(log);
    expect(await readBytes(root, 'pending-review.json')).toBe(pend);
    expect(await readBytes(root, 'sources.json')).toBe(srcs);
    // No URL is remembered as processed, so the next run looks at everything again.
    const state = await readJson<{ processed: Record<string, unknown>; runs: { status: string }[] }>(root, 'pipeline-state.json');
    expect(state.processed).toEqual({});
    expect(state.runs.at(-1)!.status).toBe('failed');
    const meta = await readJson<MetaFile>(root, 'meta.json');
    expect(meta.lastRunStatus).toBe('failed');
    expect(meta.lastSuccessfulRun).toBeUndefined();
    expect(meta.lastAttemptedRun).toBe('2026-11-11T06:00:00Z');
    expect(meta.sourceScans.every((s) => s.status === 'failed')).toBe(true);
    expect(report.failedSources.map((s) => s.id).sort()).toEqual(['dubai-media-office', 'dubai-south', 'gulf-news', 'jafza', 'pcfc', 'saif-zone']);
    expect(report.summary).toMatch(/6 of 6 source\(s\) could NOT be scanned/);
    expect(report.summary).not.toMatch(/No new in-scope announcements/);
  });

  it('does not advance lastSuccessfulRun past an earlier success', async () => {
    const root = await makeDataDir([acmeProject()]);
    await run(root, { web: quietWeb() });
    const first = await readJson<MetaFile>(root, 'meta.json');
    expect(first.lastSuccessfulRun).toBe('2026-11-11T06:00:00Z');
    const web = quietWeb();
    web.pages.clear();
    web.defaultPage = { status: 503 };
    // A later failing run (clock is the same in tests; check that the field is untouched).
    const meta = { ...first, lastSuccessfulRun: '2026-11-10T06:00:00Z' };
    const { writeFile } = await import('node:fs/promises');
    const { serializeDataFile } = await import('../../shared/index.ts');
    await writeFile(`${root}/data/meta.json`, serializeDataFile(meta));
    await run(root, { web });
    expect((await readJson<MetaFile>(root, 'meta.json')).lastSuccessfulRun).toBe('2026-11-10T06:00:00Z');
  });
});

describe('g. area bases and forecast dates', () => {
  const doc = (text: string, publishedDate = '2026-11-08'): DocumentRecord => ({
    url: 'https://www.jafza.ae/news/x/', title: 'x', text, publishedDate, verification: 'direct', sourceId: 'jafza', sourceName: 'Jafza', publisher: 'Jafza', tier: 'primary', foundVia: 'test',
  });
  const ctx = { knownUrls: new Set(['https://jafza.ae/news/x']), today: '2026-11-11' };

  it('never puts land, yard or district area into a warehouse-floor basis', () => {
    expect(checkAreaBasis('warehouse_gfa', 'sqm', 'built on a 50,000 square metre plot').basis).toBe('site_land_area');
    expect(checkAreaBasis('warehouse_gfa', 'hectare', 'a 12 hectare warehouse campus').basis).toBe('site_land_area');
    expect(checkAreaBasis('gla', 'sqm', '30,000 sq m open yard for containers').basis).toBe('open_yard');
    expect(checkAreaBasis('warehouse_gfa', 'sqft', 'the 6.7 million sq ft district').basis).toBe('district_area');
    expect(checkAreaBasis('warehouse_gfa', 'sqm', '20,000 square metres of warehouse space').basis).toBe('warehouse_gfa');

    const text = 'Dubai, 8 November 2026: Omega Logistics will develop a facility spread over a 100,000 sq m plot in Jafza, Dubai.';
    const f = fact({
      projectName: 'Omega', operator: 'Omega Logistics', partiesQuote: 'Omega Logistics will develop', emirate: 'Dubai', emirateQuote: 'Jafza, Dubai', zone: 'Jafza',
      eventType: 'announcement', eventQuote: 'Omega Logistics will develop a facility',
      areas: [{ value: 100000, unit: 'sqm', basis: 'warehouse_gfa', quote: 'spread over a 100,000 sq m plot' }],
    });
    const g = groundFact(f, doc(text), ctx);
    expect(g.ok).toBe(true);
    expect(g.grounded.areas[0]!.basis).toBe('site_land_area');
  });

  it('never turns a forecast date into actualCompletion', () => {
    const text = 'Dubai, 8 November 2026: Omega Logistics reached a construction milestone at its Jafza warehouse, which is expected to be completed in December 2026.';
    const f = fact({
      projectName: 'Omega', operator: 'Omega Logistics', partiesQuote: 'Omega Logistics reached', emirate: 'Dubai', emirateQuote: 'Dubai, 8 November 2026', zone: 'Jafza',
      eventType: 'construction_milestone', eventQuote: 'Omega Logistics reached a construction milestone at its Jafza warehouse',
      actualCompletion: { date: '2026-12-01', precision: 'month', quote: 'expected to be completed in December 2026' },
    });
    const g = groundFact(f, doc(text), ctx);
    expect(g.grounded.actualCompletion).toBeUndefined();
    expect(g.grounded.forecastCompletion).toEqual({ date: '2026-12-01', precision: 'month', quote: 'expected to be completed in December 2026' });

    // An "opening" described as planned is not publishable.
    const planned = fact({ ...f, eventType: 'opened', eventQuote: 'expected to be completed in December 2026', actualCompletion: null });
    const g2 = groundFact(planned, doc(text), ctx);
    expect(g2.ok).toBe(false);
    expect(g2.failures.join(' ')).toMatch(/planned\/expected/);
  });

  it('end to end: a land-area claim is stored as land and does not enter warehouse totals', async () => {
    const root = await makeDataDir([acmeProject()]);
    const URL = 'https://www.jafza.ae/news/omega-plot/';
    const text = ['Dubai, 8 November 2026: Omega Logistics signed an agreement to develop a logistics facility spread over a 100,000 sq m plot in Jafza, Dubai.'];
    const web = quietWeb();
    web.set('https://www.jafza.ae/news/', { status: 200, body: listing([{ url: URL, title: 'Omega plot' }]) });
    web.set(URL, { status: 200, body: article({ title: 'Omega signs agreement in Jafza', date: '2026-11-08', paragraphs: text }) });
    const f = fact({
      projectName: 'Omega Logistics Jafza Facility', operator: 'Omega Logistics', partiesQuote: 'Omega Logistics signed an agreement',
      zone: 'Jafza', location: 'Jafza', locationQuote: 'in Jafza, Dubai', emirate: 'Dubai', emirateQuote: 'in Jafza, Dubai', assetType: 'logistics_park',
      eventType: 'agreement_signed', eventQuote: 'Omega Logistics signed an agreement to develop a logistics facility',
      eventDate: { date: '2026-11-08', precision: 'day', quote: 'Dubai, 8 November 2026' },
      areas: [{ value: 100000, unit: 'sqm', basis: 'warehouse_gfa', quote: 'spread over a 100,000 sq m plot' }],
    });
    const report = await run(root, { web, extractor: new FakeExtractor({ [URL]: [f] }) });
    expect(report.published).toEqual([expect.objectContaining({ kind: 'new_project' })]);
    const reg = await readJson<RegisterFile>(root, 'register.json');
    const omega = reg.projects.find((p) => p.name === 'Omega Logistics Jafza Facility')!;
    expect(omega.areas).toEqual([expect.objectContaining({ basis: 'site_land_area', valueM2: 100000 })]);
    expect(omega.primaryAreaIndex).toBeUndefined();
    expect(omega.actualCompletion).toBeUndefined();
    const m = computeMetrics(reg.projects, 2026);
    expect(m.committedNotStarted.areas.warehouse_gfa.totalM2).toBe(0);
    expect(m.committedNotStarted.areas.site_land_area.totalM2).toBe(100000);
  });
});

describe('h. non-Dubai announcements', () => {
  it('stores a Sharjah project as regional context, never in Dubai totals; holds one with no emirate', async () => {
    const root = await makeDataDir([acmeProject()]);
    const URL = 'https://www.saif-zone.example/news/acme-opens-saif-warehouse';
    const URL2 = 'https://www.saif-zone.example/news/unnamed-place';
    const web = quietWeb();
    web.set('https://www.saif-zone.example/news', { status: 200, body: listing([{ url: URL, title: 'Acme opens SAIF warehouse' }, { url: URL2, title: 'Another warehouse' }]) });
    web.set(URL, {
      status: 200,
      body: article({ title: 'Acme opens SAIF Zone warehouse', date: '2026-11-07', paragraphs: ['Sharjah, 7 November 2026: Acme Logistics opened a 12,000 square metre warehouse in SAIF Zone, Sharjah.'] }),
    });
    web.set(URL2, {
      status: 200,
      body: article({ title: 'Another warehouse', date: '2026-11-07', paragraphs: ['Zeta Storage opened a 5,000 square metre warehouse on 7 November 2026, the company said.'] }),
    });
    const sharjah = fact({
      projectName: 'Acme Logistics SAIF Zone Warehouse', operator: 'Acme Logistics', partiesQuote: 'Acme Logistics opened',
      zone: 'SAIF Zone', location: 'SAIF Zone', locationQuote: 'in SAIF Zone, Sharjah', emirate: 'Sharjah', emirateQuote: 'in SAIF Zone, Sharjah',
      eventType: 'opened', eventQuote: 'Acme Logistics opened a 12,000 square metre warehouse in SAIF Zone',
      eventDate: { date: '2026-11-07', precision: 'day', quote: 'Sharjah, 7 November 2026' },
      areas: [{ value: 12000, unit: 'sqm', basis: 'warehouse_gfa', quote: 'a 12,000 square metre warehouse' }],
    });
    const noEmirate = fact({
      projectName: 'Zeta Storage Warehouse', operator: 'Zeta Storage', partiesQuote: 'Zeta Storage opened', eventType: 'opened',
      eventQuote: 'Zeta Storage opened a 5,000 square metre warehouse', eventDate: { date: '2026-11-07', precision: 'day', quote: 'on 7 November 2026' },
      areas: [{ value: 5000, unit: 'sqm', basis: 'warehouse_gfa', quote: 'a 5,000 square metre warehouse' }],
    });
    const before = computeMetrics((await readJson<RegisterFile>(root, 'register.json')).projects, 2026);
    const report = await run(root, { web, extractor: new FakeExtractor({ [URL]: [sharjah], [URL2]: [noEmirate] }) });
    const reg = await readJson<RegisterFile>(root, 'register.json');
    const saif = reg.projects.find((p) => p.emirate === 'Sharjah')!;
    expect(saif).toBeDefined();
    expect(saif.status).toBe('operational');
    const m = computeMetrics(reg.projects, 2026);
    expect(m.scope.regionalProjectIds).toContain(saif.id);
    expect(m.scope.includedProjectIds).not.toContain(saif.id);
    expect(m.otherModernDelivered.areas.warehouse_gfa.totalM2).toBe(before.otherModernDelivered.areas.warehouse_gfa.totalM2);
    expect(m.regionalContext.deliveredInYear.areas.warehouse_gfa.totalM2).toBe(12000);
    expect(report.held).toEqual([expect.objectContaining({ url: URL2, reasons: expect.arrayContaining(['emirate not stated in the source']) })]);
  });
});

describe('i. cost accounting', () => {
  it('sums searches and tokens by model at list prices', () => {
    const c = new CostTracker(DEFAULT_CONFIG);
    for (let i = 0; i < 10; i++) c.addSearch('anthropic', { model: 'claude-haiku-5-5', inputTokens: 1000, outputTokens: 200, searches: 1 });
    c.addLlm([{ model: 'claude-opus-5-5', inputTokens: 5000, outputTokens: 2000 }]);
    c.addLlm([{ model: 'claude-opus-5-5', inputTokens: 5000, outputTokens: 2000 }]);
    const r = c.report();
    expect(r.webSearches).toBe(10);
    expect(r.webSearchCostUsd).toBeCloseTo(0.1, 10);
    expect(r.byModel['claude-haiku-5-5']).toMatchObject({ calls: 10, inputTokens: 10000, outputTokens: 2000, costUsd: 0.002 });
    expect(r.byModel['claude-opus-5-5']).toMatchObject({ calls: 2, inputTokens: 10000, outputTokens: 4000, costUsd: 0.12 });
    expect(r.totalUsd).toBeCloseTo(0.222, 10);
  });

  it('flags unpriced models instead of guessing, and prices cache tokens', () => {
    const c = new CostTracker(DEFAULT_CONFIG);
    c.addLlm([{ model: 'claude-opus-5-5', inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 1_000_000, cacheCreationInputTokens: 0 }]);
    c.addLlm([{ model: 'some-fallback-model', inputTokens: 100, outputTokens: 100 }]);
    const r = c.report();
    expect(r.byModel['claude-opus-5-5']!.costUsd).toBeCloseTo(0.4, 10);
    expect(r.unpricedModels).toEqual(['some-fallback-model']);
  });

  it('reports run cost from fake search and LLM usage', async () => {
    const root = await makeDataDir([acmeProject()]);
    const search = new FakeSearch(() => []);
    const web = acmeWeb();
    const report = await run(root, { web, search, extractor: new FakeExtractor({ [ACME_URL]: [acmeOpenedFact] }) });
    // One site search (pcfc fallback after two 403s); one extraction.
    expect(report.searches.used).toBe(1);
    expect(report.cost.webSearches).toBe(1);
    expect(report.cost.byModel['claude-opus-5-5']).toMatchObject({ calls: 1, inputTokens: 5000, outputTokens: 2000 });
    expect(report.cost.totalUsd).toBeCloseTo(0.01 + (1000 * 0.1 + 200 * 0.5) / 1e6 + (5000 * 4 + 2000 * 20) / 1e6, 10);
  });
});
