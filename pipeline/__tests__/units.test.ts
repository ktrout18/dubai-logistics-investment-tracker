/** Unit tests for the pipeline's building blocks (offline). */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { validateRegister, type PendingReviewFile, type RegisterFile } from '../../shared/index.ts';
import { REPO_ROOT } from '../../scripts/data-files.ts';
import { loadConfig } from '../config.ts';
import { findDates, parseLooseDate } from '../dates.ts';
import { extractionJsonSchema } from '../extraction.ts';
import { ConfigError, buildProductionDeps } from '../factory.ts';
import { quoteHasDate, quoteHasNumber, quoteInText } from '../grounding.ts';
import { dateFromUrl, extractLinks, extractPage, parseFeed, parseSitemap } from '../html.ts';
import { PoliteFetcher } from '../http.ts';
import { GitHubIssueTracker } from '../issues.ts';
import { AnthropicExtractor } from '../llm/anthropic-extractor.ts';
import { checkLinks } from '../links.ts';
import { proposedToPatch } from '../patch.ts';
import { resolveReview } from '../review.ts';
import { isAllowed, parseRobots } from '../robots.ts';
import { AnthropicSearchProvider } from '../search/anthropic.ts';
import { parseSources } from '../sources.ts';
import { readSnapshot, writeAtomically, type WriteFs } from '../store.ts';
import { silentLogger } from '../types.ts';
import { FakeClock, FakeExtractor, FakeWeb, acmeProject, article, betaProject, fact, makeDataDir, quietWeb, readBytes, readJson, run } from './helpers.ts';

describe('robots.txt', () => {
  const rules = parseRobots(['User-agent: *', 'Disallow: /search', 'Disallow: /*.pdf$', 'Allow: /search/public', '', 'User-agent: BadBot', 'Disallow: /'].join('\n'));
  it('applies longest match, Allow on ties, wildcards and $', () => {
    const ua = 'DubaiLogisticsTracker/0.1 (test)';
    expect(isAllowed(rules, ua, '/news/x')).toBe(true);
    expect(isAllowed(rules, ua, '/search?q=1')).toBe(false);
    expect(isAllowed(rules, ua, '/search/public/a')).toBe(true);
    expect(isAllowed(rules, ua, '/files/a.pdf')).toBe(false);
    expect(isAllowed(rules, ua, '/files/a.pdf?x')).toBe(true);
    expect(isAllowed(rules, 'BadBot/1.0', '/news')).toBe(false);
  });
});

describe('polite fetcher', () => {
  const make = (web: FakeWeb) => {
    const clock = new FakeClock();
    return { clock, f: new PoliteFetcher({ userAgent: 'DubaiLogisticsTracker/0.1', timeoutMs: 1000, minIntervalMs: 3000, maxBodyBytes: 100_000, fetchImpl: web.impl, clock, logger: silentLogger }) };
  };
  it('obeys robots.txt and never fetches disallowed pages', async () => {
    const web = new FakeWeb().set('https://a.example/robots.txt', { status: 200, body: 'User-agent: *\nDisallow: /private' });
    const { f } = make(web);
    const r = await f.get('https://a.example/private/x');
    expect(r.outcome).toBe('robots_disallowed');
    expect(web.requests).toEqual(['GET https://a.example/robots.txt']);
  });
  it('treats an unreachable robots.txt as disallow-all for the run', async () => {
    const web = new FakeWeb().set('https://b.example/robots.txt', { status: 0, throws: 'ECONNRESET' });
    const { f } = make(web);
    expect((await f.get('https://b.example/news')).note).toMatch(/robots.txt unreachable/);
  });
  it('classifies 403/429/404/DNS and challenge pages without retrying', async () => {
    const web = new FakeWeb()
      .set('https://c.example/403', { status: 403 })
      .set('https://c.example/429', { status: 429 })
      .set('https://c.example/gone', { status: 410 })
      .set('https://c.example/challenge', { status: 200, body: '<html><title>One moment, please...</title>Please wait while your request is being verified...</html>' })
      .set('https://dns.example/x', { status: 0, throws: 'ENOTFOUND' });
    const { f } = make(web);
    expect((await f.get('https://c.example/403')).outcome).toBe('blocked');
    expect((await f.get('https://c.example/429')).outcome).toBe('blocked');
    expect((await f.get('https://c.example/gone')).outcome).toBe('dead');
    expect((await f.get('https://c.example/challenge')).outcome).toBe('blocked');
    expect((await f.get('https://dns.example/x')).outcome).toBe('dead');
    expect(web.requests.filter((r) => r.includes('/403'))).toHaveLength(1);
  });
  it('waits the minimum interval between requests to the same host', async () => {
    const web = new FakeWeb().set('https://d.example/1', { status: 200, body: 'x' }).set('https://d.example/2', { status: 200, body: 'y' });
    const { f, clock } = make(web);
    const t0 = clock.now().getTime();
    await f.get('https://d.example/1');
    await f.get('https://d.example/2');
    expect(clock.now().getTime() - t0).toBeGreaterThanOrEqual(6000); // robots, page 1, page 2
  });
});

describe('dates and quotes', () => {
  it('finds dates at the stated precision', () => {
    const d = findDates('Opened on 9 November 2026; phase 2 expected in Q3 2027, and by end of 2028. Signed October 30, 2026. Due in December 2026.');
    expect(d).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ date: '2026-11-09', precision: 'day' }),
        expect.objectContaining({ date: '2027-07-01', precision: 'quarter' }),
        expect.objectContaining({ date: '2028-01-01', precision: 'year' }),
        expect.objectContaining({ date: '2026-10-30', precision: 'day' }),
        expect.objectContaining({ date: '2026-12-01', precision: 'month' }),
      ]),
    );
    expect(d.find((x) => x.precision === 'month' && x.date === '2026-11-01')).toBeUndefined();
    expect(parseLooseDate('Mon, 16 Feb 2026 11:04:33 +0000')).toBe('2026-02-16');
    expect(parseLooseDate('2026-11-03T06:35:37.108Z')).toBe('2026-11-03');
    expect(dateFromUrl('https://mediaoffice.ae/en/news/2026/novemebr/05-11/x')).toBe('2026-11-05');
  });
  it('matches quotes, numbers and dates strictly', () => {
    expect(quoteInText('opened its “new” hub', 'Acme   opened its "new" hub today')).toBe(true);
    expect(quoteInText('opened its hub … in Jafza', 'Acme opened its hub, a cold store, in Jafza')).toBe(true);
    expect(quoteInText('closed its hub', 'Acme opened its hub')).toBe(false);
    expect(quoteHasNumber('an AED 150 million facility', 150_000_000)).toBe(true);
    expect(quoteHasNumber('215,000 sq. ft.', 215000)).toBe(true);
    expect(quoteHasNumber('215,000 sq. ft.', 21500)).toBe(false);
    expect(quoteHasDate('on 9 November 2026', '2026-11-09', 'day')).toBe(true);
    expect(quoteHasDate('in November 2026', '2026-11-09', 'day')).toBe(false);
    expect(quoteHasDate('in Q4 2026', '2026-10-01', 'quarter')).toBe(true);
  });
});

describe('HTML, feeds, sitemaps', () => {
  it('extracts readable text (keeping ASP.NET forms), metadata date and JS-only detection', () => {
    const p = extractPage(article({ title: 'T', date: '2026-11-08', paragraphs: ['Hello world'] }).replace('<article>', '<form><article>').replace('</article>', '</article></form>'));
    expect(p.publishedDate).toBe('2026-11-08');
    expect(p.text).toMatch(/Hello world/);
    expect(p.text).not.toMatch(/Home \| News/);
    const js = extractPage(`<html><body><div id="__next"></div><script>${'x'.repeat(6000)}</script>__NEXT_DATA__</body></html>`);
    expect(js.likelyJsOnly).toBe(true);
  });
  it('takes listing dates from the entry itself, never from a neighbour', () => {
    const html = `<ul><li><a href="/n/a"><div>30 Oct 2026</div><div>Story A</div></a></li><li><a href="/n/b">Story B</a></li></ul>`;
    const links = extractLinks(html, 'https://x.example/news');
    expect(links.map((l) => l.url)).toEqual(['https://x.example/n/a', 'https://x.example/n/b']);
    expect(links[0]!.listedDate).toBe('2026-10-30');
    expect(links[1]!.listedDate).toBeUndefined();
  });
  it('parses RSS and news sitemaps', () => {
    expect(parseFeed('<rss><channel><item><title>A</title><link>https://x.example/a</link><pubDate>Mon, 03 Nov 2025 09:07:55 +0000</pubDate></item></channel></rss>')).toEqual([
      { url: 'https://x.example/a', title: 'A', publishedDate: '2025-11-03' },
    ]);
    const sm = parseSitemap('<urlset xmlns:news="n"><url><loc>https://x.example/b</loc><news:news><news:publication_date>2026-11-11T16:55:21+04:00</news:publication_date><news:title>B</news:title></news:news></url></urlset>');
    expect(sm).toEqual({ kind: 'urlset', entries: [{ url: 'https://x.example/b', newsDate: '2026-11-11', newsTitle: 'B' }] });
    expect(parseSitemap('<sitemapindex><sitemap><loc>https://x.example/s1.xml</loc></sitemap></sitemapindex>').kind).toBe('index');
  });
});

describe('Anthropic adapters (fake transport)', () => {
  it('search returns only tool results (URL, title, cited text), never model prose', async () => {
    const msg = {
      id: 'm', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', stop_reason: 'end_turn', stop_sequence: null, stop_details: null,
      usage: { input_tokens: 1200, output_tokens: 150, server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 } },
      content: [
        { type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'q' } },
        { type: 'web_search_tool_result', tool_use_id: 's1', content: [{ type: 'web_search_result', url: 'https://www.wam.ae/en/article/abc', title: 'Hub opens', page_age: 'November 8, 2026', encrypted_content: 'x' }] },
        { type: 'text', text: 'The hub opened with 1 million sq ft (MODEL PROSE).', citations: [{ type: 'web_search_result_location', url: 'https://www.wam.ae/en/article/abc', title: 'Hub opens', cited_text: 'The hub opened on Saturday.', encrypted_index: 'i' }] },
      ],
    } as unknown as Anthropic.Message;
    const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
    const p = new AnthropicSearchProvider({ model: 'claude-haiku-5-5', toolType: 'web_search_20250305', create: async (params) => (calls.push(params), msg) });
    const r = await p.search({ query: 'Dubai warehouse', site: 'www.wam.ae', after: '2026-11-01', max: 5 });
    expect(r.results).toEqual([{ url: 'https://www.wam.ae/en/article/abc', title: 'Hub opens', pageAge: 'November 8, 2026', snippet: 'The hub opened on Saturday.' }]);
    expect(JSON.stringify(r)).not.toMatch(/MODEL PROSE/);
    expect(r.usage).toEqual({ model: 'claude-haiku-5-5', inputTokens: 1200, outputTokens: 150, searches: 1 });
    expect(calls[0]!.model).toBe('claude-haiku-5-5');
    expect(calls[0]!.tools).toEqual([{ type: 'web_search_20250305', name: 'web_search', max_uses: 1, allowed_domains: ['www.wam.ae'] }]);
    expect(calls[0]).not.toHaveProperty('tool_choice');
  });

  it('extractor sends structured-output + fallback request, handles refusal and per-model usage', async () => {
    const seen: Record<string, unknown>[] = [];
    const base = { id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_sequence: null, container: null, context_management: null };
    const refusal = { ...base, stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber', explanation: null }, content: [], usage: { input_tokens: 10, output_tokens: 0, iterations: null } };
    const okMsg = {
      ...base, stop_reason: 'end_turn', stop_details: null, content: [{ type: 'text', text: '{"facts":[]}', citations: null }],
      usage: { input_tokens: 0, output_tokens: 0, iterations: [{ type: 'message', model: 'claude-opus-5-5', input_tokens: 4000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, { type: 'fallback_message', model: 'claude-opus-4-8', input_tokens: 4000, output_tokens: 900, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }] },
    };
    let n = 0;
    const ex = new AnthropicExtractor({
      model: 'claude-opus-5-5', effort: 'high',
      call: async (params) => {
        seen.push(params as unknown as Record<string, unknown>);
        return (n++ === 0 ? refusal : okMsg) as unknown as Anthropic.Beta.BetaMessage;
      },
    });
    const r1 = await ex.extract({ system: 's', user: 'u', jsonSchema: extractionJsonSchema() });
    expect(r1).toMatchObject({ ok: false, reason: expect.stringMatching(/refusal, category cyber/) });
    const r2 = await ex.extract({ system: 's', user: 'u', jsonSchema: extractionJsonSchema() });
    expect(r2).toMatchObject({ ok: true, json: { facts: [] } });
    expect(r2.usage).toEqual([
      expect.objectContaining({ model: 'claude-opus-5-5', inputTokens: 4000, outputTokens: 500 }),
      expect.objectContaining({ model: 'claude-opus-4-8', inputTokens: 4000, outputTokens: 900 }),
    ]);
    expect(seen[0]).toMatchObject({
      model: 'claude-opus-5-5', betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', thinking: { type: 'adaptive' },
      output_config: { effort: 'high', format: { type: 'json_schema' } },
    });
    expect(seen[0]).not.toHaveProperty('tool_choice');
    expect(seen[0]).not.toHaveProperty('temperature');
  });
});

describe('configuration and secrets', () => {
  it('fixes the models in one place and allows env overrides', () => {
    const c = loadConfig({});
    expect(c.models).toEqual({ search: 'claude-haiku-5-5', extract: 'claude-opus-5-5' });
    expect(c.prices['claude-haiku-5-5']).toEqual({ inputPerMTok: 0.1, outputPerMTok: 0.5 });
    expect(c.prices['claude-opus-5-5']).toEqual({ inputPerMTok: 4, outputPerMTok: 20 });
    expect(c.webSearchPricePerSearch).toBe(0.01);
    expect(loadConfig({ PIPELINE_EXTRACT_MODEL: 'x', PIPELINE_MAX_SEARCHES: '3' })).toMatchObject({ models: { extract: 'x' }, maxSearchesPerRun: 3 });
  });
  it('refuses a live run without ANTHROPIC_API_KEY', () => {
    expect(() => buildProductionDeps(loadConfig({}), {}, { dryRun: false, issues: true })).toThrow(ConfigError);
    expect(() => buildProductionDeps(loadConfig({}), {}, { dryRun: true, issues: true })).toThrow(/--search none/);
    const d = buildProductionDeps(loadConfig({ PIPELINE_SEARCH_PROVIDER: 'none' }), {}, { dryRun: true, issues: true });
    expect(d.search.available).toBe(false);
    expect(d.issues.enabled).toBe(false);
  });
  it('zero-spend mode never builds an Anthropic client, even when a key is present', () => {
    const env = { ANTHROPIC_API_KEY: 'test-key-not-real' };
    const d = buildProductionDeps(loadConfig({ PIPELINE_SEARCH_PROVIDER: 'none' }), env, { dryRun: true, issues: false, extract: false });
    expect(d.search.name).toBe('none');
    expect(d.extractor.name).toBe('none');
    // A live (non-dry) run with extraction off and no search needs no key at all.
    expect(buildProductionDeps(loadConfig({ PIPELINE_SEARCH_PROVIDER: 'none' }), {}, { dryRun: false, issues: false, extract: false }).extractor.name).toBe('none');
    // Default (extract on) with a key does build the real extractor.
    expect(buildProductionDeps(loadConfig({ PIPELINE_SEARCH_PROVIDER: 'none' }), env, { dryRun: true, issues: false }).extractor.name).not.toBe('none');
  });
  it('documents skipped by --no-extract are not marked processed (a later paid run still sees them)', async () => {
    const { NoKeyExtractor, EXTRACTION_DISABLED_REASON } = await import('../factory.ts');
    const root = await makeDataDir([acmeProject()]);
    const URL = 'https://www.jafza.ae/news/acme-opens-cold-store/';
    const web = quietWeb();
    web.set('https://www.jafza.ae/news/', { status: 200, body: `<a href="${URL}">Acme opens cold store</a> 9 November 2026 <p>Latest logistics and warehouse news from the free zone for partners and readers.</p>` });
    web.set(URL, { status: 200, body: article({ title: 'Acme Logistics opens warehouse in Jafza', date: '2026-11-09', paragraphs: ['Acme Logistics opened a 20,000 square metre logistics warehouse in Jafza, Dubai, on 9 November 2026.'] }) });
    const report = await run(root, { web, extractor: new NoKeyExtractor(EXTRACTION_DISABLED_REASON) });
    expect(report.documents.outcomes.find((o) => o.url === URL)?.outcome).toMatch(/extraction disabled/);
    expect(report.cost.totalUsd).toBe(0);
    // The summary must not claim there was nothing new when documents were not analysed.
    expect(report.summary).toMatch(/1 relevant document\(s\) were NOT analysed \(extraction disabled/);
    expect(report.summary).not.toMatch(/No new in-scope announcements/);
    const state = JSON.parse(await readFile(join(root, 'data/pipeline-state.json'), 'utf8')) as { processed: Record<string, unknown> };
    expect(Object.keys(state.processed).some((k) => k.includes('acme-opens-cold-store'))).toBe(false);
  });
});

describe('dry run and atomic writes', () => {
  it('a dry run writes no data files', async () => {
    const root = await makeDataDir([acmeProject()]);
    const before = await Promise.all(['register.json', 'changelog.json', 'pending-review.json', 'meta.json'].map((f) => readBytes(root, f)));
    const report = await run(root, { web: quietWeb() }, { dryRun: true });
    expect(report.filesWritten).toEqual([]);
    const after = await Promise.all(['register.json', 'changelog.json', 'pending-review.json', 'meta.json'].map((f) => readBytes(root, f)));
    expect(after).toEqual(before);
  });
  it('rolls back already-replaced files when a rename fails', async () => {
    const root = await makeDataDir([acmeProject()]);
    const snap = await readSnapshot(root);
    const regBefore = await readBytes(root, 'register.json');
    const { writeFile, rename, unlink } = await import('node:fs/promises');
    let renames = 0;
    const fs: WriteFs = {
      writeFile: (p, d) => writeFile(p, d, 'utf8'),
      rename: async (a, b) => {
        if (++renames === 2) throw new Error('disk full');
        await rename(a, b);
      },
      unlink: (p) => unlink(p),
    };
    const reg = { ...(snap.register as RegisterFile), updatedAt: '2026-11-11T06:00:00Z' };
    await expect(writeAtomically(root, snap.raw, { register: reg, changelog: { schemaVersion: 1, changes: [], note: 'second file' } }, fs)).rejects.toThrow('disk full');
    expect(await readBytes(root, 'register.json')).toBe(regBefore);
  });
});

describe('review helper', () => {
  it('accepts an update through the same apply path (appliedBy manual) and rejects with a note', async () => {
    const root = await makeDataDir([acmeProject(), betaProject()]);
    // Produce a held update: a single secondary source for an existing project.
    const URL = 'https://gulfnews.com/business/beta-signs-agreement-1.500950';
    const web = quietWeb();
    web.set('https://gulfnews.com/news_sitemap.xml', {
      status: 200, contentType: 'text/xml',
      body: `<urlset xmlns:news="n"><url><loc>${URL}</loc><news:news><news:publication_date>2026-11-06T09:00:00+04:00</news:publication_date><news:title>Beta signs logistics agreement</news:title></news:news></url></urlset>`,
    });
    web.set(URL, { status: 200, body: article({ title: 'Beta signs logistics agreement', date: '2026-11-06', paragraphs: ['Beta Developments signed an agreement with Gamma Retail on 6 November 2026 for its distribution centre in Dubai South.'] }) });
    const f = fact({
      projectName: 'Beta Developments Dubai South Distribution Centre', developer: 'Beta Developments', operator: 'Gamma Retail', partiesQuote: 'Beta Developments signed an agreement with Gamma Retail',
      zone: 'Dubai South', emirate: 'Dubai', emirateQuote: 'in Dubai South', assetType: 'distribution_centre', eventType: 'agreement_signed',
      eventQuote: 'Beta Developments signed an agreement with Gamma Retail', eventDate: { date: '2026-11-06', precision: 'day', quote: 'on 6 November 2026' },
    });
    const report = await run(root, { web, extractor: new FakeExtractor({ [URL]: [f] }) });
    expect(report.held).toHaveLength(1);
    const id = report.held[0]!.reviewId;
    const pending = await readJson<PendingReviewFile>(root, 'pending-review.json');
    expect(proposedToPatch(pending.items[0]!.proposed).map((o) => o.field)).toEqual(['events', 'sources']);

    const out = await resolveReview({ root, id, action: 'accept', note: 'Checked against the Dubai South newsroom', now: new Date('2026-11-12T08:00:00Z') });
    expect(out.ok).toBe(true);
    const reg = await readJson<RegisterFile>(root, 'register.json');
    expect(reg.projects.find((p) => p.id === 'beta-developments-dubai-south-dc')!.status).toBe('signed_agreement');
    expect(out.changes.every((c) => c.appliedBy === 'manual')).toBe(true);
    const after = await readJson<PendingReviewFile>(root, 'pending-review.json');
    expect(after.items[0]).toMatchObject({ state: 'accepted', resolvedAt: '2026-11-12T08:00:00Z', resolutionNote: 'Checked against the Dubai South newsroom' });
    expect((await resolveReview({ root, id, action: 'reject', note: 'x', now: new Date('2026-11-12T09:00:00Z') })).ok).toBe(false);
  });
});

describe('GitHub issues', () => {
  it('reuses an existing issue with the review id in its title (idempotent)', async () => {
    const calls: string[] = [];
    const tracker = new GitHubIssueTracker('owner/repo', async (method, path) => {
      calls.push(`${method} ${path}`);
      if (method === 'GET') return { status: 200, json: [{ title: '[pending-review] rev-1: x', html_url: 'https://github.com/owner/repo/issues/7' }] };
      return { status: 201, json: { title: 't', html_url: 'https://github.com/owner/repo/issues/8' } };
    });
    expect(await tracker.ensureIssue({ key: 'rev-1', title: 't', body: 'b', labels: ['pending-review'] })).toBe('https://github.com/owner/repo/issues/7');
    expect(await tracker.ensureIssue({ key: 'rev-2', title: 't', body: 'b', labels: ['pending-review'] })).toBe('https://github.com/owner/repo/issues/8');
    expect(calls.filter((c) => c.startsWith('POST'))).toHaveLength(1);
  });
});

describe('dead-link checker', () => {
  it('separates dead from blocked and never edits data', async () => {
    const web = new FakeWeb()
      .set('https://news.example.com/acme-announce', { status: 404 })
      .set('https://news.example.com/acme-start', { status: 403 });
    const clock = new FakeClock();
    const fetcher = new PoliteFetcher({ userAgent: 'DubaiLogisticsTracker/0.1', timeoutMs: 1000, minIntervalMs: 1, maxBodyBytes: 1000, fetchImpl: web.impl, clock, logger: silentLogger });
    const r = await checkLinks([acmeProject()], fetcher);
    expect(r.find((x) => x.url.endsWith('acme-announce'))!.status).toBe('dead');
    expect(r.find((x) => x.url.endsWith('acme-start'))!.status).toBe('blocked');
  });
});

describe('repository files', () => {
  it('data/sources.json is valid and covers the required sources', async () => {
    const raw = JSON.parse(await readFile(join(REPO_ROOT, 'data/sources.json'), 'utf8')) as unknown;
    const s = parseSources(raw);
    const ids = s.sources.map((x) => x.id);
    for (const id of ['dpworld', 'jafza', 'dubai-south', 'ezdubai', 'tecom-dic', 'dubai-customs', 'dubai-trade', 'pcfc', 'fujairah-port', 'wam', 'dubai-media-office', 'emirates', 'dnata', 'dhl', 'fedex', 'ups', 'dsv', 'ceva', 'aramex', 'maersk', 'aldar', 'arcapita', 'sweid-sweid', 'dutco', 'reuters', 'the-national', 'khaleej-times', 'gulf-news']) {
      expect(ids).toContain(id);
    }
    expect(validateRegister({ register: { schemaVersion: 1, projects: [] }, sources: raw }).errors).toEqual([]);
  });

  it('ingest.yml: schedule gated by SCHEDULE_ENABLED, zero-spend manual defaults, no secrets in the file', async () => {
    const text = await readFile(join(REPO_ROOT, '.github/workflows/ingest.yml'), 'utf8');
    type Step = { name?: string; uses?: string; if?: string; run?: string; env?: Record<string, string> };
    const wf = parseYaml(text) as {
      on: { schedule: { cron: string }[]; workflow_dispatch: { inputs: Record<string, { default?: unknown; options?: string[] }> } };
      permissions: Record<string, string>;
      concurrency: { group: string; 'cancel-in-progress': boolean };
      jobs: { ingest: { if: string; steps: Step[] }; deploy: { uses: string; needs: string; if: string; permissions: Record<string, string> } };
    };
    expect(wf.on.schedule.map((s) => s.cron)).toEqual(['30 4 * * *', '30 12 * * *']);
    const inputs = wf.on.workflow_dispatch.inputs;
    expect(Object.keys(inputs).sort()).toEqual(['dry_run', 'extract', 'max_searches', 'redeploy', 'search_provider', 'since']);
    // An accidental click on "Run workflow" costs nothing.
    expect(inputs.dry_run!.default).toBe(true);
    expect(inputs.search_provider!.default).toBe('none');
    expect(inputs.search_provider!.options).toEqual(['none', 'anthropic']);
    expect(inputs.extract!.default).toBe(false);
    expect(wf.jobs.ingest.if).toBe("github.event_name == 'workflow_dispatch' || vars.SCHEDULE_ENABLED == 'true'");
    expect(wf.permissions).toMatchObject({ contents: 'write', issues: 'write', pages: 'write', 'id-token': 'write' });
    expect(wf.concurrency).toEqual({ group: 'ingest', 'cancel-in-progress': false });
    expect(wf.jobs.deploy).toMatchObject({ uses: './.github/workflows/deploy.yml', needs: 'ingest', permissions: { pages: 'write', 'id-token': 'write' } });
    const steps = wf.jobs.ingest.steps;
    const plan = steps.find((s) => s.name === 'Plan run')!;
    // Unset inputs fall back to zero spend; only a schedule turns spend on by default.
    expect(plan.run).toMatch(/search="\$\{IN_SEARCH:-none\}"/);
    expect(plan.run).toMatch(/extract=false; \[ "\$\{IN_EXTRACT:-false\}" = "true" \] && extract=true/);
    const ingestStep = steps.find((s) => s.name === 'Ingest')!;
    expect(ingestStep.env!.ANTHROPIC_KEY_SECRET).toBe('${{ secrets.ANTHROPIC_API_KEY }}');
    expect(ingestStep.env!.ANTHROPIC_API_KEY).toBeUndefined();
    expect(ingestStep.run).toMatch(/if \[ "\$PLAN_SPEND" = "true" \]; then export ANTHROPIC_API_KEY=/);
    expect(ingestStep.run).toMatch(/--no-extract/);
    // The key check prints a boolean only.
    const keyStep = steps.find((s) => s.name === 'Report whether the API key is configured')!;
    expect(keyStep.env!.KEY_PRESENT).toBe("${{ secrets.ANTHROPIC_API_KEY != '' }}");
    // Nothing is committed on a dry run, or when ingest/validation failed (default success() gating).
    const commit = steps.find((s) => s.name === 'Commit data changes')!;
    expect(commit.if).toBe("steps.plan.outputs.dry_run != 'true'");
    const order = steps.map((s) => s.name);
    expect(order.indexOf('Ingest')).toBeLessThan(order.indexOf('Validate data'));
    expect(order.indexOf('Validate data')).toBeLessThan(order.indexOf('Commit data changes'));
    // Action versions match ci.yml / deploy.yml.
    expect(steps.filter((s) => s.uses).map((s) => s.uses)).toEqual(['actions/checkout@v7', 'actions/setup-node@v7', 'actions/upload-artifact@v7']);
    expect(text).not.toMatch(/sk-ant-|ghp_|github_pat_/);
  });
});
