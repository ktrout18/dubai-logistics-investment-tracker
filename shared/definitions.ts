/**
 * The ONE place where delivery status and aggregate eligibility are defined.
 * Every view (headline, figure cards, tables, project pages, the briefing
 * snapshot, the method page and the CSV export) uses these labels and
 * helpers; nothing else re-derives them.
 *
 * Pure; no I/O.
 */
import type { AssetType, Investment, InvestmentScope, Project, ProjectStatus } from './schema.ts';
import { ASSET_TYPES, INVESTMENT_SCOPE_LABELS } from './schema.ts';
import { roundTo } from './units.ts';

// ---------------------------------------------------------------------------
// Delivery status
// ---------------------------------------------------------------------------

/** The two kinds of delivery. They are always shown and counted separately. */
export const DELIVERY_KINDS = ['opened', 'construction_completed'] as const;
export type DeliveryKind = (typeof DELIVERY_KINDS)[number];

export const DELIVERY_LABELS: Record<DeliveryKind, string> = {
  opened: 'Opened / operational',
  construction_completed: 'Construction completed',
};

/** Plain-language definitions, shown on the method page and in the docs. */
export const DELIVERY_DEFINITIONS: Record<DeliveryKind, string> = {
  opened:
    'Status "operational": a source explicitly reports the opening, inauguration or start of operations of this facility.',
  construction_completed:
    'Status "construction completed": a source reports that construction is complete (or the facility is being commissioned) but no source reports that it has opened or is operating. Never counted as opened.',
};

/** Where evidence establishes neither, the record keeps its lower status and is not counted as delivered. */
export const NOT_DELIVERED_DEFINITION =
  'Where the evidence establishes neither, the project keeps its lower status (for example under construction) and is not counted as delivered. Open doubts stay visible as unresolved questions, confidence and review items.';

const STATUS_TO_DELIVERY: Partial<Record<ProjectStatus, DeliveryKind>> = {
  operational: 'opened',
  construction_completed: 'construction_completed',
};

/** The delivery kind a status stands for, or undefined when the project is not delivered. */
export function deliveryKindOf(p: Pick<Project, 'status'>): DeliveryKind | undefined {
  return STATUS_TO_DELIVERY[p.status];
}

// ---------------------------------------------------------------------------
// Asset groups
// ---------------------------------------------------------------------------

/**
 * Asset types whose floor space counts as WAREHOUSE space (the Grade-A,
 * probable Grade-A and other-modern warehouse figures). Logistics parks are
 * included because their phases are warehouse buildings.
 */
export const WAREHOUSE_ASSET_TYPES = [
  'warehouse',
  'distribution_centre',
  'fulfilment_centre',
  'cold_store',
  'dangerous_goods_store',
  'logistics_park',
] as const satisfies readonly AssetType[];

/**
 * Everything else is OTHER LOGISTICS INFRASTRUCTURE: container depots and
 * terminals, bulk-liquid terminals, air-cargo terminals and MRO facilities,
 * vehicle-processing hubs, open yards, inland ports and mixed industrial
 * schemes. Counted on its own and never added to warehouse floor space.
 */
export const OTHER_INFRASTRUCTURE_ASSET_TYPES: readonly AssetType[] = ASSET_TYPES.filter(
  (t) => !(WAREHOUSE_ASSET_TYPES as readonly AssetType[]).includes(t),
);

export type AssetGroup = 'warehouse' | 'other_infrastructure';
export const ASSET_GROUP_LABELS: Record<AssetGroup, string> = {
  warehouse: 'Warehouse space',
  other_infrastructure: 'Other logistics infrastructure',
};

export function isWarehouseAsset(p: Pick<Project, 'assetType'>): boolean {
  return (WAREHOUSE_ASSET_TYPES as readonly AssetType[]).includes(p.assetType);
}

export function assetGroupOf(p: Pick<Project, 'assetType'>): AssetGroup {
  return isWarehouseAsset(p) ? 'warehouse' : 'other_infrastructure';
}

// ---------------------------------------------------------------------------
// Aggregate eligibility
// ---------------------------------------------------------------------------

/**
 * Eligibility rules for every aggregate (headline, cards, snapshot counts and
 * subtotals). Shown verbatim on the method page; `computeMetrics` and
 * `computeBriefing` implement them via `eligibleProjects` and
 * `isDeliveredInYear`.
 */
export const ELIGIBILITY_RULES: readonly string[] = [
  'Dubai only. Projects in other emirates are regional context and never enter a Dubai figure.',
  'Umbrellas are never counted. When a park is delivered in phases, each phase counts; the umbrella record holds park-level figures for reference only.',
  'Cancelled projects are excluded.',
  '"Warehouse space" figures include only warehouse-type assets (warehouses, distribution and fulfilment centres, cold stores, dangerous-goods stores and logistics parks). Container depots, terminals, air-cargo and MRO facilities, vehicle hubs and open yards are counted separately as other logistics infrastructure.',
  'Delivered in a year requires a sourced actual completion date in that year and a status of construction completed or operational. A forecast date never counts.',
  'Areas: one figure per facility, on the basis the source states. GFA, GLA, built-up (mixed use) and basis-not-stated figures are subtotalled separately and never added together. Site, land, yard and district areas are never floor space.',
  'Investment: amounts are summed per currency, only where the amount covers the logistics facility itself. Amounts that also cover land, offices, a headquarters or a wider complex, or whose scope is not established, are listed separately and never summed.',
];

/** Umbrella ids: projects named as the parent of at least one other project. */
function umbrellaIds(all: readonly Pick<Project, 'parentId'>[]): Set<string> {
  const s = new Set<string>();
  for (const p of all) if (p.parentId) s.add(p.parentId);
  return s;
}

/** Projects that may enter Dubai aggregates: Dubai, not an umbrella, not cancelled. */
export function eligibleProjects<T extends Pick<Project, 'id' | 'parentId' | 'emirate' | 'status'>>(all: readonly T[]): T[] {
  const umbrellas = umbrellaIds(all);
  return all.filter((p) => p.emirate === 'Dubai' && !umbrellas.has(p.id) && p.status !== 'cancelled');
}

// ---------------------------------------------------------------------------
// Investment scope
// ---------------------------------------------------------------------------

/** Scope of a disclosed amount; a missing scope counts as unknown. */
export function investmentScopeOf(inv: Pick<Investment, 'scope'> | undefined): InvestmentScope {
  return inv?.scope ?? 'unknown';
}

export interface CurrencyTotal {
  /** Sum of `investment.amount` in this currency (full units, not millions). */
  total: number;
  projectIds: string[];
}

export interface ScopedAmount {
  projectId: string;
  amount: number;
  currency: string;
  scope: Exclude<InvestmentScope, 'facility'>;
  scopeLabel: string;
  /** The record's own note on what the amount covers. */
  basis: string;
}

export interface InvestmentSums {
  /** Facility-scope amounts summed per currency. Currencies are never converted or combined. */
  facilityByCurrency: Record<string, CurrencyTotal>;
  /** Disclosed amounts that are wider than the facility or of unknown scope: listed, never summed. */
  notSummed: ScopedAmount[];
  /** Projects with no disclosed amount (no investment record, or an undisclosed one). */
  undisclosedIds: string[];
}

/** Investment sums for a set of projects (facility scope only; see ELIGIBILITY_RULES). */
export function sumInvestments(projects: readonly Pick<Project, 'id' | 'investment'>[]): InvestmentSums {
  const facilityByCurrency: Record<string, CurrencyTotal> = {};
  const notSummed: ScopedAmount[] = [];
  const undisclosedIds: string[] = [];
  for (const p of projects) {
    const inv = p.investment;
    if (!inv?.disclosed || inv.amount === undefined || !inv.currency) {
      undisclosedIds.push(p.id);
      continue;
    }
    const scope = investmentScopeOf(inv);
    if (scope === 'facility') {
      const t = (facilityByCurrency[inv.currency] ??= { total: 0, projectIds: [] });
      t.total += inv.amount;
      t.projectIds.push(p.id);
    } else {
      notSummed.push({
        projectId: p.id,
        amount: inv.amount,
        currency: inv.currency,
        scope,
        scopeLabel: INVESTMENT_SCOPE_LABELS[scope],
        basis: inv.basis,
      });
    }
  }
  for (const t of Object.values(facilityByCurrency)) t.total = roundTo(t.total, 2);
  return { facilityByCurrency, notSummed, undisclosedIds };
}
