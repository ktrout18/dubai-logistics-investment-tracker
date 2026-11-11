/**
 * Test harness: a temp copy of a fictional data set (example.* hosts only in
 * the register; source hosts are configured test sources), and fakes for
 * fetch, search, LLM, clock and GitHub. Everything is offline and deterministic.
 */
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serializeDataFile, type Project, type ProjectEvent } from '../../shared/index.ts';
import { fixture } from '../../shared/__fixtures__/projects.ts';
import { DEFAULT_CONFIG, type PipelineConfig } from '../config.ts';
import type { CandidateFact } from '../extraction.ts';
import { PoliteFetcher } from '../http.ts';
import { runIngest, type RunOptions, type RunReport } from '../run.ts';
import type { PipelineSource } from '../sources.ts';
import type {
  Clock,
  ExtractionOutcome,
  Extractor,
  FetchImpl,
  IssueTracker,
  LlmUsage,
  SearchProvider,
  SearchQuery,
  SearchResponse,
  SearchResult,
} from '../types.ts';
import { silentLogger } from '../types.ts';

export const NOW = new Date('2026-11-11T06:00:00Z');
export const TODAY = '2026-11-11';

export class FakeClock implements Clock {
  private t: number;
  constructor(start = NOW) {
    this.t = start.getTime();
  }
  now(): Date {
    return new Date(this.t);
  }
  async sleep(ms: number): Promise<void> {
    this.t += ms;
  }
}

export interface FakePage {
  status: number;
  body?: string;
  contentType?: string;
  /** Simulate a network failure instead of a response. */
  throws?: string;
}

/** Fake transport for the real PoliteFetcher. Unknown URLs → 404. robots.txt → 404 unless given. */
export class FakeWeb {
  readonly pages = new Map<string, FakePage>();
  readonly requests: string[] = [];
  defaultPage: FakePage | undefined;

  set(url: string, page: FakePage): this {
    this.pages.set(url, page);
    return this;
  }

  impl: FetchImpl = async (url, init) => {
    this.requests.push(`${init.method} ${url}`);
    const page = this.pages.get(url) ?? (url.endsWith('/robots.txt') ? { status: 404, body: '' } : this.defaultPage ?? { status: 404, body: 'not found' });
    if (page.throws) {
      const err = new Error(page.throws) as Error & { cause?: { code: string } };
      err.cause = { code: page.throws };
      throw err;
    }
    return {
      status: page.status,
      url,
      headers: { get: (n: string) => (n.toLowerCase() === 'content-type' ? page.contentType ?? 'text/html; charset=utf-8' : null) },
      text: async () => page.body ?? '',
    };
  };
}

export class FakeSearch implements SearchProvider {
  readonly name = 'anthropic';
  readonly available = true;
  readonly queries: SearchQuery[] = [];
  constructor(private readonly responder: (q: SearchQuery) => SearchResult[] = () => []) {}
  async search(q: SearchQuery): Promise<SearchResponse> {
    this.queries.push(q);
    return { results: this.responder(q), usage: { model: 'claude-haiku-5-5', inputTokens: 1000, outputTokens: 200, searches: 1 } };
  }
}

export class NoSearch implements SearchProvider {
  readonly name = 'none';
  readonly available = false;
  async search(): Promise<SearchResponse> {
    throw new Error('no search');
  }
}

export function fact(over: Partial<CandidateFact>): CandidateFact {
  return {
    inScope: true,
    outOfScopeReason: null,
    projectName: 'Unnamed',
    facilityName: null,
    developer: null,
    operator: null,
    investor: null,
    owner: null,
    partiesQuote: '',
    location: null,
    zone: null,
    locationQuote: null,
    emirate: null,
    emirateQuote: null,
    assetType: 'warehouse',
    sectors: ['modern_warehousing'],
    eventType: 'announcement',
    eventQuote: '',
    eventIsPlannedOrFuture: false,
    eventDate: null,
    areas: [],
    investment: null,
    gradeAQuote: null,
    forecastCompletion: null,
    actualCompletion: null,
    ambiguities: [],
    ...over,
  };
}

/** Returns canned facts per document URL (found in the prompt). Unknown URL → no facts. */
export class FakeExtractor implements Extractor {
  readonly name = 'fake';
  readonly calls: string[] = [];
  constructor(
    private readonly byUrl: Record<string, CandidateFact[]>,
    private readonly usage: LlmUsage = { model: 'claude-opus-5-5', inputTokens: 5000, outputTokens: 2000 },
  ) {}
  async extract(input: { user: string }): Promise<ExtractionOutcome> {
    const url = /^URL: (.+)$/m.exec(input.user)?.[1] ?? '';
    this.calls.push(url);
    return { ok: true, json: { facts: this.byUrl[url] ?? [] }, usage: [this.usage] };
  }
}

export class FakeIssues implements IssueTracker {
  readonly enabled = true;
  readonly created: { key: string; title: string }[] = [];
  async ensureIssue(input: { key: string; title: string }): Promise<string> {
    const existing = this.created.findIndex((c) => c.key === input.key);
    if (existing >= 0) return `https://github.example.com/o/r/issues/${existing + 1}`;
    this.created.push({ key: input.key, title: input.title });
    return `https://github.example.com/o/r/issues/${this.created.length}`;
  }
}

export function article(opts: { title: string; date: string; paragraphs: string[] }): string {
  return `<!doctype html><html><head><title>${opts.title}</title><meta property="article:published_time" content="${opts.date}T08:00:00+04:00"></head>
<body><nav>Home | News</nav><article><h1>${opts.title}</h1><time datetime="${opts.date}">${opts.date}</time>
${opts.paragraphs.map((p) => `<p>${p}</p>`).join('\n')}
<p>About the company: a fictional logistics business used only in automated tests of the ingestion pipeline. This paragraph pads the article so it reads like a real press release.</p>
</article><footer>Contact</footer></body></html>`;
}

export function listing(links: { url: string; title: string; date?: string }[]): string {
  return `<!doctype html><html><body><main><h1>News</h1><ul>${links
    .map((l) => `<li><a href="${l.url}">${l.title}</a> <span>${l.date ?? ''}</span></li>`)
    .join('')}</ul><p>Latest news and press releases from this organisation, listed newest first for readers and partners.</p></main></body></html>`;
}

// ---------------------------------------------------------------------------
// Fixture register (fictional) and test sources
// ---------------------------------------------------------------------------

const U = (slug: string) => `https://news.example.com/${slug}`;
const ev = (e: Omit<ProjectEvent, 'datePrecision' | 'sourceType' | 'verification' | 'id'> & { id?: string }): ProjectEvent => ({
  id: e.id ?? `${e.date}-${e.type.replace(/_/g, '-')}`,
  datePrecision: 'day',
  sourceType: 'primary',
  verification: 'direct',
  ...e,
});

const TS = { createdAt: '2026-01-10T00:00:00Z', updatedAt: '2026-01-10T00:00:00Z' };

export function acmeProject(): Project {
  return withTs(fixture({
    id: 'acme-logistics-jafza-cold-store',
    name: 'Acme Logistics Jafza Cold Store',
    summary: 'Cold store under construction in Jafza (test fixture).',
    operator: 'Acme Logistics',
    emirate: 'Dubai',
    location: 'Jebel Ali, Dubai',
    zone: 'Jafza',
    sectors: ['food_fmcg_cold_chain'],
    assetType: 'cold_store',
    status: 'under_construction',
    originalAnnouncement: { date: '2025-03-01', datePrecision: 'day', sourceUrl: U('acme-announce') },
    areas: [{ valueM2: 20000, basis: 'warehouse_gfa', originalValue: 20000, originalUnit: 'sqm', sourceUrl: U('acme-announce') }],
    primaryAreaIndex: 0,
    gradeA: 'unverified',
    netNew: 'unknown',
    forecastCompletion: { date: '2026-12-01', datePrecision: 'month', sourceUrl: U('acme-start') },
    events: [
      ev({ date: '2025-03-01', type: 'announcement', summary: 'Announced', sourceUrl: U('acme-announce') }),
      ev({ date: '2025-09-01', type: 'construction_start', summary: 'Construction started', sourceUrl: U('acme-start') }),
    ],
    lastVerified: '2026-01-10',
    published: { [U('acme-announce')]: '2025-03-01', [U('acme-start')]: '2025-09-01' },
  }));
}

function withTs(p: Project): Project {
  return { ...p, ...TS };
}

export function betaProject(): Project {
  return withTs(fixture({
    id: 'beta-developments-dubai-south-dc',
    name: 'Beta Developments Dubai South Distribution Centre',
    summary: 'MoU for a distribution centre in Dubai South (test fixture).',
    developer: 'Beta Developments',
    operator: 'Gamma Retail',
    emirate: 'Dubai',
    location: 'Dubai South',
    zone: 'Dubai South – Logistics District',
    sectors: ['modern_warehousing'],
    assetType: 'distribution_centre',
    status: 'mou',
    originalAnnouncement: { date: '2026-06-10', datePrecision: 'day', sourceUrl: U('beta-mou') },
    areas: [{ valueM2: 30000, basis: 'warehouse_gfa', originalValue: 30000, originalUnit: 'sqm', sourceUrl: U('beta-mou') }],
    primaryAreaIndex: 0,
    gradeA: 'unverified',
    netNew: 'unknown',
    events: [ev({ date: '2026-06-10', type: 'mou', summary: 'MoU signed', sourceUrl: U('beta-mou') })],
    lastVerified: '2026-06-10',
    published: { [U('beta-mou')]: '2026-06-10' },
  }));
}

export function testSources(): PipelineSource[] {
  return [
    {
      id: 'jafza', name: 'Jafza news', tier: 'primary', kind: 'free_zone', publisher: 'Jafza', domains: ['www.jafza.ae'], enabled: true,
      accessMethods: [{ type: 'html_list', url: 'https://www.jafza.ae/news/', linkPattern: '/news/[a-z0-9-]+/$' }], notes: 'test',
    },
    {
      id: 'dubai-south', name: 'Dubai South newsroom', tier: 'primary', kind: 'free_zone', publisher: 'Dubai South', domains: ['www.dubaisouth.ae'], enabled: true,
      accessMethods: [{ type: 'html_list', url: 'https://www.dubaisouth.ae/en/newsroom', linkPattern: '/en/newsroom/[a-z0-9-]+' }], notes: 'test',
    },
    {
      id: 'pcfc', name: 'PCFC', tier: 'primary', kind: 'government', publisher: 'PCFC', domains: ['pcfc.ae'], enabled: true,
      accessMethods: [
        { type: 'html_list', url: 'https://pcfc.ae/en/Pages/news.aspx', linkPattern: 'newsdetails' },
        { type: 'alt_url', url: 'https://pcfc.ae/en/Pages/Warnings-and-Circulars.aspx', linkPattern: 'aspx' },
        { type: 'site_search', site: 'pcfc.ae', query: 'PCFC news' },
      ],
      notes: 'test',
    },
    {
      id: 'saif-zone', name: 'SAIF Zone news', tier: 'primary', kind: 'free_zone', publisher: 'SAIF Zone', domains: ['www.saif-zone.example'], enabled: true, regionalContext: true,
      accessMethods: [{ type: 'html_list', url: 'https://www.saif-zone.example/news', linkPattern: '/news/[a-z0-9-]+' }], notes: 'test',
    },
    {
      id: 'dubai-media-office', name: 'Dubai Media Office', tier: 'primary', kind: 'government', publisher: 'Dubai Media Office', domains: ['www.mediaoffice.ae'], enabled: true,
      accessMethods: [{ type: 'html_list', url: 'https://www.mediaoffice.ae/en', linkPattern: '/en/news/' }], notes: 'test',
    },
    {
      id: 'gulf-news', name: 'Gulf News', tier: 'secondary', kind: 'media', publisher: 'Gulf News', domains: ['gulfnews.com'], enabled: true,
      accessMethods: [{ type: 'sitemap', url: 'https://gulfnews.com/news_sitemap.xml', keywords: ['logistic', 'warehouse', 'cold-store'] }], notes: 'test',
    },
  ];
}

export function newsSitemap(entries: { url: string; date: string; title: string }[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${entries
    .map((e) => `<url><loc>${e.url}</loc><news:news><news:publication_date>${e.date}T09:00:00+04:00</news:publication_date><news:title>${e.title}</news:title></news:news></url>`)
    .join('')}</urlset>`;
}

/** A quiet but healthy web: every listing works and shows only an old article (outside the window). */
export function quietWeb(): FakeWeb {
  const w = new FakeWeb();
  const old = (url: string) => listing([{ url, title: 'Old news', date: '1 January 2026' }]);
  w.set('https://www.jafza.ae/news/', { status: 200, body: old('https://www.jafza.ae/news/old-item/') });
  w.set('https://www.dubaisouth.ae/en/newsroom', { status: 200, body: old('https://www.dubaisouth.ae/en/newsroom/old-item') });
  w.set('https://pcfc.ae/en/Pages/news.aspx', { status: 403, body: 'Forbidden' });
  w.set('https://pcfc.ae/en/Pages/Warnings-and-Circulars.aspx', { status: 403, body: 'Forbidden' });
  w.set('https://www.saif-zone.example/news', { status: 200, body: old('https://www.saif-zone.example/news/old-item') });
  w.set('https://www.mediaoffice.ae/en', { status: 200, body: old('https://www.mediaoffice.ae/en/news/2026/january/01-01/old-item') });
  w.set('https://gulfnews.com/news_sitemap.xml', {
    status: 200,
    body: newsSitemap([{ url: 'https://gulfnews.com/business/old-logistics-item-1.1', date: '2026-01-01', title: 'Old logistics item' }]),
    contentType: 'text/xml',
  });
  return w;
}

export async function makeDataDir(projects: Project[], sources: PipelineSource[] = testSources()): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'pipeline-test-'));
  await mkdir(join(root, 'data'));
  const w = (name: string, v: unknown) => writeFile(join(root, 'data', name), serializeDataFile(v), 'utf8');
  await w('register.json', { schemaVersion: 1, projects });
  await w('changelog.json', { schemaVersion: 1, changes: [] });
  await w('pending-review.json', { schemaVersion: 1, items: [] });
  await w('meta.json', { schemaVersion: 1, lastRunStatus: 'never_run', sourceScans: [], coverageLimitations: ['test'], exhaustive: false });
  await w('sources.json', { schemaVersion: 1, sources });
  return root;
}

export async function readJson<T = Record<string, unknown>>(root: string, file: string): Promise<T> {
  return JSON.parse(await readFile(join(root, 'data', file), 'utf8')) as T;
}

export async function readBytes(root: string, file: string): Promise<string> {
  return readFile(join(root, 'data', file), 'utf8');
}

export const TEST_CONFIG: PipelineConfig = { ...structuredClone(DEFAULT_CONFIG), recheckPerRun: 0 };

export async function run(
  root: string,
  deps: { web: FakeWeb; search?: SearchProvider; extractor?: Extractor; issues?: IssueTracker },
  opts: Partial<RunOptions> = {},
): Promise<RunReport> {
  const clock = new FakeClock();
  const fetcher = new PoliteFetcher({
    userAgent: TEST_CONFIG.http.userAgent,
    timeoutMs: 1000,
    minIntervalMs: 10,
    maxBodyBytes: 1_000_000,
    fetchImpl: deps.web.impl,
    clock,
    logger: silentLogger,
  });
  return runIngest(
    { root, dryRun: false, since: '2026-11-04', issues: true, reportDir: null, ...opts },
    {
      fetcher,
      search: deps.search ?? new NoSearch(),
      extractor: deps.extractor ?? new FakeExtractor({}),
      issues: deps.issues ?? new FakeIssues(),
      clock,
      logger: silentLogger,
      config: TEST_CONFIG,
    },
  );
}
