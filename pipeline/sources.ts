/**
 * Pipeline view of data/sources.json. `shared/` only fixes `{id, name}` and lets
 * extra keys pass through; this module defines and checks the full shape.
 */
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

export const AccessMethodSchema = z
  .object({
    type: z.enum(['rss', 'sitemap', 'html_list', 'alt_url', 'site_search']),
    /** Listing / feed / sitemap URL (all types except site_search). */
    url: z.string().url().optional(),
    /** Regex (string) an article link must match to be considered (html_list, alt_url, sitemap). */
    linkPattern: z.string().optional(),
    /** At least one keyword must occur in the link URL or title (broad news sources). */
    keywords: z.array(z.string()).optional(),
    /** Sitemap index: how many child sitemaps to read at most. */
    maxChildSitemaps: z.number().int().positive().optional(),
    /** site_search: host to restrict to (defaults to the source's first domain). */
    site: z.string().optional(),
    /** site_search: query terms (the window and site are added by the pipeline). */
    query: z.string().optional(),
    note: z.string().optional(),
  })
  .strict()
  .superRefine((m, ctx) => {
    if (m.type !== 'site_search' && !m.url) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${m.type} needs url` });
    if (m.linkPattern) {
      try {
        new RegExp(m.linkPattern);
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `invalid linkPattern ${m.linkPattern}` });
      }
    }
  });
export type AccessMethod = z.infer<typeof AccessMethodSchema>;

export const PipelineSourceSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().min(1),
    /** primary = the announcing organisation or government; secondary = media. */
    tier: z.enum(['primary', 'secondary']),
    kind: z.enum(['free_zone', 'port_operator', 'government', 'news_agency', 'company', 'developer', 'media']),
    publisher: z.string().min(1),
    /** Hosts belonging to this source (used for search restriction and primary-source detection). */
    domains: z.array(z.string().min(1)).min(1),
    enabled: z.boolean(),
    /** Minimum gap between requests to this source's hosts (ms). */
    minIntervalMs: z.number().int().positive().optional(),
    /** Context-only sources (e.g. outside Dubai) — findings are regional context. */
    regionalContext: z.boolean().optional(),
    accessMethods: z.array(AccessMethodSchema),
    notes: z.string(),
    /** What a live probe actually observed (date + result). */
    probe: z
      .object({ date: z.string(), results: z.array(z.string()) })
      .strict()
      .optional(),
  })
  .strict();
export type PipelineSource = z.infer<typeof PipelineSourceSchema>;

export const PipelineSourcesFileSchema = z
  .object({
    schemaVersion: z.literal(1),
    note: z.string().optional(),
    sources: z.array(PipelineSourceSchema),
  })
  .strict()
  .superRefine((f, ctx) => {
    const seen = new Set<string>();
    for (const s of f.sources) {
      if (seen.has(s.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate source id ${s.id}` });
      seen.add(s.id);
    }
  });
export type PipelineSourcesFile = z.infer<typeof PipelineSourcesFileSchema>;

export function parseSources(raw: unknown): PipelineSourcesFile {
  const r = PipelineSourcesFileSchema.safeParse(raw);
  if (!r.success) {
    throw new Error(`data/sources.json is invalid: ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  return r.data;
}

export async function loadSources(path: string): Promise<PipelineSourcesFile> {
  return parseSources(JSON.parse(await readFile(path, 'utf8')) as unknown);
}

/** Host of a URL without a leading www. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Registrable-ish domain (last two labels, or three for *.gov.ae / *.co.uk style). Used to judge independence. */
export function siteKey(url: string): string {
  const host = hostOf(url);
  const parts = host.split('.');
  if (parts.length >= 3 && ['gov', 'co', 'com', 'org', 'net', 'ac'].includes(parts[parts.length - 2] ?? '')) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

/** The configured source that owns `url`, if any. */
export function sourceForUrl(url: string, sources: readonly PipelineSource[]): PipelineSource | undefined {
  const host = hostOf(url);
  return sources.find((s) => s.domains.some((d) => host === d.replace(/^www\./, '') || host.endsWith(`.${d.replace(/^www\./, '')}`)));
}
