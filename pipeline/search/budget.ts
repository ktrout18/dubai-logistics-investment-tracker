/**
 * Wraps a SearchProvider with the per-run cap, cost accounting and a record of
 * every URL a search returned (grounding accepts only fetched or returned URLs).
 */
import { normaliseUrl } from '../../shared/index.ts';
import type { CostTracker } from '../cost.ts';
import type { Logger, SearchProvider, SearchQuery, SearchResult } from '../types.ts';

export type BudgetedSearchResult =
  | { ok: true; results: SearchResult[] }
  | { ok: false; reason: string; skipped: boolean };

export class SearchBudget {
  private used = 0;
  private readonly returned = new Set<string>();
  readonly log: { query: string; site?: string; results: number; error?: string }[] = [];

  constructor(
    private readonly provider: SearchProvider,
    private readonly cap: number,
    private readonly cost: CostTracker,
    private readonly logger: Logger,
  ) {}

  get available(): boolean {
    return this.provider.available;
  }
  get providerName(): string {
    return this.provider.name;
  }
  get searchesUsed(): number {
    return this.used;
  }
  returnedUrls(): ReadonlySet<string> {
    return this.returned;
  }

  /** Searches left under the cap. */
  get remaining(): number {
    return Math.max(0, this.cap - this.used);
  }

  /**
   * `reserve`: searches that must stay available for other work (later source
   * scans, rechecks). A search that would dip into them is skipped.
   */
  async search(q: SearchQuery, opts: { reserve?: number } = {}): Promise<BudgetedSearchResult> {
    if (!this.provider.available) return { ok: false, reason: `no search provider (${this.provider.name})`, skipped: true };
    if (this.used >= this.cap) return { ok: false, reason: `search cap reached (${this.cap})`, skipped: true };
    const reserve = opts.reserve ?? 0;
    if (reserve > 0 && this.cap - this.used <= reserve) {
      return { ok: false, reason: `search budget kept for source scans and rechecks (${this.cap - this.used} left, ${reserve} reserved)`, skipped: true };
    }
    this.used++;
    try {
      const r = await this.provider.search(q);
      this.cost.addSearch(this.provider.name, r.usage);
      for (const res of r.results) this.returned.add(normaliseUrl(res.url));
      this.log.push({ query: q.query, ...(q.site ? { site: q.site } : {}), results: r.results.length });
      return { ok: true, results: r.results };
    } catch (e) {
      const msg = (e as Error).message;
      this.logger.warn(`search failed (${q.site ?? 'web'}: ${q.query}): ${msg}`);
      this.log.push({ query: q.query, ...(q.site ? { site: q.site } : {}), results: 0, error: msg });
      return { ok: false, reason: msg, skipped: false };
    }
  }
}
