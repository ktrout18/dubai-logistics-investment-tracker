import type { ReactNode } from 'react';
import { AREA_BASIS_LABELS, type AreaBasis, type AreaBreakdown, type BasisTotal } from '../../shared/index.ts';
import { basisFigures } from '../lib/areas.ts';
import { BASIS_SHORT, formatM2, plural } from '../lib/format.ts';
import { hrefFor } from '../lib/router.ts';

/** Link to the list of projects behind a figure. */
export function listHref(ids: readonly string[], title: string): string {
  return hrefFor('/list', { ids: ids.join(','), title });
}

/**
 * Per-basis area figures side by side, each with its own label and link.
 * There is deliberately no total: figures of different bases are never added.
 */
export function BasisFigures({
  breakdown,
  bases,
  context,
  emptyText = 'No area disclosed',
  unstated,
}: {
  breakdown: AreaBreakdown;
  bases: readonly AreaBasis[];
  context: string;
  emptyText?: string;
  /** Reported area whose basis the source does not state (primary measures only). Shown apart, never added. */
  unstated?: BasisTotal;
}) {
  const figs = basisFigures(breakdown, bases);
  const showUnstated = Boolean(unstated && unstated.projectIds.length);
  if (!figs.length && !showUnstated) return <p className="text-sm text-ink-soft">{emptyText}</p>;
  return (
    <ul className="flex flex-wrap gap-x-6 gap-y-3" data-testid="basis-figures">
      {figs.map((f) => (
        <li
          key={f.basis}
          className="min-w-0"
        >
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-soft" title={AREA_BASIS_LABELS[f.basis]}>
            {BASIS_SHORT[f.basis]}
          </span>
          <a
            href={listHref(f.projectIds, `${context} — ${AREA_BASIS_LABELS[f.basis]}`)}
            className="num text-xl font-semibold text-ink no-underline hover:text-accent-800 hover:underline"
          >
            {formatM2(f.totalM2)}
          </a>
          <span className="block text-xs text-ink-soft">{plural(f.projectIds.length, 'project')}</span>
        </li>
      ))}
      {showUnstated && unstated && (
        <li className="min-w-0 rounded-md border border-dashed border-[#AEBBBF] px-2.5 py-1.5" data-basis="unstated">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Reported area, basis not stated</span>
          <a
            href={listHref(unstated.projectIds, `${context} — reported area, basis not stated by source`)}
            className="num text-xl font-semibold text-ink no-underline hover:text-accent-800 hover:underline"
          >
            {formatM2(unstated.totalM2)}
          </a>
          <span className="block text-xs text-ink-soft">{plural(unstated.projectIds.length, 'project')}</span>
        </li>
      )}
    </ul>
  );
}

/** One-line explanation shown on any card with a "basis not stated" figure. */
export function UnstatedBasisNote({ buckets }: { buckets: { primaryUnspecified: BasisTotal }[] }) {
  if (!buckets.some((b) => b.primaryUnspecified.projectIds.length)) return null;
  return (
    <p className="text-xs leading-relaxed text-ink-muted">
      Sources give these areas without saying whether they are gross, leasable or plot area. The dashed figure is shown on its own and never added
      to the others. <a href="#/method">Method note</a>.
    </p>
  );
}

export function CountLink({ ids, title, children }: { ids: readonly string[]; title: string; children?: ReactNode }) {
  if (!ids.length) return <>{children ?? '0'}</>;
  return <a href={listHref(ids, title)}>{children ?? ids.length}</a>;
}
