/**
 * Display formatters. Pure functions, no DOM access, so they are unit-tested.
 */
import type { AreaBasis, AreaMeasure, AreaUnit, DatePrecision } from '../../shared/index.ts';

const NF0 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const NF1 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

/** 49981.84 → "49,982". */
export function formatNumber(n: number): string {
  return NF0.format(Math.round(n));
}

/** 49981.84 → "49,982 m²". */
export function formatM2(n: number): string {
  return `${formatNumber(n)} m²`;
}

/** Rounded to the nearest 1,000 for prose: 261_840 → "262,000 m²"; under 1,000 stays exact. */
export function formatApproxM2(n: number): string {
  if (n < 1000) return formatM2(n);
  return `${NF0.format(Math.round(n / 1000) * 1000)} m²`;
}

/** Short basis labels for compact display (full labels live in AREA_BASIS_LABELS). */
export const BASIS_SHORT: Record<AreaBasis, string> = {
  warehouse_gfa: 'GFA',
  gla: 'GLA',
  mixed_building_area: 'Mixed building area',
  site_land_area: 'Land / site',
  open_yard: 'Open yard',
  district_area: 'District',
  unspecified: 'Basis not stated by source',
};

/** "49,982 m² GFA". */
export function formatArea(a: Pick<AreaMeasure, 'valueM2' | 'basis'>): string {
  return `${formatM2(a.valueM2)} ${BASIS_SHORT[a.basis]}`;
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

/** ISO date honouring its precision: "15 Mar 2026", "Mar 2026", "Q1 2026", "2026". */
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

/** Sortable key for an ISO date (dates are first-of-period, so plain string order works). */
export function dateKey(iso: string | undefined): string {
  return iso ?? '';
}

/** Timestamp shown in Dubai time: "11 Nov 2026, 10:00 Dubai time". */
export function formatDubaiDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dubai',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')} ${get('month')} ${get('year')}, ${get('hour')}:${get('minute')} Dubai time`;
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** 1 → "one" … 10 → "ten"; larger numbers as digits. */
export function numberWord(n: number): string {
  return WORDS[n] ?? formatNumber(n);
}

/** "1 project" / "3 projects". */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${formatNumber(n)} ${n === 1 ? singular : pluralForm}`;
}

/** Hostname for a source link label, e.g. "mediaoffice.ae". */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
