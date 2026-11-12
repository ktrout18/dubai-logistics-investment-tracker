/**
 * Display formatters. Pure functions, no DOM access, so they are unit-tested.
 */
import { AREA_BASIS_SHORT, formatNumber } from '../../shared/index.ts';

// The one set of number, area, money and date formatters lives in shared/format.ts
// so the site, the snapshot and the briefing model all use the same rounding.
export {
  AREA_BASIS_SHORT,
  formatArea,
  formatDate,
  formatM2,
  formatMeasureM2,
  formatMoney,
  formatNumber,
  formatOriginal,
  plural,
} from '../../shared/index.ts';

/** Short basis labels (alias of the shared AREA_BASIS_SHORT). */
export const BASIS_SHORT = AREA_BASIS_SHORT;

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

/** Hostname for a source link label, e.g. "mediaoffice.ae". */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
