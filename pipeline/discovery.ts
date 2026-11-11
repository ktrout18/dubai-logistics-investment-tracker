/**
 * Discovery: for each enabled source try its access methods in order
 * (rss | sitemap | html_list | alt_url | site_search) and fall through on
 * block/failure (403, 429, timeout, empty or JS-only page, robots disallow).
 * Then fetch new article pages. A blocked article is located through the
 * search index (snippet → `indexed` document) and cross-checked by searching
 * for syndicated copies on other configured sources (WAM, reputable media).
 */
import { fnv1a, normaliseUrl } from '../shared/index.ts';
import type { PipelineConfig } from './config.ts';
import { addDays, parseLooseDate } from './dates.ts';
import { extractLinks, extractPage, normaliseWhitespace, parseFeed, parseSitemap } from './html.ts';
import type { SearchBudget } from './search/budget.ts';
import { hostOf, sourceForUrl, type AccessMethod, type PipelineSource } from './sources.ts';
import type { PipelineState } from './store.ts';
import type { DocumentRecord, Fetcher, FetchResult, Logger, SourceScanResult } from './types.ts';

export interface ListItem {
  url: string;
  title?: string;
  date?: string;
  snippet?: string;
}

export interface DiscoveryContext {
  fetcher: Fetcher;
  search: SearchBudget;
  config: PipelineConfig;
  logger: Logger;
  sources: readonly PipelineSource[];
  state: PipelineState;
  /** Window start (inclusive, YYYY-MM-DD). */
  since: string;
  today: string;
}

/** Per-document outcome, for the run report and the processed-URL state. */
export interface DocOutcome {
  url: string;
  sourceId: string;
  outcome: string;
}

function describe(r: FetchResult): string {
  return `${r.outcome}${r.status ? ` (HTTP ${r.status})` : ''}${r.note ? `: ${r.note}` : ''}`;
}

function matchesFilters(m: AccessMethod, url: string, title = ''): boolean {
  if (m.linkPattern && !new RegExp(m.linkPattern, 'i').test(url)) return false;
  if (m.keywords?.length) {
    const hay = `${url} ${title}`.toLowerCase();
    if (!m.keywords.some((k) => hay.includes(k.toLowerCase()))) return false;
  }
  return true;
}

type MethodResult = { ok: true; items: ListItem[]; note: string } | { ok: false; note: string; skipped?: boolean };

async function runMethod(source: PipelineSource, m: AccessMethod, ctx: DiscoveryContext): Promise<MethodResult> {
  const interval = { ...(source.minIntervalMs ? { minIntervalMs: source.minIntervalMs } : {}) };
  switch (m.type) {
    case 'rss': {
      const r = await ctx.fetcher.get(m.url!, { ...interval, accept: 'application/rss+xml,application/atom+xml,application/xml;q=0.9,*/*;q=0.5' });
      if (r.outcome !== 'ok') return { ok: false, note: describe(r) };
      const items = parseFeed(r.body).filter((i) => matchesFilters(m, i.url, i.title));
      if (!parseFeed(r.body).length) return { ok: false, note: 'feed empty or not RSS/Atom' };
      const inWindow = items.filter((i) => !i.publishedDate || i.publishedDate >= ctx.since);
      return {
        ok: true,
        items: inWindow.map((i) => ({ url: i.url, title: i.title, ...(i.publishedDate ? { date: i.publishedDate } : {}), ...(i.summary ? { snippet: i.summary } : {}) })),
        note: `${items.length} feed items, ${inWindow.length} in window`,
      };
    }
    case 'sitemap': {
      const r = await ctx.fetcher.get(m.url!, { ...interval, accept: 'application/xml,text/xml;q=0.9,*/*;q=0.5' });
      if (r.outcome !== 'ok') return { ok: false, note: describe(r) };
      let parsed = parseSitemap(r.body);
      const entries = [...(parsed.kind === 'urlset' ? parsed.entries : [])];
      if (parsed.kind === 'index') {
        const children = parsed.entries.slice(0, m.maxChildSitemaps ?? 3);
        for (const child of children) {
          const c = await ctx.fetcher.get(child.url, { ...interval, accept: 'application/xml,text/xml;q=0.9,*/*;q=0.5' });
          if (c.outcome !== 'ok') continue;
          parsed = parseSitemap(c.body);
          if (parsed.kind === 'urlset') entries.push(...parsed.entries);
        }
      }
      if (!entries.length) return { ok: false, note: 'sitemap empty or unreadable' };
      const matching = entries.filter((e) => matchesFilters(m, e.url, e.newsTitle));
      // Only Google-News publication dates are trusted as article dates; <lastmod> is often a crawl time.
      const inWindow = matching
        .filter((e) => !e.newsDate || e.newsDate >= ctx.since)
        .sort((a, b) => (b.newsDate ?? b.lastmod ?? '').localeCompare(a.newsDate ?? a.lastmod ?? ''));
      return {
        ok: true,
        items: inWindow.map((e) => ({ url: e.url, ...(e.newsTitle ? { title: e.newsTitle } : {}), ...(e.newsDate ? { date: e.newsDate } : {}) })),
        note: `${entries.length} sitemap URLs, ${matching.length} matching, ${inWindow.length} candidates`,
      };
    }
    case 'html_list':
    case 'alt_url': {
      const r = await ctx.fetcher.get(m.url!, interval);
      if (r.outcome !== 'ok') return { ok: false, note: describe(r) };
      const page = extractPage(r.body);
      const links = extractLinks(r.body, r.finalUrl).filter((l) => normaliseUrl(l.url) !== normaliseUrl(r.finalUrl) && matchesFilters(m, l.url, l.text));
      if (!links.length) {
        return { ok: false, note: page.likelyJsOnly ? 'page rendered by JavaScript: no article links in the HTML' : 'no article links matched on the page' };
      }
      const inWindow = links.filter((l) => !l.listedDate || l.listedDate >= ctx.since);
      return {
        ok: true,
        items: inWindow.map((l) => ({ url: l.url, ...(l.text ? { title: l.text } : {}), ...(l.listedDate ? { date: l.listedDate } : {}) })),
        note: `${links.length} article links, ${inWindow.length} in window`,
      };
    }
    case 'site_search': {
      const site = m.site ?? source.domains[0]!;
      const query = m.query ?? `${source.publisher} warehouse OR logistics OR distribution centre`;
      const r = await ctx.search.search({ query, site, after: ctx.since, max: ctx.config.resultsPerSearch });
      if (!r.ok) return { ok: false, note: r.reason, ...(r.skipped ? { skipped: true } : {}) };
      return {
        ok: true,
        items: r.results.map((x) => {
          const date = parseLooseDate(x.pageAge);
          return { url: x.url, title: x.title, ...(x.snippet ? { snippet: x.snippet } : {}), ...(date ? { date } : {}) };
        }),
        note: `${r.results.length} search results (${ctx.search.providerName}, site:${site}, after ${ctx.since})`,
      };
    }
  }
}

/** Scan one source: listing with fallbacks. Returns the scan record and the candidate items. */
export async function scanSource(source: PipelineSource, ctx: DiscoveryContext): Promise<{ scan: SourceScanResult; items: ListItem[] }> {
  const scan: SourceScanResult = { sourceId: source.id, name: source.name, status: 'failed', documents: 0, attempts: [] };
  if (!source.enabled) {
    scan.status = 'skipped';
    scan.note = 'disabled in data/sources.json';
    return { scan, items: [] };
  }
  for (const [i, m] of source.accessMethods.entries()) {
    let r: MethodResult;
    try {
      r = await runMethod(source, m, ctx);
    } catch (e) {
      r = { ok: false, note: `error: ${(e as Error).message}` };
    }
    scan.attempts.push({ method: m.type, ...(m.url ? { url: m.url } : {}), result: r.ok ? `ok: ${r.note}` : `${r.skipped ? 'skipped' : 'failed'}: ${r.note}` });
    if (r.ok) {
      scan.status = i === 0 ? 'ok' : 'fallback_used';
      scan.method = m.type;
      scan.note = i === 0 ? r.note : `${r.note}; earlier: ${scan.attempts.slice(0, -1).map((a) => `${a.method} ${a.result}`).join(' | ')}`;
      return { scan, items: r.items };
    }
  }
  scan.status = 'failed';
  scan.note = scan.attempts.length ? scan.attempts.map((a) => `${a.method} ${a.result}`).join(' | ') : 'no access methods configured';
  return { scan, items: [] };
}

function docFromPage(url: string, source: PipelineSource, page: ReturnType<typeof extractPage>, item: ListItem, foundVia: string): DocumentRecord {
  // Metadata date first, then the date shown in the listing/feed, then a date in the opening text.
  const date = page.publishedDate ?? item.date ?? page.textDate;
  return {
    url,
    title: page.title || item.title || url,
    text: page.text,
    ...(date ? { publishedDate: date } : {}),
    verification: 'direct',
    sourceId: source.id,
    sourceName: source.name,
    publisher: source.publisher,
    tier: source.tier,
    foundVia,
  };
}

/**
 * Fetch article pages for listed items (newest first, unprocessed only, capped).
 * Blocked pages fall back to the search snippet (indexed) and to syndicated copies.
 */
export async function fetchArticles(
  source: PipelineSource,
  items: ListItem[],
  foundVia: string,
  ctx: DiscoveryContext,
  outcomes: DocOutcome[],
  extra: { recheckProjectId?: string } = {},
): Promise<DocumentRecord[]> {
  const docs: DocumentRecord[] = [];
  const seen = new Set<string>();
  const fresh = items.filter((it) => {
    const k = normaliseUrl(it.url);
    if (seen.has(k)) return false;
    seen.add(k);
    if (ctx.state.processed[k]) return false;
    return true;
  });
  for (const it of fresh.slice(0, ctx.config.maxArticlesPerSource)) {
    const owner = sourceForUrl(it.url, ctx.sources) ?? source;
    const r = await ctx.fetcher.get(it.url, owner.minIntervalMs ? { minIntervalMs: owner.minIntervalMs } : {});
    if (r.outcome === 'ok') {
      const page = extractPage(r.body);
      if (page.text.length < 200) {
        outcomes.push({ url: it.url, sourceId: owner.id, outcome: page.likelyJsOnly ? 'page_js_only' : 'page_too_short' });
        if (it.snippet) docs.push(indexedDoc(it, owner, foundVia, extra));
        continue;
      }
      const doc = docFromPage(it.url, owner, page, it, foundVia);
      if (extra.recheckProjectId) doc.recheckProjectId = extra.recheckProjectId;
      const hash = fnv1a(normaliseWhitespace(doc.text).toLowerCase());
      const dupe = Object.values(ctx.state.processed).some((p) => p.contentHash === hash);
      if (dupe) {
        outcomes.push({ url: it.url, sourceId: owner.id, outcome: 'duplicate_content' });
        continue;
      }
      docs.push(doc);
      continue;
    }
    outcomes.push({ url: it.url, sourceId: owner.id, outcome: `article_${r.outcome}` });
    if (it.snippet) docs.push(indexedDoc(it, owner, foundVia, extra));
    else {
      // Locate the original via the search index, then look for syndicated copies.
      const located = await locateViaIndex(it, ctx);
      if (located) docs.push({ ...indexedDoc(located, owner, `${foundVia}+index`, extra) });
    }
    if (it.title) docs.push(...(await syndicatedCopies(it.title, owner, ctx, outcomes, extra)));
  }
  return docs;
}

function indexedDoc(it: ListItem, source: PipelineSource, foundVia: string, extra: { recheckProjectId?: string }): DocumentRecord {
  return {
    url: it.url,
    title: it.title ?? it.url,
    text: it.snippet ?? '',
    ...(it.date ? { publishedDate: it.date } : {}),
    verification: 'indexed',
    sourceId: source.id,
    sourceName: source.name,
    publisher: source.publisher,
    tier: source.tier,
    foundVia,
    ...(extra.recheckProjectId ? { recheckProjectId: extra.recheckProjectId } : {}),
  };
}

async function locateViaIndex(it: ListItem, ctx: DiscoveryContext): Promise<ListItem | undefined> {
  if (!it.title || !ctx.search.available) return undefined;
  const r = await ctx.search.search({ query: `"${it.title}"`, site: hostOf(it.url), max: 3 });
  if (!r.ok) return undefined;
  const hit = r.results.find((x) => normaliseUrl(x.url) === normaliseUrl(it.url)) ?? r.results[0];
  if (!hit || !hit.snippet) return undefined;
  const date = it.date ?? parseLooseDate(hit.pageAge);
  return { url: hit.url, title: hit.title, snippet: hit.snippet, ...(date ? { date } : {}) };
}

/** Search for copies of a blocked announcement on OTHER configured sources and read them directly. */
async function syndicatedCopies(
  title: string,
  original: PipelineSource,
  ctx: DiscoveryContext,
  outcomes: DocOutcome[],
  extra: { recheckProjectId?: string },
): Promise<DocumentRecord[]> {
  if (!ctx.search.available) return [];
  const r = await ctx.search.search({ query: `"${title.slice(0, 120)}"`, after: addDays(ctx.since, -7), max: 5 });
  if (!r.ok) return [];
  const docs: DocumentRecord[] = [];
  for (const hit of r.results) {
    const src = sourceForUrl(hit.url, ctx.sources);
    if (!src || src.id === original.id || !src.enabled) continue; // only configured, reputable sources
    if (ctx.state.processed[normaliseUrl(hit.url)]) continue;
    const page = await ctx.fetcher.get(hit.url, src.minIntervalMs ? { minIntervalMs: src.minIntervalMs } : {});
    if (page.outcome !== 'ok') {
      outcomes.push({ url: hit.url, sourceId: src.id, outcome: `syndicated_${page.outcome}` });
      continue;
    }
    const p = extractPage(page.body);
    if (p.text.length < 200) continue;
    const d = docFromPage(hit.url, src, p, { url: hit.url, title: hit.title }, 'syndicated_copy');
    if (extra.recheckProjectId) d.recheckProjectId = extra.recheckProjectId;
    docs.push(d);
    if (docs.length >= 2) break;
  }
  return docs;
}
