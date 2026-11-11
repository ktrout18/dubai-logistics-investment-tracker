/**
 * Date expressions found in text: "30 October 2026", "Oct 30, 2026", "2026-10-30",
 * "October 2026", "Q3 2026", "end of 2026", "H1 2027". Each match is turned into
 * a (date, precision) pair using the first-day-of-period convention.
 */
import type { DatePrecision } from '../shared/index.ts';

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

export interface DateMention {
  date: string;
  precision: DatePrecision;
  text: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

function valid(y: number, m: number, d: number): boolean {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** All date mentions in `text`, most specific first per position. */
export function findDates(text: string): DateMention[] {
  const out: DateMention[] = [];
  const t = text.toLowerCase();
  const push = (y: number, m: number, d: number, precision: DatePrecision, raw: string) => {
    if (valid(y, m, d)) out.push({ date: `${y}-${pad(m)}-${pad(d)}`, precision, text: raw });
  };
  const daySpans: [number, number][] = [];
  const day = (m: RegExpMatchArray, y: number, mo: number, d: number) => {
    daySpans.push([m.index!, m.index! + m[0].length]);
    push(y, mo, d, 'day', m[0]);
  };
  for (const m of t.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) day(m, +m[1]!, +m[2]!, +m[3]!);
  for (const m of t.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\.?,?\\s+(\\d{4})\\b`, 'g'))) {
    day(m, +m[3]!, MONTHS[m[2]!]!, +m[1]!);
  }
  for (const m of t.matchAll(new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'g'))) {
    day(m, +m[3]!, MONTHS[m[1]!]!, +m[2]!);
  }
  for (const m of t.matchAll(new RegExp(`\\b${MONTH_RE}\\.?,?\\s+(\\d{4})\\b`, 'g'))) {
    const start = m.index!;
    const end = start + m[0].length;
    if (daySpans.some(([a, b]) => start < b && end > a)) continue;
    push(+m[2]!, MONTHS[m[1]!]!, 1, 'month', m[0]);
  }
  for (const m of t.matchAll(/\b(?:q([1-4])|(first|second|third|fourth) quarter(?: of)?)\s*,?\s*(\d{4})\b/g)) {
    const q = m[1] ? +m[1] : ['first', 'second', 'third', 'fourth'].indexOf(m[2]!) + 1;
    push(+m[3]!, (q - 1) * 3 + 1, 1, 'quarter', m[0]);
  }
  for (const m of t.matchAll(/\b(?:h([12])|(first|second) half(?: of)?)\s*,?\s*(\d{4})\b/g)) {
    // Half-years have no precision of their own: record the year (coarser, never wrong).
    push(+m[3]!, 1, 1, 'year', m[0]);
  }
  for (const m of t.matchAll(/\b(?:in|by|during|end of|early|late|mid|mid-|before|after|from)\s+(\d{4})\b/g)) {
    push(+m[1]!, 1, 1, 'year', m[0]);
  }
  return out;
}

/** Parse a single date string from metadata (ISO timestamp or human date) into YYYY-MM-DD. */
export function parseLooseDate(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso && valid(+iso[1]!, +iso[2]!, +iso[3]!)) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const rfc = Date.parse(s);
  const days = findDates(s).filter((d) => d.precision === 'day');
  if (days[0]) return days[0].date;
  if (!Number.isNaN(rfc) && /\d{4}/.test(s)) return new Date(rfc).toISOString().slice(0, 10);
  return undefined;
}

/** Days between two ISO dates (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
