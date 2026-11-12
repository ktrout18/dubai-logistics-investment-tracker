/**
 * Second investment view for the Overview: the facilities behind the year's
 * delivery and pipeline figures. Sums use the shared `sumInvestments`
 * (facility-scope amounts only, per currency; never converted or combined).
 */
import type { Metrics } from '../../shared/index.ts';

/** Ids of eligible Dubai projects delivered in `metrics.year`, under construction now, or committed now. */
export function activeFacilityIds(m: Metrics): string[] {
  const ids = [...m.delivered.all.projectIds, ...m.underConstruction.all.projectIds, ...m.committedNotStarted.projectIds];
  return [...new Set(ids)];
}
