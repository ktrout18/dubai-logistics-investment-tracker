/**
 * Rotating recheck of active projects: each run searches for status news on
 * the N active projects (not operational / cancelled) that were checked least
 * recently, oldest `lastVerified` first. Results go through the normal
 * fetch → extract → ground → decide path, tagged with the project id.
 */
import type { Project } from '../shared/index.ts';
import type { ListItem } from './discovery.ts';
import type { SearchBudget } from './search/budget.ts';
import { sourceForUrl, type PipelineSource } from './sources.ts';
import type { PipelineState } from './store.ts';

const INACTIVE = new Set(['operational', 'cancelled']);

export function selectRecheck(projects: readonly Project[], state: PipelineState, n: number): Project[] {
  if (n <= 0) return [];
  return projects
    .filter((p) => !INACTIVE.has(p.status))
    .sort((a, b) => {
      const ca = state.recheck[a.id] ?? '';
      const cb = state.recheck[b.id] ?? '';
      if (ca !== cb) return ca.localeCompare(cb);
      if (a.lastVerified !== b.lastVerified) return a.lastVerified.localeCompare(b.lastVerified);
      return a.id.localeCompare(b.id);
    })
    .slice(0, n);
}

export function recheckQuery(p: Project): string {
  const who = p.operator ?? p.developer ?? p.investor ?? p.owner ?? '';
  const where = p.zone ?? p.location;
  return `"${p.facilityName ?? p.name}" ${who} ${where} opening OR construction OR completed OR agreement`.replace(/\s+/g, ' ').trim();
}

export interface RecheckItems {
  project: Project;
  /** Items grouped by the configured source that owns them; results on unknown sites are dropped. */
  bySource: { source: PipelineSource; items: ListItem[] }[];
  dropped: string[];
  error?: string;
}

export async function recheckSearch(
  p: Project,
  search: SearchBudget,
  sources: readonly PipelineSource[],
  max: number,
): Promise<RecheckItems> {
  const r = await search.search({ query: recheckQuery(p), after: p.lastVerified, max });
  if (!r.ok) return { project: p, bySource: [], dropped: [], error: r.reason };
  const groups = new Map<string, { source: PipelineSource; items: ListItem[] }>();
  const dropped: string[] = [];
  for (const res of r.results) {
    const src = sourceForUrl(res.url, sources);
    if (!src || !src.enabled) {
      dropped.push(res.url);
      continue;
    }
    const g = groups.get(src.id) ?? { source: src, items: [] };
    g.items.push({ url: res.url, title: res.title, ...(res.snippet ? { snippet: res.snippet } : {}) });
    groups.set(src.id, g);
  }
  return { project: p, bySource: [...groups.values()], dropped };
}
