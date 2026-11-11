/**
 * Shared list filters. State lives in the hash query string so every filtered
 * view is a shareable URL, e.g. `#/delivered?zone=Jafza&grade=confirmed`.
 */
import {
  companyKey,
  normaliseZone,
  yearOf,
  type GradeAStatus,
  type Project,
  type ProjectStatus,
  type Sector,
} from '../../shared/index.ts';
import { sizeBandOf, type SizeBandId } from './areas.ts';

export interface Filters {
  /** Reporting year as a string, or 'all'. Absent = view default. */
  year?: string;
  zone?: string;
  sector?: Sector;
  grade?: GradeAStatus;
  status?: ProjectStatus;
  company?: string;
  size?: SizeBandId;
  q?: string;
}

/** Order of keys in the URL (stable so links do not churn). */
export const FILTER_KEYS = ['year', 'zone', 'sector', 'grade', 'status', 'company', 'size', 'q'] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

export function parseFilters(params: URLSearchParams): Filters {
  const f: Filters = {};
  for (const k of FILTER_KEYS) {
    const v = params.get(k)?.trim();
    if (v) (f as Record<string, string>)[k] = v;
  }
  return f;
}

/** Filters → query params; empty values omitted, keys in FILTER_KEYS order. Other params in `base` are kept. */
export function filtersToParams(f: Filters, base?: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams();
  if (base) for (const [k, v] of base) if (!(FILTER_KEYS as readonly string[]).includes(k)) out.set(k, v);
  for (const k of FILTER_KEYS) {
    const v = f[k];
    if (v !== undefined && String(v).trim() !== '') out.set(k, String(v).trim());
  }
  return out;
}

export function activeFilterCount(f: Filters, ignore: readonly FilterKey[] = ['year']): number {
  return FILTER_KEYS.filter((k) => !ignore.includes(k) && f[k] !== undefined && f[k] !== '').length;
}

function haystack(p: Project): string {
  return [
    p.name,
    p.facilityName,
    p.summary,
    p.location,
    p.zone,
    p.developer,
    p.operator,
    p.investor,
    p.owner,
    ...p.companies,
    p.presentation?.descriptor,
    p.presentation?.locationLabel,
    ...(p.presentation?.partners ?? []),
  ]
    .filter(Boolean)
    .join(' \u0001 ')
    .toLowerCase();
}

export interface ApplyOptions {
  /** Which date the year filter tests. 'none' ignores the year filter. */
  yearField: 'actualCompletion' | 'none';
}

/** Apply every filter except year according to `opts`. Pure. */
export function applyFilters(projects: readonly Project[], f: Filters, opts: ApplyOptions): Project[] {
  const q = f.q?.toLowerCase().split(/\s+/).filter(Boolean) ?? [];
  const zone = f.zone ? normaliseZone(f.zone) : undefined;
  const company = f.company ? companyKey(f.company) : undefined;
  const year = f.year && f.year !== 'all' ? Number(f.year) : undefined;
  return projects.filter((p) => {
    if (opts.yearField === 'actualCompletion' && year !== undefined) {
      if (!p.actualCompletion || yearOf(p.actualCompletion.date) !== year) return false;
    }
    if (zone && normaliseZone(p.zone ?? '') !== zone) return false;
    if (f.sector && !p.sectors.includes(f.sector)) return false;
    if (f.grade && p.gradeA !== f.grade) return false;
    if (f.status && p.status !== f.status) return false;
    if (company && !p.companies.some((c) => companyKey(c) === company)) return false;
    if (f.size && sizeBandOf(p) !== f.size) return false;
    if (q.length) {
      const h = haystack(p);
      if (!q.every((t) => h.includes(t))) return false;
    }
    return true;
  });
}

/** Distinct normalised zones present in `projects`, sorted. */
export function zoneOptions(projects: readonly Project[]): string[] {
  const s = new Set<string>();
  for (const p of projects) if (p.zone) s.add(normaliseZone(p.zone));
  return [...s].sort((a, b) => a.localeCompare(b));
}

/** Distinct company names (first spelling seen per company key), sorted. */
export function companyOptions(projects: readonly Project[]): string[] {
  const m = new Map<string, string>();
  for (const p of projects) for (const c of p.companies) if (!m.has(companyKey(c))) m.set(companyKey(c), c);
  return [...m.values()].sort((a, b) => a.localeCompare(b));
}
