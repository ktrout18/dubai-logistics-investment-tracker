/**
 * Second investment view for the Overview: disclosed values of the facilities
 * behind the year's delivery and pipeline figures. Values are summed per
 * currency only; currencies are never converted or combined.
 */
import { roundTo, type Metrics, type Project } from '../../shared/index.ts';

export interface CurrencySums {
  /** Project ids in scope (delivered in year, under construction now, committed now). */
  scopeIds: string[];
  byCurrency: Record<string, { total: number; projectIds: string[] }>;
  /** In scope, with an investment record that has no disclosed value, or no record at all. */
  undisclosedIds: string[];
}

/** Ids of countable Dubai projects delivered in `metrics.year`, under construction now, or committed now. */
export function activeFacilityIds(m: Metrics): string[] {
  const ids = [
    ...m.gradeADelivered.projectIds,
    ...m.gradeAProbableDelivered.projectIds,
    ...m.otherModernDelivered.projectIds,
    ...m.underConstruction.all.projectIds,
    ...m.committedNotStarted.projectIds,
  ];
  return [...new Set(ids)];
}

export function disclosedInvestmentByCurrency(ids: readonly string[], byId: ReadonlyMap<string, Project>): CurrencySums {
  const byCurrency: CurrencySums['byCurrency'] = {};
  const undisclosedIds: string[] = [];
  for (const id of ids) {
    const inv = byId.get(id)?.investment;
    if (inv?.disclosed && inv.amount !== undefined && inv.currency) {
      const t = (byCurrency[inv.currency] ??= { total: 0, projectIds: [] });
      t.total += inv.amount;
      t.projectIds.push(id);
    } else undisclosedIds.push(id);
  }
  for (const t of Object.values(byCurrency)) t.total = roundTo(t.total, 2);
  return { scopeIds: [...ids], byCurrency, undisclosedIds };
}
