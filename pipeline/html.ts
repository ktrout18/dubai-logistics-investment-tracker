/**
 * HTML / XML helpers: readable text, links, titles, published-date detection,
 * RSS/Atom and sitemap parsing. Built on cheerio (no JavaScript execution:
 * a JS-only page simply yields little text and is reported as such).
 */
import * as cheerio from 'cheerio';
import { parseLooseDate, findDates } from './dates.ts';

const BLOCK = 'p,div,li,h1,h2,h3,h4,h5,h6,br,tr,td,th,section,article,blockquote,dd,dt,figcaption,header,time';

/** Collapse whitespace the same way for page text and quotes (used by grounding). */
export function normaliseWhitespace(s: string): string {
  return s
    .replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000]/g, ' ')
    .replace(/[\u2018\u2019\u201b\u2032]/g, "'")
    .replace(/[\u201c\u201d\u201e\u2033]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface PageText {
  title: string;
  text: string;
  /** Date from page metadata (meta tags, JSON-LD, <time>): trusted. */
  publishedDate?: string;
  /** First full date in the opening text: a weaker guess, used only when no listing date exists. */
  textDate?: string;
  /** Script-heavy page with almost no readable text: probably rendered by JavaScript. */
  likelyJsOnly: boolean;
}

export function extractPage(html: string): PageText {
  const $ = cheerio.load(html);
  const title =
    [$('meta[property="og:title"]').attr('content') ?? '', $('h1').first().text(), $('title').first().text()]
      .map(normaliseWhitespace)
      .find((t) => t.length > 0) ?? '';
  const publishedDate = detectPublishedDate($);
  const scriptBytes = $('script')
    .toArray()
    .reduce((n, el) => n + $(el).text().length, 0);
  // Note: <form> is kept — ASP.NET / SharePoint pages wrap the whole body in one.
  $('script,style,noscript,svg,iframe,template,nav,footer,[aria-hidden="true"],.cookie,.cookies,#cookie-banner').remove();
  $(BLOCK).each((_, el) => {
    $(el).append('\n');
  });
  const candidates = ['article', 'main', '[role="main"]', '.article-body', '.content', 'body'];
  let text = '';
  for (const sel of candidates) {
    const t = $(sel).first().text();
    if (normaliseWhitespace(t).length > 300) {
      text = t;
      break;
    }
  }
  if (!text) text = $('body').text() || $.root().text();
  const lines = text
    .split('\n')
    .map((l) => normaliseWhitespace(l))
    .filter(Boolean);
  const joined = lines.join('\n');
  const likelyJsOnly = joined.length < 400 && (scriptBytes > 5_000 || /__NEXT_DATA__|data-reactroot|ng-version/.test(html));
  const textDate = firstDateInText(joined.slice(0, 1500));
  return { title, text: joined, ...(publishedDate ? { publishedDate } : {}), ...(textDate ? { textDate } : {}), likelyJsOnly };
}

function firstDateInText(text: string): string | undefined {
  return findDates(text).find((d) => d.precision === 'day')?.date;
}

function detectPublishedDate($: cheerio.CheerioAPI): string | undefined {
  const metaSelectors = [
    'meta[property="article:published_time"]',
    'meta[name="article:published_time"]',
    'meta[itemprop="datePublished"]',
    'meta[name="publish-date"]',
    'meta[name="publish_date"]',
    'meta[name="pubdate"]',
    'meta[name="date"]',
    'meta[name="DC.date.issued"]',
    'meta[property="og:published_time"]',
  ];
  for (const sel of metaSelectors) {
    const d = parseLooseDate($(sel).attr('content'));
    if (d) return d;
  }
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    const m = /"datePublished"\s*:\s*"([^"]+)"/.exec($(el).text());
    const d = parseLooseDate(m?.[1]);
    if (d) return d;
  }
  const time = $('article time[datetime], time[datetime]').first().attr('datetime');
  return parseLooseDate(time);
}

export interface PageLink {
  url: string;
  text: string;
  /** Date shown next to the link in the listing, if any. */
  listedDate?: string;
}

/** Absolute http(s) links of a listing page, de-duplicated, in page order. */
export function extractLinks(html: string, baseUrl: string): PageLink[] {
  const $ = cheerio.load(html);
  const out: PageLink[] = [];
  const seen = new Set<string>();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    let abs: string;
    try {
      abs = new URL(href, baseUrl).toString().replace(/#.*$/, '');
    } catch {
      return;
    }
    if (!/^https?:/i.test(abs)) return;
    const text = normaliseWhitespace($(el).text());
    if (seen.has(abs)) {
      const prev = out.find((l) => l.url === abs);
      if (prev && !prev.text && text) prev.text = text;
      return;
    }
    seen.add(abs);
    const listedDate = listedDateFor($, el) ?? dateFromUrl(abs);
    out.push({ url: abs, text, ...(listedDate ? { listedDate } : {}) });
  });
  return out;
}

/** Text of a node with a space between every text node ("Read more" + "November 9" stay apart). */
function spacedText($: cheerio.CheerioAPI, node: ReturnType<cheerio.CheerioAPI>): string {
  const parts: string[] = [];
  node
    .find('*')
    .addBack()
    .contents()
    .each((_, n) => {
      if (n.type === 'text') parts.push($(n).text());
    });
  return normaliseWhitespace(parts.join(' '));
}

/** Date encoded in common news URL shapes: /2026/11/09/ or /2026/november/09-11/. */
export function dateFromUrl(url: string): string | undefined {
  const a = /\/(20\d{2})\/(\d{2})\/(\d{2})\//.exec(url);
  if (a) return parseLooseDate(`${a[1]}-${a[2]}-${a[3]}`);
  const b = /\/(20\d{2})\/[a-z]+\/(\d{2})-(\d{2})\//i.exec(url);
  if (b) return parseLooseDate(`${b[1]}-${b[3]}-${b[2]}`);
  return undefined;
}

/**
 * Date shown with a listing entry: inside the link itself, or in the smallest
 * enclosing element that still holds only this one link (never a sibling's date).
 */
function listedDateFor($: cheerio.CheerioAPI, el: Parameters<cheerio.CheerioAPI>[0]): string | undefined {
  let node = $(el);
  for (let depth = 0; depth < 6 && node.length; depth++) {
    if (depth > 0 && node.find('a[href]').length > 1) return undefined;
    const t = spacedText($, node);
    if (t.length > 600) return undefined;
    const d = findDates(t).find((x) => x.precision === 'day');
    if (d) return d.date;
    node = node.parent();
  }
  return undefined;
}

export interface FeedItem {
  url: string;
  title: string;
  publishedDate?: string;
  summary?: string;
}

/** RSS 2.0 or Atom feed items. */
export function parseFeed(xml: string): FeedItem[] {
  const $ = cheerio.load(xml, { xml: true });
  const items: FeedItem[] = [];
  $('item').each((_, el) => {
    const e = $(el);
    const url = e.children('link').first().text().trim() || e.children('guid').first().text().trim();
    if (!url) return;
    const date = parseLooseDate(e.children('pubDate').first().text() || e.children('dc\\:date').first().text());
    const summary = normaliseWhitespace(cheerio.load(e.children('description').first().text()).text());
    items.push({ url, title: normaliseWhitespace(e.children('title').first().text()), ...(date ? { publishedDate: date } : {}), ...(summary ? { summary } : {}) });
  });
  $('entry').each((_, el) => {
    const e = $(el);
    const url = e.children('link[rel="alternate"]').attr('href') ?? e.children('link').first().attr('href') ?? '';
    if (!url) return;
    const date = parseLooseDate(e.children('published').first().text() || e.children('updated').first().text());
    items.push({ url, title: normaliseWhitespace(e.children('title').first().text()), ...(date ? { publishedDate: date } : {}) });
  });
  return items;
}

export interface SitemapEntry {
  url: string;
  lastmod?: string;
  /** Google News sitemap publication date / title when present. */
  newsDate?: string;
  newsTitle?: string;
}

export function parseSitemap(xml: string): { kind: 'index' | 'urlset' | 'unknown'; entries: SitemapEntry[] } {
  const $ = cheerio.load(xml, { xml: true });
  if ($('sitemapindex').length) {
    return {
      kind: 'index',
      entries: $('sitemap')
        .toArray()
        .map((el) => ({ url: $(el).children('loc').text().trim(), lastmod: parseLooseDate($(el).children('lastmod').text()) }))
        .filter((e) => e.url)
        .map((e) => (e.lastmod ? e : { url: e.url })),
    };
  }
  if ($('urlset').length) {
    return {
      kind: 'urlset',
      entries: $('url')
        .toArray()
        .map((el) => {
          const u = $(el);
          const lastmod = parseLooseDate(u.children('lastmod').text());
          const newsDate = parseLooseDate(u.find('news\\:publication_date').text());
          const newsTitle = normaliseWhitespace(u.find('news\\:title').text());
          return {
            url: u.children('loc').text().trim(),
            ...(lastmod ? { lastmod } : {}),
            ...(newsDate ? { newsDate } : {}),
            ...(newsTitle ? { newsTitle } : {}),
          };
        })
        .filter((e) => e.url),
    };
  }
  return { kind: 'unknown', entries: [] };
}
