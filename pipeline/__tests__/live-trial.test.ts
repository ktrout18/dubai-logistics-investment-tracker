/**
 * Regressions found by the first live dry run on GitHub (run 43158953250,
 * 12 Nov 2026): stale summary totals, blocked-article searches starving the
 * search-only sources, and a results report re-read as an opening.
 */
import { describe, expect, it } from 'vitest';
import type { Project, RegisterFile } from '../../shared/index.ts';
import type { PipelineSource } from '../sources.ts';
import { reportDigest } from '../run.ts';
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
