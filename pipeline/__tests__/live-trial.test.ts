/**
 * Regressions found by the first live dry run on GitHub (run 43158953250,
 * 12 Nov 2026): stale summary totals, blocked-article searches starving the
 * search-only sources, and a results report re-read as an opening.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import type { PendingReviewFile, Project, RegisterFile } from '../../shared/index.ts';
import type { PipelineSource } from '../sources.ts';
import { reportDigest } from '../run.ts';
import { AnthropicSearchProvider } from '../search/anthropic.ts';
import { FakeExtractor, FakeSearch, acmeProject, article, betaProject, fact, listing, makeDataDir, quietWeb, readBytes, readJson, run, testSources } from './helpers.ts';

const RESULTS_URL = 'https://www.jafza.ae/news/acme-group-half-year-results/';
const RESULTS_TEXT = [
  'Dubai, 9 November 2026: Acme Group today announced its half-year results for the six months to 30 September 2026.',
  'Acme Logistics continued its strategy, commissioning its new cold store in Jebel Ali Free Zone (Jafza), Dubai.',
];

function resultsWeb() {
  const web = quietWeb();
  web.set('https://www.jafza.ae/news/', { status: 200, body: listing([{ url: RESULTS_URL, title: 'Acme Group half-year results', date: '9 November 2026' }]) });
  web.set(RESULTS_URL, { status: 200, body: article({ title: 'Acme Group half-year results', date: '2026-11-09', paragraphs: RESULTS_TEXT }) });
  return web;
}

/** The model reads "commissioning" as an opening and finds no date for it. */
const openedFromResults = fact({
  projectName: 'Acme Logistics Jafza Cold Store',
  operator: 'Acme Logistics',
  partiesQuote: 'Acme Logistics continued its strategy',
  zone: 'Jafza',
  location: 'Jebel Ali Free Zone',
  locationQuote: 'Jebel Ali Free Zone (Jafza)',
  emirate: 'Dubai',
  emirateQuote: 'Jebel Ali Free Zone (Jafza), Dubai',
  assetType: 'cold_store',
  sectors: ['food_fmcg_cold_chain'],
  eventType: 'opened',
  eventQuote: 'commissioning its new cold store in Jebel Ali Free Zone (Jafza)',
  eventDate: null,
});

/** Acme as the register would hold it after a human read the results report as "commissioned". */
function acmeCommissioned(): Project {
  const p = acmeProject();
  const src = { ...p.sources[0]!, url: RESULTS_URL, title: 'Acme Group half-year results', publishedDate: '2026-11-09' };
  return {
    ...p,
    status: 'construction_completed',
    sources: [...p.sources, src],
    events: [
      ...p.events,
      { id: '2026-01-01-commissioned', date: '2026-01-01', datePrecision: 'year', type: 'commissioned', summary: 'Commissioned (half-year results)', sourceUrl: RESULTS_URL, sourceType: 'primary', verification: 'direct' },
    ],
    actualCompletion: { date: '2026-01-01', datePrecision: 'year', sourceUrl: RESULTS_URL },
    latestMilestone: { date: '2026-01-01', datePrecision: 'year', description: 'Commissioned', sourceUrl: RESULTS_URL },
  };
}

describe('live trial: a source already cited is not re-read into a status upgrade', () => {
  it('holds an "opened" reading of a page already recorded as "commissioned"; the register is unchanged', async () => {
    const root = await makeDataDir([acmeCommissioned(), betaProject()]);
    const before = await readBytes(root, 'register.json');
    const report = await run(root, { web: resultsWeb(), extractor: new FakeExtractor({ [RESULTS_URL]: [openedFromResults] }) });

    expect(report.published).toEqual([]);
    expect(report.held).toHaveLength(1);
    const held = report.held[0]!;
    expect(held.projectId).toBe('acme-logistics-jafza-cold-store');
    expect(held.reasons.join(' | ')).toMatch(/already recorded for the project as "commissioned" \(2026-01-01-commissioned\); the extraction reads it as "opened"/);
    expect(held.reasons.join(' | ')).toMatch(/publication date \(2026-11-09\) is not used as a completion date/);
    expect(held.claim).toMatch(/^opened 2026-11-09 \(publication date\): Acme Logistics Jafza Cold Store/);
    expect(await readBytes(root, 'register.json')).toBe(before);
  });
});

describe('live trial: an opening dated only by the publication date is held', () => {
  it('does not turn the publication date into an actual completion date', async () => {
    const root = await makeDataDir([acmeProject(), betaProject()]);
    const report = await run(root, { web: resultsWeb(), extractor: new FakeExtractor({ [RESULTS_URL]: [openedFromResults] }) });

    expect(report.published).toEqual([]);
    expect(report.held).toHaveLength(1);
    expect(report.held[0]!.reasons.join(' | ')).toMatch(/date of the "opened" milestone is not stated/);
    const reg = await readJson<RegisterFile>(root, 'register.json');
    const acme = reg.projects.find((p) => p.id === 'acme-logistics-jafza-cold-store')!;
    expect(acme.status).toBe('under_construction');
    expect(acme.actualCompletion).toBeUndefined();
  });
});

describe('live trial: search budget', () => {
  const searchOnly = (id: string): PipelineSource => ({
    id, name: `${id} news`, tier: 'secondary', kind: 'company', publisher: id, domains: [`www.${id}.example`], enabled: true,
    accessMethods: [{ type: 'site_search', site: `www.${id}.example`, query: `${id} logistics` }], notes: 'test',
  });

  it('keeps searches for later search-only sources instead of spending them on blocked articles', async () => {
    const sources = [...testSources(), searchOnly('carrier-a'), searchOnly('carrier-b')];
    const root = await makeDataDir([acmeProject()], sources);
    const web = quietWeb();
    const blocked = [1, 2, 3, 4].map((n) => `https://pcfc.ae/en/pages/newsdetails.aspx?newsid=60${n}`);
    for (const u of blocked) web.set(u, { status: 403, body: 'Forbidden' });
    const search = new FakeSearch((q) =>
      q.site === 'pcfc.ae' && q.query === 'PCFC news'
        ? blocked.map((url, i) => ({ url, title: `PCFC circular ${i + 1}`, pageAge: '2026-11-08' })) // no snippets
        : [],
    );
    const report = await run(root, { web, search }, { sourceIds: ['pcfc', 'carrier-a', 'carrier-b'], maxSearches: 4 });

    const status = (id: string) => report.sources.find((s) => s.sourceId === id)?.status;
    expect(status('pcfc')).toBe('fallback_used');
    expect(status('carrier-a')).toBe('ok');
    expect(status('carrier-b')).toBe('ok');
    expect(report.failedSources).toEqual([]);
    expect(report.searches.used).toBe(4);
    // One fallback search was affordable; the rest were skipped and recorded.
    expect(report.documents.outcomes.filter((o) => o.outcome.startsWith('fallback_search_skipped'))).toHaveLength(3);
    expect(search.queries.filter((q) => q.site === 'www.carrier-a.example' || q.site === 'www.carrier-b.example')).toHaveLength(2);
  });

  it('reports the final search count and cost in the summary and the digest', async () => {
    const root = await makeDataDir([acmeProject()], [...testSources(), searchOnly('carrier-a')]);
    const report = await run(root, { web: quietWeb(), search: new FakeSearch() }, { sourceIds: ['carrier-a'], maxSearches: 5 });

    expect(report.searches.used).toBe(1);
    expect(report.cost.totalUsd).toBeGreaterThan(0);
    // The summary used to be built before the totals were copied in ("0/40", "$0.0000").
    expect(report.summary).toContain('searches used 1/5');
    expect(report.summary).toContain(`estimated cost $${report.cost.totalUsd.toFixed(4)}`);
    const digest = reportDigest(report).join('\n');
    expect(digest).toMatch(/claude-haiku-5-5: 1 call\(s\), 1000 input \/ 200 output tokens/);
    expect(digest).toContain('Searches: 1/5 via anthropic');
  });
});

// ---------------------------------------------------------------------------
// Second live dry run (run 43165141664, 12 Nov 2026)
// ---------------------------------------------------------------------------

const ROUNDUP_URL = 'https://gulfnews.com/business/warehouse-rents-rise-in-dubai-1.500950';
const ROUNDUP_TEXT = [
  'Warehouse rents in Dubai rose in the third quarter, a consultancy said.',
  'In Dubai, Delta Freight has broken ground on a new logistics centre in Dubai Industrial City, while Omega Storage is building a warehouse in Dubai Investments Park.',
];

function roundupWeb() {
  const web = quietWeb();
  web.set('https://gulfnews.com/news_sitemap.xml', { status: 200, contentType: 'text/xml', body: `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"><url><loc>${ROUNDUP_URL}</loc><news:news><news:publication_date>2026-11-10T09:00:00+04:00</news:publication_date><news:title>Warehouse rents rise in Dubai logistics market</news:title></news:news></url></urlset>` });
  web.set(ROUNDUP_URL, { status: 200, body: article({ title: 'Warehouse rents rise in Dubai logistics market', date: '2026-11-10', paragraphs: ROUNDUP_TEXT }) });
  return web;
}

const roundupFact = (name: string, party: string, zone: string, quote: string) =>
  fact({
    projectName: name, developer: party, partiesQuote: quote, zone, location: zone, locationQuote: zone, emirate: 'Dubai', emirateQuote: 'In Dubai',
    assetType: 'distribution_centre', sectors: ['modern_warehousing'], eventType: 'construction_start', eventQuote: quote, eventDate: null,
  });

describe('live trial 2: several claims from one page', () => {
  it('holds each claim separately instead of dropping all but the first as "already pending"', async () => {
    const root = await makeDataDir([acmeProject(), betaProject()]);
    const facts = [
      roundupFact('Delta Freight logistics centre', 'Delta Freight', 'Dubai Industrial City', 'Delta Freight has broken ground on a new logistics centre in Dubai Industrial City'),
      roundupFact('Omega Storage warehouse', 'Omega Storage', 'Dubai Investments Park', 'Omega Storage is building a warehouse in Dubai Investments Park'),
    ];
    const report = await run(root, { web: roundupWeb(), extractor: new FakeExtractor({ [ROUNDUP_URL]: facts }) });
    expect(report.published).toEqual([]);
    expect(report.held).toHaveLength(2);
    expect(report.skipped.filter((s) => /already pending review/.test(s.reason))).toEqual([]);
    const pending = await readJson<PendingReviewFile>(root, 'pending-review.json');
    expect(pending.items).toHaveLength(2);

    // The same page in a later run (e.g. reprocessed) does not add the same claims twice.
    const again = await run(root, { web: roundupWeb(), extractor: new FakeExtractor({ [ROUNDUP_URL]: facts }) }, { since: '2026-11-04' });
    expect(again.held).toHaveLength(0);
    expect((await readJson<PendingReviewFile>(root, 'pending-review.json')).items).toHaveLength(2);
  });

  it('a milestone with no stated date is held unless the quote says "today"', async () => {
    const root = await makeDataDir([acmeProject(), betaProject()]);
    const report = await run(root, {
      web: roundupWeb(),
      extractor: new FakeExtractor({ [ROUNDUP_URL]: [roundupFact('Delta Freight logistics centre', 'Delta Freight', 'Dubai Industrial City', 'Delta Freight has broken ground on a new logistics centre in Dubai Industrial City')] }),
    });
    expect(report.held[0]!.reasons.join(' | ')).toMatch(/"construction_start" milestone is not stated and the quote does not say "today"; the publication date \(2026-11-10\) is not used as a milestone date/);
  });
});

describe('live trial 2: a page cited by one project does not identify every facility it mentions', () => {
  it('matches a different facility on the same results report by its own name, not by the shared URL', async () => {
    const root = await makeDataDir([acmeCommissioned(), betaProject()]);
    const web = resultsWeb();
    web.set(RESULTS_URL, {
      status: 200,
      body: article({ title: 'Acme Group half-year results', date: '2026-11-09', paragraphs: [...RESULTS_TEXT, 'In May 2026, Acme Aviation broke ground on its engineering hangar at Dubai South, Dubai.'] }),
    });
    const hangar = fact({
      projectName: 'Acme Aviation engineering hangar', operator: 'Acme Aviation', partiesQuote: 'Acme Aviation broke ground', zone: 'Dubai South', location: 'Dubai South',
      locationQuote: 'engineering hangar at Dubai South', emirate: 'Dubai', emirateQuote: 'Dubai South, Dubai', assetType: 'mro_aerospace_facility', sectors: ['aerospace_air_cargo'],
      eventType: 'construction_start', eventQuote: 'Acme Aviation broke ground on its engineering hangar at Dubai South',
      eventDate: { date: '2026-05-01', precision: 'month', quote: 'In May 2026' },
    });
    const report = await run(root, { web, extractor: new FakeExtractor({ [RESULTS_URL]: [hangar] }) });
    expect(report.published.filter((p) => p.projectId === 'acme-logistics-jafza-cold-store')).toEqual([]);
    expect(report.held.filter((h) => h.projectId === 'acme-logistics-jafza-cold-store')).toEqual([]);
  });
});

describe('live trial 2: web search max_uses_exceeded', () => {
  it('keeps the first search results when the model tries a second search', async () => {
    const msg = {
      id: 'm', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', stop_reason: 'end_turn', stop_sequence: null, stop_details: null,
      usage: { input_tokens: 900, output_tokens: 80, server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 } },
      content: [
        { type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'q' } },
        { type: 'web_search_tool_result', tool_use_id: 's1', content: [{ type: 'web_search_result', url: 'https://pcfc.ae/en/news/a', title: 'Circular', page_age: 'November 8, 2026', encrypted_content: 'x' }] },
        { type: 'server_tool_use', id: 's2', name: 'web_search', input: { query: 'q2' } },
        { type: 'web_search_tool_result', tool_use_id: 's2', content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' } },
      ],
    } as unknown as Anthropic.Message;
    const p = new AnthropicSearchProvider({ model: 'claude-haiku-5-5', toolType: 'web_search_20250305', create: async () => msg });
    const r = await p.search({ query: 'PCFC news', site: 'pcfc.ae', max: 5 });
    expect(r.results.map((x) => x.url)).toEqual(['https://pcfc.ae/en/news/a']);
  });

  it('still reports other web search errors', async () => {
    const msg = {
      id: 'm', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', stop_reason: 'end_turn', stop_sequence: null, stop_details: null,
      usage: { input_tokens: 900, output_tokens: 80 },
      content: [{ type: 'web_search_tool_result', tool_use_id: 's1', content: { type: 'web_search_tool_result_error', error_code: 'unavailable' } }],
    } as unknown as Anthropic.Message;
    const p = new AnthropicSearchProvider({ model: 'claude-haiku-5-5', toolType: 'web_search_20250305', create: async () => msg });
    await expect(p.search({ query: 'q', max: 5 })).rejects.toThrow(/unavailable/);
  });
});
