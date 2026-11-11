/**
 * Dead-source-URL checker. Politely requests every URL cited in the register
 * (HEAD, then GET when HEAD is refused or unsupported) and classifies:
 *   ok | dead (404/410/DNS) | blocked (401/403/429/451/challenge/robots/timeout) | error.
 * Results are warnings only; nothing is ever deleted or edited.
 */
import { normaliseUrl, type Project } from '../shared/index.ts';
import type { Fetcher } from './types.ts';

export type LinkStatus = 'ok' | 'dead' | 'blocked' | 'error';

export interface LinkResult {
  url: string;
  status: LinkStatus;
  httpStatus: number;
  detail: string;
  projectIds: string[];
}

export function citedUrls(projects: readonly Project[]): Map<string, { url: string; projectIds: Set<string> }> {
  const out = new Map<string, { url: string; projectIds: Set<string> }>();
  const add = (url: string | undefined, id: string) => {
    if (!url) return;
    const k = normaliseUrl(url);
    const e = out.get(k) ?? { url, projectIds: new Set<string>() };
    e.projectIds.add(id);
    out.set(k, e);
  };
  for (const p of projects) {
    p.sources.forEach((s) => add(s.url, p.id));
    p.events.forEach((e) => add(e.sourceUrl, p.id));
    add(p.latestMilestone.sourceUrl, p.id);
    add(p.originalAnnouncement?.sourceUrl, p.id);
    add(p.investment?.sourceUrl, p.id);
    add(p.actualCompletion?.sourceUrl, p.id);
    add(p.forecastCompletion?.sourceUrl, p.id);
    p.areas.forEach((a) => add(a.sourceUrl, p.id));
  }
  return out;
}

export function classify(outcome: string): LinkStatus {
  if (outcome === 'ok') return 'ok';
  if (outcome === 'dead') return 'dead';
  if (outcome === 'blocked' || outcome === 'robots_disallowed' || outcome === 'timeout') return 'blocked';
  if (outcome === 'not_text') return 'ok'; // e.g. a PDF that exists
  return 'error';
}

export async function checkLinks(projects: readonly Project[], fetcher: Fetcher, limit = Infinity): Promise<LinkResult[]> {
  const results: LinkResult[] = [];
  for (const { url, projectIds } of [...citedUrls(projects).values()].slice(0, limit)) {
    let r = await fetcher.head(url);
    // Many servers mishandle HEAD; confirm anything that is not clearly fine or clearly gone with one GET.
    if (r.outcome !== 'ok' && r.outcome !== 'dead' && r.outcome !== 'robots_disallowed') r = await fetcher.get(url);
    results.push({
      url,
      status: classify(r.outcome),
      httpStatus: r.status,
      detail: `${r.outcome}${r.note ? `: ${r.note}` : ''}`,
      projectIds: [...projectIds].sort(),
    });
  }
  return results;
}
