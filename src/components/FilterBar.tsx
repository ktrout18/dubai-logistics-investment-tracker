import { useId, useMemo, useState } from 'react';
import {
  GRADE_A_LABELS,
  GRADE_A_STATUSES,
  PROJECT_STATUS_LABELS,
  SECTOR_LABELS,
  SECTORS,
  type Project,
  type ProjectStatus,
} from '../../shared/index.ts';
import { SIZE_BANDS } from '../lib/areas.ts';
import { activeFilterCount, companyOptions, filtersToParams, parseFilters, zoneOptions, type FilterKey, type Filters } from '../lib/filters.ts';
import { hrefFor, useHashLocation } from '../lib/router.ts';

interface Props {
  /** Projects the option lists are built from. */
  pool: Project[];
  fields: FilterKey[];
  years?: number[];
  /** Year shown when the URL has none. */
  defaultYear?: number;
  statuses?: readonly ProjectStatus[];
  allowAllYears?: boolean;
}

export function useFilters(): Filters {
  const { params } = useHashLocation();
  return useMemo(() => parseFilters(params), [params]);
}

export function FilterBar({ pool, fields, years = [], defaultYear, statuses, allowAllYears = true }: Props) {
  const { path, params, navigate } = useHashLocation();
  const f = parseFilters(params);
  const id = useId();
  const zones = useMemo(() => zoneOptions(pool), [pool]);
  const companies = useMemo(() => companyOptions(pool), [pool]);
  const set = (k: FilterKey, v: string) => {
    const next: Filters = { ...f, [k]: v || undefined };
    navigate(hrefFor(path, filtersToParams(next, params)), { replace: true });
  };
  const clear = () => {
    const keep: Filters = fields.includes('year') && f.year ? { year: f.year } : {};
    navigate(hrefFor(path, filtersToParams(keep, params)), { replace: true });
  };
  const n = activeFilterCount(f);
  const [open, setOpen] = useState(false);
  const has = (k: FilterKey) => fields.includes(k);

  const sel = (k: FilterKey, label: string, opts: [string, string][], allLabel = 'All') => (
    <div className={`min-w-0 ${open ? '' : 'hidden sm:block'}`}>
      <label htmlFor={`${id}-${k}`} className="mb-1 block text-xs font-medium text-ink-muted">
        {label}
      </label>
      <select id={`${id}-${k}`} className="field" value={(f[k] as string | undefined) ?? ''} onChange={(e) => set(k, e.target.value)}>
        <option value="">{allLabel}</option>
        {opts.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <form
      role="search"
      aria-label="Filter projects"
      className="no-print card mb-5 p-4"
      onSubmit={(e) => e.preventDefault()}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {has('q') && (
          <div className="sm:col-span-2 lg:col-span-2">
            <label htmlFor={`${id}-q`} className="mb-1 block text-xs font-medium text-ink-muted">
              Search
            </label>
            <input
              id={`${id}-q`}
              type="search"
              className="field"
              placeholder="Facility, company, location…"
              value={f.q ?? ''}
              onChange={(e) => set('q', e.target.value)}
            />
          </div>
        )}
        {has('year') && (
          <div className={open ? '' : 'hidden sm:block'}>
            <label htmlFor={`${id}-year`} className="mb-1 block text-xs font-medium text-ink-muted">
              Year opened / completed
            </label>
            <select
              id={`${id}-year`}
              className="field"
              value={f.year ?? String(defaultYear ?? 'all')}
              onChange={(e) => set('year', e.target.value)}
            >
              {allowAllYears && <option value="all">All years</option>}
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        )}
        {has('zone') && sel('zone', 'Industrial zone', zones.map((z) => [z, z]))}
        {has('sector') && sel('sector', 'Sector', SECTORS.map((s) => [s, SECTOR_LABELS[s]]))}
        {has('grade') && sel('grade', 'Grade-A classification', GRADE_A_STATUSES.map((g) => [g, GRADE_A_LABELS[g]]))}
        {has('status') && statuses && sel('status', 'Status', statuses.map((s) => [s, PROJECT_STATUS_LABELS[s]]))}
        {has('company') && sel('company', 'Company', companies.map((c) => [c, c]))}
        {has('size') && sel('size', 'Development size (area)', SIZE_BANDS.map((b) => [b.id, b.label]), 'Any size')}
      </div>
      <button
        type="button"
        className="btn mt-3 sm:hidden"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? 'Hide filters' : `More filters${n ? ` (${n} active)` : ''}`}
      </button>
      {n > 0 && (
        <div className="mt-3 flex items-center gap-3 text-sm">
          <span className="text-ink-muted">
            {n} filter{n === 1 ? '' : 's'} active
          </span>
          <button type="button" className="btn py-1" onClick={clear}>
            Clear filters
          </button>
        </div>
      )}
    </form>
  );
}
