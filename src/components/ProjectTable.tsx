import { useMemo, type ReactNode } from 'react';
import type { Project } from '../../shared/index.ts';
import { hrefFor, useHashLocation } from '../lib/router.ts';

export interface Column {
  id: string;
  header: string;
  cell: (p: Project) => ReactNode;
  /** Sort key; columns without one are not sortable. */
  sort?: (p: Project) => string | number | undefined;
  /** Shown on mobile cards (with the header as label). */
  mobile?: boolean;
  className?: string;
  align?: 'right';
}

interface Props {
  projects: Project[];
  columns: Column[];
  caption: string;
  defaultSort?: { id: string; dir: 'asc' | 'desc' };
  /** URL param prefix so several tables on one page sort independently. */
  sortKey?: string;
  empty?: ReactNode;
}

function compare(a: string | number | undefined, b: string | number | undefined): number {
  const ae = a === undefined || a === '';
  const be = b === undefined || b === '';
  if (ae && be) return 0;
  if (ae) return 1; // blanks last regardless of direction
  if (be) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'en', { sensitivity: 'base', numeric: true });
}

export function ProjectTable({ projects, columns, caption, defaultSort, sortKey = 'sort', empty }: Props) {
  const { path, params, navigate } = useHashLocation();
  const raw = params.get(sortKey);
  const [sid, sdir] = raw ? (raw.split(':') as [string, string | undefined]) : [defaultSort?.id, defaultSort?.dir];
  const sortCol = columns.find((c) => c.id === sid && c.sort);
  const dir = sdir === 'desc' ? 'desc' : 'asc';

  const rows = useMemo(() => {
    if (!sortCol?.sort) return projects;
    const get = sortCol.sort;
    const sorted = [...projects].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      const blankA = va === undefined || va === '';
      const blankB = vb === undefined || vb === '';
      if (blankA || blankB) return compare(va, vb);
      const c = compare(va, vb);
      return dir === 'desc' ? -c : c;
    });
    return sorted;
  }, [projects, sortCol, dir]);

  const setSort = (id: string) => {
    const next = new URLSearchParams(params);
    const nextDir = sortCol?.id === id && dir === 'asc' ? 'desc' : sortCol?.id === id ? 'asc' : 'asc';
    next.set(sortKey, `${id}:${nextDir}`);
    navigate(hrefFor(path, next), { replace: true });
  };

  if (projects.length === 0) return <>{empty}</>;

  const primary = columns[0]!;
  return (
    <>
      {/* Desktop / tablet table */}
      <div className="card hidden overflow-x-auto md:block">
        <table className="data-table">
          <caption>{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sortCol?.id === c.id;
                return (
                  <th
                    key={c.id}
                    scope="col"
                    className={`${c.align === 'right' ? 'text-right' : ''} ${c.className ?? ''}`}
                    aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : c.sort ? 'none' : undefined}
                  >
                    {c.sort ? (
                      <button
                        type="button"
                        onClick={() => setSort(c.id)}
                        className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink ${active ? 'text-ink' : ''}`}
                      >
                        {c.header}
                        <span aria-hidden="true" className={`text-[10px] ${active ? 'opacity-100' : 'opacity-30'}`}>
                          {active ? (dir === 'asc' ? '▲' : '▼') : '▲▼'}
                        </span>
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                {columns.map((c, i) =>
                  i === 0 ? (
                    <th key={c.id} scope="row" className={`border-b border-line px-2.5 py-2.5 text-left align-top font-normal ${c.className ?? ''}`}>
                      {c.cell(p)}
                    </th>
                  ) : (
                    <td key={c.id} className={`${c.align === 'right' ? 'text-right num' : ''} ${c.className ?? ''}`}>
                      {c.cell(p)}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor={`${sortKey}-m`} className="text-ink-muted">
            Sort by
          </label>
          <select
            id={`${sortKey}-m`}
            className="field w-auto"
            value={sortCol ? `${sortCol.id}:${dir}` : ''}
            onChange={(e) => {
              const next = new URLSearchParams(params);
              if (e.target.value) next.set(sortKey, e.target.value);
              else next.delete(sortKey);
              navigate(hrefFor(path, next), { replace: true });
            }}
          >
            <option value="">Register order</option>
            {columns
              .filter((c) => c.sort)
              .flatMap((c) => [
                <option key={`${c.id}a`} value={`${c.id}:asc`}>
                  {c.header} (ascending)
                </option>,
                <option key={`${c.id}d`} value={`${c.id}:desc`}>
                  {c.header} (descending)
                </option>,
              ])}
          </select>
        </div>
        <ul className="space-y-3" aria-label={caption}>
          {rows.map((p) => (
            <li key={p.id} className="card p-4">
              <div className="text-[15px]">{primary.cell(p)}</div>
              <dl className="mt-3 grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-2 text-sm">
                {columns
                  .slice(1)
                  .filter((c) => c.mobile)
                  .map((c) => (
                    <div key={c.id} className="contents">
                      <dt className="text-ink-soft">{c.header}</dt>
                      <dd className="min-w-0 break-words">{c.cell(p)}</dd>
                    </div>
                  ))}
              </dl>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
