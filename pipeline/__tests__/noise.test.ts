/**
 * Noise reduction after the first live run (run 43181920655, 12 Nov 2026):
 * 14 claims were held and all were rejected in review. None of these rules
 * publishes anything; they only keep claims out of the review queue, and each
 * one is counted in the run report.
 */
import { describe, expect, it } from 'vitest';
import type { PendingReviewFile, RegisterFile } from '../../shared/index.ts';
import { DEFAULT_CONFIG, loadConfig } from '../config.ts';
import type { CandidateFact } from '../extraction.ts';
import { mergeRegionalMentions, reportDigest } from '../run.ts';
import type { PipelineSource } from '../sources.ts';
import { foreignPlace, otherEmirate, pointsToDubai } from '../triage.ts';
import { FakeExtractor, FakeIssues, FakeSearch, acmeProject, article, betaProject, fact, makeDataDir, quietWeb, readBytes, readJson, run, testSources } from './helpers.ts';

/** A Gulf News sitemap listing the given articles (all published 10 Nov 2026). */
function gulfNews(articles: { url: string; title: string; text: string }[]) {
  const web = quietWeb();
  const entries = articles
    .map((a) => `<url><loc>${a.url}</loc><news:news><news:publication_date>2026-11-10T09:00:00+04:00</news:publication_date><news:title>${a.title}</news:title></news:news></url>`)
    .join('');
  web.set('https://gulfnews.com/news_sitemap.xml', {
    status: 200,
    contentType: 'text/xml',
    body: `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${entries}</urlset>`,
  });
  for (const a of articles) web.set(a.url, { status: 200, body: article({ title: a.title, date: '2026-11-10', paragraphs: [a.text] }) });
  return web;
}

const GN1 = 'https://gulfnews.com/business/logistics-results-1.500001';
const GN2 = 'https://gulfnews.com/business/warehouse-market-1.500002';

describe('claims outside the UAE and claims that are not facilities are set aside, counted, not queued', () => {
  it('skips the Western Sydney and Alat claims and a rail corridor; no pending item, no issue', async () => {
    const root = await makeDataDir([acmeProject(), betaProject()]);
    const pendingBefore = await readBytes(root, 'pending-review.json');
    const text =
      'dnata announced an AU$ 32 million investment to build a new cargo facility at Western Sydney International Airport, and a planned AED 37 million logistics investment in Alat, Azerbaijan. The AD Ports-Etihad Rail Bonded Corridor will improve regional connectivity.';
    const web = gulfNews([{ url: GN1, title: 'dnata cargo logistics results', text }]);
    const facts: CandidateFact[] = [
      fact({ projectName: 'dnata cargo facility at Western Sydney International Airport', investor: 'dnata', location: 'Western Sydney International Airport', country: 'Australia', eventType: 'announcement', eventQuote: 'dnata announced an AU$ 32 million investment' }),
      fact({ projectName: 'dnata investment in Alat', investor: 'dnata', location: 'Alat, Azerbaijan', eventType: 'announcement', eventQuote: 'a planned AED 37 million logistics investment in Alat, Azerbaijan' }),
      fact({ projectName: 'AD Ports-Etihad Rail Bonded Corridor', claimKind: 'corridor_or_route', eventType: 'other', eventQuote: 'The AD Ports-Etihad Rail Bonded Corridor will improve regional connectivity' }),
    ];
    const issues = new FakeIssues();
    const report = await run(root, { web, extractor: new FakeExtractor({ [GN1]: facts }), issues });

    expect(report.held).toEqual([]);
    expect(report.published).toEqual([]);
    expect(issues.created).toEqual([]);
    expect(await readBytes(root, 'pending-review.json')).toBe(pendingBefore);
    expect(report.triage.skipped.map((s) => [s.reason, s.projectName])).toEqual([
      ['outside_uae', 'dnata cargo facility at Western Sydney International Airport'],
      ['outside_uae', 'dnata investment in Alat'],
      ['not_a_facility', 'AD Ports-Etihad Rail Bonded Corridor'],
    ]);
    expect(report.summary).toContain('Set aside before review (counted, not queued): 2 outside the UAE, 1 not a facility, 0 already recorded');
    expect(reportDigest(report).join('\n')).toContain('set aside (outside_uae) dnata investment in Alat: located outside the UAE (Azerbaijan)');
  });

  it('never sets aside a claim that points to Dubai', () => {
    const cfg = { triage: DEFAULT_CONFIG.triage };
    const inJafza = fact({ projectName: 'India Gate logistics hub', location: 'Jebel Ali Free Zone', zone: 'Jafza', country: 'India' });
    expect(pointsToDubai(inJafza)).toBe(true);
    expect(pointsToDubai(fact({ projectName: 'Warehouse', emirate: 'Dubai', location: 'Sydney Street' }))).toBe(true);
    // Not Dubai: only then are the foreign / other-emirate checks consulted.
    expect(foreignPlace(fact({ location: 'Sohar Port, Oman' }), cfg)).toBe('Oman');
    expect(otherEmirate(fact({ location: 'Al Ain' }), cfg)).toBe('Abu Dhabi');
    expect(otherEmirate(fact({ zone: 'KEZAD' }), cfg)).toBe('Abu Dhabi');
    expect(otherEmirate(fact({ location: 'Dibba' }), cfg)).toBe('Fujairah');
  });
});

describe('claims in other emirates become regional mentions', () => {
  it('records them in the report and pipeline-state.json, de-duplicated, never in the register or the queue', async () => {
    const root = await makeDataDir([acmeProject(), betaProject()]);
    const registerBefore = await readBytes(root, 'register.json');
    const web = gulfNews([
      { url: GN1, title: 'Floward fulfilment centre in Al Ain', text: 'Floward has opened a new fulfilment centre in Al Ain. Kezad and JD.com signed an agreement for 150,000 square meters of automated warehousing.' },
      { url: GN2, title: 'Floward opens Al Ain warehouse', text: 'Floward has opened a new fulfilment centre in Al Ain, the company said.' },
    ]);
    const floward = (quote: string) => fact({ projectName: 'Floward Al Ain fulfilment centre', operator: 'Floward', location: 'Al Ain', eventType: 'opened', eventQuote: quote, emirate: 'Abu Dhabi' });
    const kezad = fact({ projectName: 'Kezad–JD.com automated warehousing', developer: 'Kezad', zone: 'KEZAD', eventType: 'agreement_signed', eventQuote: 'Kezad and JD.com signed an agreement' });
    const extractor = new FakeExtractor({ [GN1]: [floward('Floward has opened a new fulfilment centre in Al Ain'), kezad], [GN2]: [floward('Floward has opened a new fulfilment centre in Al Ain, the company said')] });
    const issues = new FakeIssues();
    const report = await run(root, { web, extractor, issues });

    expect(report.held).toEqual([]);
    expect(issues.created).toEqual([]);
    expect(await readBytes(root, 'register.json')).toBe(registerBefore);
    expect(report.triage.regional.map((r) => r.emirate)).toEqual(['Abu Dhabi', 'Abu Dhabi', 'Abu Dhabi']);
    const state = await readJson<{ regionalMentions: { name: string; emirate: string; url: string; otherUrls?: string[]; firstSeen: string }[] }>(root, 'pipeline-state.json');
    expect(state.regionalMentions).toHaveLength(2);
    const fl = state.regionalMentions.find((m) => m.name === 'Floward Al Ain fulfilment centre')!;
    expect([fl.url, ...(fl.otherUrls ?? [])].sort()).toEqual([GN1, GN2].sort());
    expect(fl.firstSeen).toBe('2026-11-11');
  });

  it('merges a mention seen again in a later run and keeps the list bounded', () => {
    const first = mergeRegionalMentions([], [{ name: 'KLP7', emirate: 'Abu Dhabi', claim: 'announcement: KLP7', url: 'https://a.example/1' }], '2026-11-11', 3);
    const again = mergeRegionalMentions(first, [{ name: 'klp7', emirate: 'Abu Dhabi', claim: 'announcement: KLP7', url: 'https://b.example/2' }], '2026-11-12', 3);
    expect(again).toEqual([{ name: 'KLP7', emirate: 'Abu Dhabi', claim: 'announcement: KLP7', url: 'https://a.example/1', otherUrls: ['https://b.example/2'], firstSeen: '2026-11-11', lastSeen: '2026-11-12' }]);
    const many = mergeRegionalMentions(again, ['a', 'b', 'c'].map((n) => ({ name: n, emirate: 'Sharjah', claim: n, url: `https://c.example/${n}` })), '2026-11-13', 3);
    expect(many.map((m) => m.name)).toEqual(['a', 'b', 'c']);
  });
});

describe('the same story from two outlets is one held item', () => {
  it('merges the second page into the first item as extra evidence; one issue', async () => {
    const root = await makeDataDir([acmeProject(), betaProject()]);
    const web = gulfNews([
      { url: GN1, title: 'Delta Freight warehouse in Dubai Industrial City', text: 'Delta Freight signed an agreement on 9 November 2026 to build a warehouse in Dubai Industrial City, Dubai.' },
      { url: GN2, title: 'Delta Freight to build Dubai warehouse', text: 'Delta Freight on 9 November 2026 signed an agreement for a warehouse in Dubai Industrial City, Dubai.' },
    ]);
    const claim = (q: string, name: string) =>
      fact({
        projectName: name, developer: 'Delta Freight', partiesQuote: 'Delta Freight', zone: 'Dubai Industrial City', location: 'Dubai Industrial City', locationQuote: 'in Dubai Industrial City',
        emirate: 'Dubai', emirateQuote: 'Dubai Industrial City, Dubai', eventType: 'agreement_signed', eventQuote: q, eventDate: { date: '2026-11-09', precision: 'day', quote: '9 November 2026' },
      });
    const extractor = new FakeExtractor({
      [GN1]: [claim('Delta Freight signed an agreement on 9 November 2026 to build a warehouse', 'Delta Freight warehouse, Dubai Industrial City')],
      [GN2]: [claim('Delta Freight on 9 November 2026 signed an agreement for a warehouse', 'Delta Freight Dubai Industrial City warehouse')],
    });
    const issues = new FakeIssues();
    const report = await run(root, { web, extractor, issues });

    // Two pages of the same outlet are not two independent sources: still held, but once.
    expect(report.published).toEqual([]);
    expect(report.held).toHaveLength(1);
    expect(report.held[0]!.alsoReportedBy).toHaveLength(1);
    expect(report.triage.mergedHolds).toHaveLength(1);
    const pending = await readJson<PendingReviewFile>(root, 'pending-review.json');
    expect(pending.items).toHaveLength(1);
    expect(pending.items[0]!.evidence.map((e) => e.url).sort()).toEqual([GN1, GN2].sort());
    expect(issues.created).toHaveLength(1);
  });
});

describe('a restatement of a milestone the register already has is set aside', () => {
  const ROUNDUP = 'In Dubai, Acme Logistics has broken ground on its cold store in Jebel Ali Free Zone (Jafza), a consultancy said.';
  const restated = fact({
    projectName: 'Acme Logistics Jafza Cold Store', operator: 'Acme Logistics', partiesQuote: 'Acme Logistics has broken ground', zone: 'Jafza', location: 'Jebel Ali Free Zone',
    locationQuote: 'Jebel Ali Free Zone (Jafza)', emirate: 'Dubai', emirateQuote: 'In Dubai', assetType: 'cold_store', eventType: 'construction_start',
    eventQuote: 'Acme Logistics has broken ground on its cold store in Jebel Ali Free Zone (Jafza)', eventDate: null,
  });

  it('when the claim has no stated date, area or investment', async () => {
    const root = await makeDataDir([acmeProject(), betaProject()]);
    const report = await run(root, { web: gulfNews([{ url: GN1, title: 'Warehouse market in Dubai', text: ROUNDUP }]), extractor: new FakeExtractor({ [GN1]: [restated] }) });
    expect(report.held).toEqual([]);
    expect(report.triage.skipped).toEqual([
      expect.objectContaining({ reason: 'restates_recorded_milestone', detail: 'already recorded as acme-logistics-jafza-cold-store event 2025-09-01-construction-start' }),
    ]);
  });

  it('but not when the claim states a date (it goes through the normal rules)', async () => {
    const root = await makeDataDir([acmeProject(), betaProject()]);
    const text = `${ROUNDUP} The groundbreaking took place on 1 September 2025.`;
    const dated = { ...restated, eventDate: { date: '2025-09-01', precision: 'day' as const, quote: '1 September 2025' } };
    const report = await run(root, { web: gulfNews([{ url: GN1, title: 'Warehouse market in Dubai', text }]), extractor: new FakeExtractor({ [GN1]: [dated] }) });
    expect(report.triage.skipped).toEqual([]);
    const reg = await readJson<RegisterFile>(root, 'register.json');
    expect(reg.projects.find((p) => p.id === 'acme-logistics-jafza-cold-store')!.events).toHaveLength(2);
  });
});

describe('search-only sources are off by default', () => {
  const carrier: PipelineSource = {
    id: 'carrier', name: 'Carrier news', tier: 'secondary', kind: 'company', publisher: 'Carrier', domains: ['www.carrier.example'], enabled: true,
    accessMethods: [{ type: 'site_search', site: 'www.carrier.example', query: 'carrier logistics' }], notes: 'test',
  };

  it('skips them without a search and without counting them as failed; site search still rescues a blocked primary source', async () => {
    const root = await makeDataDir([acmeProject()], [...testSources(), carrier]);
    const search = new FakeSearch();
    const report = await run(root, { web: quietWeb(), search }, { sourceIds: ['pcfc', 'carrier'] });
    expect(report.sources.find((s) => s.sourceId === 'carrier')).toMatchObject({ status: 'skipped' });
    expect(report.failedSources).toEqual([]);
    expect(search.queries.map((q) => q.site)).toEqual(['pcfc.ae']);
    expect(report.sources.find((s) => s.sourceId === 'pcfc')).toMatchObject({ status: 'fallback_used', method: 'site_search' });
  });

  it('can be switched back on', async () => {
    const root = await makeDataDir([acmeProject()], [...testSources(), carrier]);
    const search = new FakeSearch();
    const report = await run(root, { web: quietWeb(), search, config: { searchOnlySources: true } }, { sourceIds: ['carrier'] });
    expect(report.sources.find((s) => s.sourceId === 'carrier')).toMatchObject({ status: 'ok', method: 'site_search' });
    expect(loadConfig({ PIPELINE_SEARCH_ONLY_SOURCES: 'on' }).searchOnlySources).toBe(true);
    expect(loadConfig({}).searchOnlySources).toBe(false);
    expect(() => loadConfig({ PIPELINE_SEARCH_ONLY_SOURCES: 'yes' })).toThrow(/on or off/);
  });
});
