/**
 * The ONE set of display formatters used by every view (site pages, the
 * briefing snapshot and its print output, headline sentences built in
 * `briefing.ts`). Pure functions; no DOM or Node APIs.
 *
 * Rounding rule: areas are shown in whole square metres (half away from zero
 * on the stored value, e.g. 10,405.14 → "10,405 m²", 26,012.85 → "26,013 m²"),
 * with thousands separators. No view rounds further (no "about 262,000").
 * Totals are summed from the stored values first and rounded once for display.
 */
import type { AreaBasis, AreaMeasure, AreaQualifier, AreaUnit, DatePrecision } from './schema.ts';
import { AREA_QUALIFIER_LABELS } from './schema.ts';

const NF0 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const NF1 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

/** Whole number with thousands separators: 49981.84 → "49,982". */
export function formatNumber(n: number): string {
  return NF0.format(Math.round(n));
}

/** Square metres, whole m²: 49981.84 → "49,982 m²". */
export function formatM2(n: number): string {
  return `${formatNumber(n)} m²`;
}

/** A measure's figure with the source's own qualifier: "over 67,000 m²", "nearly 20,000 m²", "81,000 m²". */
export function formatMeasureM2(a: { valueM2: number; qualifier?: AreaQualifier }): string {
  return `${a.qualifier ? `${AREA_QUALIFIER_LABELS[a.qualifier]} ` : ''}${formatM2(a.valueM2)}`;
}

/**
 * Short basis tags, used on every figure in every view (cards, tables,
 * project pages, snapshot rows and subtotals). Full labels: AREA_BASIS_LABELS.
 */
export const AREA_BASIS_SHORT: Record<AreaBasis, string> = {
  warehouse_gfa: 'GFA',
  gla: 'GLA',
  mixed_building_area: 'Built-up (mixed use)',
  site_land_area: 'Site / land',
  open_yard: 'Open yard',
  district_area: 'District',
  unspecified: 'Basis not stated',
};

/** "49,982 m² GFA", "over 67,000 m² Basis not stated". */
export function formatArea(a: Pick<AreaMeasure, 'valueM2' | 'basis'> & { qualifier?: AreaQualifier }): string {
  return `${formatMeasureM2(a)} ${AREA_BASIS_SHORT[a.basis]}`;
}

const UNIT_SHORT: Record<AreaUnit, string> = { sqm: 'm²', sqft: 'sq ft', hectare: 'ha', acre: 'acres' };

/** The figure as the source gave it: "538,000 sq ft". */
export function formatOriginal(value: number, unit: AreaUnit): string {
  const v = Number.isInteger(value) ? NF0.format(value) : NF1.format(value);
  return `${v} ${UNIT_SHORT[unit]}`;
}

/** Money in full units → "AED 250 m", "USD 5.1 bn", "EUR 750,000". */
export function formatMoney(amount: number, currency: string): string {
  if (amount >= 1e9) return `${currency} ${NF1.format(amount / 1e9)} bn`;
  if (amount >= 1e6) return `${currency} ${NF1.format(amount / 1e6)} m`;
  return `${currency} ${NF0.format(amount)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** ISO date at its stored precision: "15 Mar 2026", "Mar 2026", "Q1 2026", "2026". */
export function formatDate(iso: string, precision: DatePrecision = 'day'): string {
  const y = iso.slice(0, 4);
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  switch (precision) {
    case 'day':
      return `${d} ${MONTHS[m - 1] ?? ''} ${y}`;
    case 'month':
      return `${MONTHS[m - 1] ?? ''} ${y}`;
    case 'quarter':
      return `Q${Math.floor((m - 1) / 3) + 1} ${y}`;
    case 'year':
      return y;
  }
}

/** "1 project" / "3 projects". */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${formatNumber(n)} ${n === 1 ? singular : pluralForm}`;
}
