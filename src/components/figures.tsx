import type { ReactNode } from 'react';
import { AREA_BASIS_LABELS, FLOOR_FIGURE_BASES, type FloorSpace } from '../../shared/index.ts';
import { BASIS_SHORT, formatM2, plural } from '../lib/format.ts';
import { hrefFor } from '../lib/router.ts';

/** Link to the list of projects behind a figure. */
export function listHref(ids: readonly string[], title: string): string {
  return hrefFor('/list', { ids: ids.join(','), title });
}

/**
 * Per-basis floor-space subtotals side by side (GFA, GLA, built-up, basis not
 * stated), each with its own label and link. There is deliberately no total:
 * figures of different bases are never added. Basis-not-stated is outlined.
 */
export function BasisFigures({
  floorSpace,
  context,
  emptyText = 'No floor area disclosed',
}: {
  floorSpace: FloorSpace;
  context: string;
  emptyText?: string;
}) {
  const figs = FLOOR_FIGURE_BASES.filter((b) => floorSpace[b].projectIds.length);
  if (!figs.length) return <p className="text-sm text-ink-soft">{emptyText}</p>;
  const qualified = figs.reduce((n, b) => n + floorSpace[b].qualifiedIds.length, 0);
  return (
    <>
      <ul className="flex flex-wrap gap-x-6 gap-y-3" data-testid="basis-figures">
        {figs.map((b) => {
          const f = floorSpace[b];
          const unstated = b === 'unspecified';
          return (
            <li
              key={b}
              className={unstated ? 'min-w-0 rounded-md border border-dashed border-[#AEBBBF] px-2.5 py-1.5' : 'min-w-0'}
              data-basis={b}
            >
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-soft" title={AREA_BASIS_LABELS[b]}>
                {BASIS_SHORT[b]}
              </span>
              <a
                href={listHref(f.projectIds, `${context} — ${AREA_BASIS_LABELS[b]}`)}
                className="num text-xl font-semibold text-ink no-underline hover:text-accent-800 hover:underline"
              >
                {formatM2(f.totalM2)}
              </a>
              <span className="block text-xs text-ink-soft">{plural(f.projectIds.length, 'project')}</span>
            </li>
          );
        })}
      </ul>
      {qualified > 0 && (
        <p className="text-xs text-ink-soft">
          Includes {plural(qualified, 'figure')} that sources qualify as &ldquo;over&rdquo;, &ldquo;nearly&rdquo; or &ldquo;about&rdquo;.
        </p>
      )}
    </>
  );
}

/** One-line explanation shown on any card with a "basis not stated" figure. */
export function UnstatedBasisNote({ buckets }: { buckets: { floorSpace: FloorSpace }[] }) {
  if (!buckets.some((b) => b.floorSpace.unspecified.projectIds.length)) return null;
  return (
    <p className="text-xs leading-relaxed text-ink-muted">
      &ldquo;Basis not stated&rdquo; (outlined): sources give these areas without saying whether they are gross or leasable floor area. Shown on its
      own and never added to the other figures. <a href="#/method">Method</a>.
    </p>
  );
}

export function CountLink({ ids, title, children }: { ids: readonly string[]; title: string; children?: ReactNode }) {
  if (!ids.length) return <>{children ?? '0'}</>;
  return <a href={listHref(ids, title)}>{children ?? ids.length}</a>;
}
