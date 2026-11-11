/**
 * Token / search accounting and the USD estimate shown in the run report.
 * Prices come from config (list prices); unknown models are reported, not guessed.
 */
import type { PipelineConfig } from './config.ts';
import type { LlmUsage, SearchUsage } from './types.ts';

export interface ModelTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  costUsd: number;
}

export interface CostReport {
  byModel: Record<string, ModelTotals>;
  webSearches: number;
  webSearchCostUsd: number;
  /** Searches through a non-Anthropic backend (priced by that provider's plan, not included). */
  otherProviderSearches: number;
  unpricedModels: string[];
  totalUsd: number;
}

export class CostTracker {
  private readonly byModel = new Map<string, ModelTotals>();
  private webSearches = 0;
  private otherSearches = 0;

  constructor(private readonly config: Pick<PipelineConfig, 'prices' | 'webSearchPricePerSearch'>) {}

  private totals(model: string): ModelTotals {
    let t = this.byModel.get(model);
    if (!t) {
      t = { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUsd: 0 };
      this.byModel.set(model, t);
    }
    return t;
  }

  addLlm(usages: readonly LlmUsage[], countCall = true): void {
    usages.forEach((u, i) => {
      const t = this.totals(u.model);
      if (countCall && i === 0) t.calls++;
      t.inputTokens += u.inputTokens;
      t.outputTokens += u.outputTokens;
      t.cacheReadInputTokens += u.cacheReadInputTokens ?? 0;
      t.cacheCreationInputTokens += u.cacheCreationInputTokens ?? 0;
    });
  }

  addSearch(provider: string, u: SearchUsage): void {
    if (provider === 'anthropic') {
      this.webSearches += u.searches;
      if (u.model) {
        const t = this.totals(u.model);
        t.calls++;
        t.inputTokens += u.inputTokens;
        t.outputTokens += u.outputTokens;
      }
    } else {
      this.otherSearches += u.searches;
    }
  }

  report(): CostReport {
    const byModel: Record<string, ModelTotals> = {};
    const unpriced: string[] = [];
    let total = 0;
    for (const [model, t] of [...this.byModel.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const price = this.config.prices[model];
      let cost = 0;
      if (price) {
        // Cache reads bill at 0.1x and cache writes at 1.25x the input price.
        cost =
          (t.inputTokens * price.inputPerMTok +
            t.cacheReadInputTokens * price.inputPerMTok * 0.1 +
            t.cacheCreationInputTokens * price.inputPerMTok * 1.25 +
            t.outputTokens * price.outputPerMTok) /
          1_000_000;
      } else if (t.inputTokens + t.outputTokens > 0) unpriced.push(model);
      byModel[model] = { ...t, costUsd: round6(cost) };
      total += cost;
    }
    const searchCost = this.webSearches * this.config.webSearchPricePerSearch;
    total += searchCost;
    return {
      byModel,
      webSearches: this.webSearches,
      webSearchCostUsd: round6(searchCost),
      otherProviderSearches: this.otherSearches,
      unpricedModels: unpriced,
      totalUsd: round6(total),
    };
  }
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
