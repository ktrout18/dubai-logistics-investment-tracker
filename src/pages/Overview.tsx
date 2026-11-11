import { useId, useMemo, type ReactNode } from 'react';
import {
  AREA_BASIS_LABELS,
  computeMetrics,
  computePresentedTotals,
  type Metrics,
  type ProjectBucket,
} from '../../shared/index.ts';
import { BUILDING_BASES, LAND_BASES, basisFigures } from '../lib/areas.ts';
import { yearChoices, useData } from '../lib/data.tsx';
import { BASIS_SHORT, formatApproxM2, formatDubaiDateTime, formatM2, formatMoney, numberWord, plural } from '../lib/format.ts';
import { briefingYearOf } from '../lib/presentation.ts';
import { activeFacilityIds, disclosedInvestmentByCurrency } from '../lib/investment.ts';
import { hrefFor, useHashLocation } from '../lib/router.ts';
import { BasisFigures, CountLink, UnstatedBasisNote, listHref } from '../components/figures.tsx';
import { ExportButtons } from '../components/ExportButtons.tsx';
import { EmptyState } from '../components/ui.tsx';

function Card({ letter, title, sub, children }: { letter: string; title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <section className="card flex flex-col p-5" aria-labelledby={`card-${letter}`}>
      <h3 id={`card-${letter}`} className="text-[15px] font-semibold leading-snug">
        {title}
      </h3>
      {sub && <p className="mt-1 text-xs leading-relaxed text-ink-soft">{sub}</p>}
      <div className="mt-4 flex-1 space-y-4">{children}</div>
    </section>
  );
}

function Undisclosed({ bucket, context }: { bucket: ProjectBucket; context: string }) {
  const ids = bucket.withoutAnyAreaIds;
  const n = ids.length;
  if (!n) return null;
  return (
    <p className="text-xs text-ink-muted">
      + <CountLink ids={ids} title={`${context} — no area disclosed`}>{plural(n, 'further project')}</CountLink>{' '}
      with no area disclosed
    </p>
  );
}

function CurrencyFigures({
  byCurrency,
  context,
  empty,
}: {
  byCurrency: Record<string, { total: number; projectIds: string[] }>;
  context: string;
  empty: string;
}) {
  const entries = Object.entries(byCurrency).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) return <p className="text-sm text-ink-soft">{empty}</p>;
  return (
    <ul className="flex flex-wrap gap-x-6 gap-y-3">
      {entries.map(([cur, t]) => (
        <li key={cur}>
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-soft">In {cur}</span>
          <a href={listHref(t.projectIds, `${context} — ${cur}`)} className="num text-xl font-semibold text-ink no-underline hover:underline">
            {formatMoney(t.total, cur)}
          </a>
          <span className="block text-xs text-ink-soft">{plural(t.projectIds.length, 'project')}</span>
        </li>
      ))}
    </ul>
  );
}

function SubGroup({ label, bucket, context }: { label: string; bucket: ProjectBucket; context: string }) {
  return (
    <div>
      <p className="mb-1.5 flex items-baseline justify-between gap-2 text-xs font-medium text-ink-muted">
        <span>{label}</span>
        <CountLink ids={bucket.projectIds} title={context}>
          {plural(bucket.projectCount, 'project')}
        </CountLink>
      </p>
      <BasisFigures
        breakdown={bucket.areas}
        bases={BUILDING_BASES}
        unstated={bucket.primaryUnspecified}
        context={context}
        emptyText={bucket.projectCount ? 'No floor area disclosed' : 'None recorded'}
      />
      <Undisclosed bucket={bucket} context={context} />
    </div>
  );
}

function Headline({ year, metrics }: { year: number; metrics: Metrics }) {
  const { projects } = useData();
  const presented = useMemo(() => computePresentedTotals(projects, year), [projects, year]);
  const briefingYear = briefingYearOf(presented.openings.rows);
  const deliveredIds = [
    ...metrics.gradeADelivered.projectIds,
    ...metrics.gradeAProbableDelivered.projectIds,
    ...metrics.otherModernDelivered.projectIds,
  ];
  if (briefingYear === year && presented.openings.rows.length) {
    const o = presented.openings;
    return (
      <div>
        <p className="max-w-4xl text-2xl font-semibold leading-snug text-ink sm:text-[1.9rem] sm:leading-tight">
          Dubai opened{' '}
          <a href={listHref(o.rows.map((p) => p.id), `Openings and completions, ${year} (briefing)`)} className="text-accent-700">
            {o.openedCount} logistics {o.openedCount === 1 ? 'facility' : 'facilities'}
          </a>
          {o.completedOnlyCount > 0 && <> and completed {numberWord(o.completedOnlyCount)} more</>} in {year}, with about{' '}
          <span className="num text-accent-700">{formatApproxM2(o.floorAreaM2)}</span> of floor space.
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          Floor space as reported: the sum of the figures sources give for the {o.disclosedFloorCount} facilities that disclosed one, on
          whatever basis each source uses. <a href="#/method">How this differs from the strict figures below</a>.
          {o.statusCompletedOnlyCount !== o.completedOnlyCount && (
            <>
              {' '}
              Strictly, sources confirm only completion (not opening) for {plural(o.statusCompletedOnlyCount, 'of these facilities', 'of these facilities')}.
            </>
          )}
        </p>
      </div>
    );
  }
  return (
    <div>
      <p className="max-w-4xl text-2xl font-semibold leading-snug sm:text-[1.9rem] sm:leading-tight">
        {deliveredIds.length ? (
          <>
            <a href={listHref(deliveredIds, `Opened or completed in Dubai, ${year}`)} className="text-accent-700">
              {plural(deliveredIds.length, 'logistics facility', 'logistics facilities')}
            </a>{' '}
            in this register {deliveredIds.length === 1 ? 'opened or was' : 'opened or were'} completed in Dubai in {year}.
          </>
        ) : (
          <>No openings or completions in Dubai in {year} are in the register yet.</>
        )}
      </p>
      <p className="mt-2 text-sm text-ink-muted">
        Floor space is shown below by measurement basis only. <a href="#/method">Method note</a>.
      </p>
    </div>
  );
}

function StageChart({ metrics }: { metrics: Metrics }) {
  const rows = [
    { label: 'Under construction', ids: metrics.underConstruction.all.projectIds },
    { label: 'Investment committed', ids: metrics.committedNotStarted.byStatus.investment_committed.projectIds },
    { label: 'Signed agreement', ids: metrics.committedNotStarted.byStatus.signed_agreement.projectIds },
    { label: 'Term sheet', ids: metrics.nonBinding.byStatus.term_sheet.projectIds },
    { label: 'MoU', ids: metrics.nonBinding.byStatus.mou.projectIds },
    { label: 'Proposed', ids: metrics.nonBinding.byStatus.proposed.projectIds },
  ];
  const max = Math.max(1, ...rows.map((r) => r.ids.length));
  return (
    <figure className="card p-5">
      <figcaption className="mb-4">
        <span className="block text-[15px] font-semibold">Dubai pipeline by stage</span>
        <span className="text-xs text-ink-soft">Number of projects at each current status. Counts only; no areas are combined.</span>
      </figcaption>
      <table className="w-full text-sm">
        <caption className="sr-only">Number of Dubai projects by current pipeline stage</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Stage</th>
            <th scope="col">Projects</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="group">
              <th scope="row" className="w-40 py-1.5 pr-3 text-left font-normal text-ink-muted">
                {r.label}
              </th>
              <td className="py-1.5">
                <a
                  href={r.ids.length ? listHref(r.ids, `Dubai pipeline — ${r.label}`) : undefined}
                  className="flex items-center gap-2 text-ink no-underline"
                  title={`${r.label}: ${plural(r.ids.length, 'project')}`}
                >
                  <span
                    aria-hidden="true"
                    className="block h-3.5 rounded-r bg-accent-600 transition-opacity group-hover:opacity-80"
                    style={{ width: `${(r.ids.length / max) * 75}%`, minWidth: r.ids.length ? 4 : 0 }}
                  />
                  <span className="num font-medium">{r.ids.length}</span>
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function NonFloorTable({ year, metrics }: { year: number; metrics: Metrics }) {
  const groups: [string, ProjectBucket][] = [
    [`Grade-A confirmed, delivered ${year}`, metrics.gradeADelivered],
    [`Grade-A probable, delivered ${year}`, metrics.gradeAProbableDelivered],
    [`Other modern, delivered ${year}`, metrics.otherModernDelivered],
    ['Under construction', metrics.underConstruction.all],
    ['Committed, not started', metrics.committedNotStarted],
  ];
  const any = groups.some(([, b]) => basisFigures(b.areas, LAND_BASES).length);
  return (
    <section className="mt-10" aria-labelledby="nonfloor">
      <h2 id="nonfloor" className="text-lg font-semibold">
        Land, yard and district areas
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-ink-muted">
        Plot, open-yard and masterplan areas are not floor space. They are listed here on their own and never enter the figures above.
      </p>
      {!any ? (
        <p className="mt-3 text-sm text-ink-soft">No land, yard or district areas recorded for these groups.</p>
      ) : (
        <div className="card mt-4 overflow-x-auto">
          <table className="data-table">
            <caption>Non-floor areas by group and basis, Dubai, {year}</caption>
            <thead>
              <tr>
                <th scope="col">Group</th>
                {LAND_BASES.map((b) => (
                  <th key={b} scope="col" className="text-right" title={AREA_BASIS_LABELS[b]}>
                    {BASIS_SHORT[b]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(([label, b]) => (
                <tr key={label}>
                  <th scope="row" className="border-b border-line px-3 py-2 text-left font-normal">
                    {label}
                  </th>
                  {LAND_BASES.map((basis) => {
                    const t = b.areas[basis];
                    return (
                      <td key={basis} className="num whitespace-nowrap text-right">
                        {t.projectIds.length ? (
                          <a href={listHref(t.projectIds, `${label} — ${AREA_BASIS_LABELS[basis]}`)}>{formatM2(t.totalM2)}</a>
                        ) : (
                          <span className="text-ink-soft">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function DataQuality({ metrics }: { metrics: Metrics }) {
  const { data } = useData();
  const id = useId();
  const pending = data.pendingReview.items.filter((i) => i.state === 'open').length;
  const meta = data.meta;
  return (
    <section aria-labelledby={id} className="card mt-10 p-5">
      <h2 id={id} className="text-[15px] font-semibold">
        Data quality
      </h2>
      <dl className="mt-3 grid grid-cols-2 gap-4 text-sm lg:grid-cols-4">
        <div>
          <dt className="text-xs text-ink-soft">Last successful refresh</dt>
          <dd className="mt-0.5 font-medium">
            {meta.lastSuccessfulRun ? formatDubaiDateTime(meta.lastSuccessfulRun) : 'Not yet run (seeded data)'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-soft">Projects with a directly read source</dt>
          <dd className="mt-0.5 font-medium">
            <CountLink ids={metrics.verifiedProjectCount.projectIds} title="Dubai projects with a directly read source">
              {metrics.verifiedProjectCount.count}
            </CountLink>{' '}
            <span className="font-normal text-ink-soft">of {metrics.scope.includedProjectIds.length} counted</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-soft">Items awaiting review</dt>
          <dd className="mt-0.5 font-medium">
            <a href="#/method#review">{pending}</a>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-soft">Coverage</dt>
          <dd className="mt-0.5 font-medium">Not exhaustive</dd>
        </div>
      </dl>
      {meta.coverageLimitations.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-medium text-accent-800">Coverage limitations ({meta.coverageLimitations.length})</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-muted">
            {meta.coverageLimitations.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export function Overview() {
  const d = useData();
  const { params, navigate } = useHashLocation();
  const years = yearChoices(d);
  const yParam = Number(params.get('year'));
  const year = Number.isInteger(yParam) && yParam > 1900 ? yParam : d.defaultYear;
  const metrics = useMemo(() => computeMetrics(d.projects, year), [d.projects, year]);
  const inv = metrics.investmentAnnouncements;
  const active = useMemo(() => disclosedInvestmentByCurrency(activeFacilityIds(metrics), d.byId), [metrics, d.byId]);
  const meta = d.data.meta;
  const yearSel = useId();

  return (
    <div className="page">
      <div className="mt-8 flex flex-wrap items-end justify-between gap-4 sm:mt-10">
        <p className="kicker">Dubai logistics and warehousing · reporting year {year}</p>
        <div className="no-print flex items-center gap-2">
          <label htmlFor={yearSel} className="text-sm text-ink-muted">
            Reporting year
          </label>
          <select
            id={yearSel}
            className="field w-auto"
            value={year}
            onChange={(e) => navigate(hrefFor('/', { year: e.target.value }), { replace: true })}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3">
        <Headline year={year} metrics={metrics} />
      </div>

      {d.projects.length === 0 && (
        <div className="mt-8">
          <EmptyState title="The register is empty">
            No projects have been published yet. Figures will appear here once the first verified projects are added.
          </EmptyState>
        </div>
      )}

      <h2 className="sr-only">Headline figures for {year}</h2>
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card
          letter="a"
          title={`Grade-A warehouse space opened or completed in ${year}`}
          sub="Verified Grade-A only. Each figure is one measurement basis; GFA and GLA are never added together."
        >
          <SubGroup label="Grade-A confirmed" bucket={metrics.gradeADelivered} context={`Grade-A confirmed, delivered ${year}`} />
          {metrics.gradeAProbableDelivered.projectCount > 0 && (
            <div className="border-t border-line pt-3">
              <SubGroup
                label="Grade-A probable (shown separately, not verified)"
                bucket={metrics.gradeAProbableDelivered}
                context={`Grade-A probable, delivered ${year}`}
              />
            </div>
          )}
          <UnstatedBasisNote buckets={[metrics.gradeADelivered, metrics.gradeAProbableDelivered]} />
        </Card>
        <Card
          letter="b"
          title={`Other modern warehouse space opened or completed in ${year}`}
          sub="Facilities whose Grade-A status is not verified or not applicable, measured separately."
        >
          <SubGroup label="Other modern" bucket={metrics.otherModernDelivered} context={`Other modern, delivered ${year}`} />
          <UnstatedBasisNote buckets={[metrics.otherModernDelivered]} />
        </Card>
        <Card letter="c" title="Under construction now" sub="Current status. Completion dates for these are forecasts.">
          <SubGroup label="Grade-A confirmed" bucket={metrics.underConstruction.gradeAConfirmed} context="Under construction — Grade-A confirmed" />
          {metrics.underConstruction.gradeAProbable.projectCount > 0 && (
            <SubGroup label="Grade-A probable" bucket={metrics.underConstruction.gradeAProbable} context="Under construction — Grade-A probable" />
          )}
          <SubGroup label="Other modern" bucket={metrics.underConstruction.other} context="Under construction — other modern" />
          <UnstatedBasisNote buckets={[metrics.underConstruction.all]} />
        </Card>
        <Card letter="d" title="Committed, not yet under construction" sub="Signed agreements and committed investments without a construction start.">
          <p className="text-sm">
            <CountLink ids={metrics.committedNotStarted.byStatus.investment_committed.projectIds} title="Investment committed">
              {plural(metrics.committedNotStarted.byStatus.investment_committed.count, 'project')}
            </CountLink>{' '}
            with investment committed ·{' '}
            <CountLink ids={metrics.committedNotStarted.byStatus.signed_agreement.projectIds} title="Signed agreement">
              {plural(metrics.committedNotStarted.byStatus.signed_agreement.count, 'project')}
            </CountLink>{' '}
            with a signed agreement
          </p>
          <BasisFigures
            breakdown={metrics.committedNotStarted.areas}
            bases={BUILDING_BASES}
            unstated={metrics.committedNotStarted.primaryUnspecified}
            context="Committed, not started"
            emptyText="No floor area disclosed"
          />
          <Undisclosed bucket={metrics.committedNotStarted} context="Committed, not started" />
          <UnstatedBasisNote buckets={[metrics.committedNotStarted]} />
          <p className="text-xs text-ink-soft">
            Plus{' '}
            <CountLink ids={metrics.nonBinding.projectIds} title="Non-binding (proposed, MoU, term sheet)">
              {plural(metrics.nonBinding.count, 'non-binding project')}
            </CountLink>{' '}
            (proposed, MoU or term sheet), not counted as committed.
          </p>
        </Card>
        <Card
          letter="e"
          title={`Investment announcements in ${year}`}
          sub="Disclosed values by currency as published; currencies are never converted or combined."
        >
          <p className="text-sm">
            <CountLink ids={inv.projectIds} title={`Investment announcements, ${year}`}>
              {plural(inv.projectCount, 'project')}
            </CountLink>{' '}
            with an announcement, agreement or commitment in {year}
          </p>
          <CurrencyFigures byCurrency={inv.disclosed.byCurrency} context={`Disclosed investment, announcements in ${year}`} empty="No values disclosed for these." />
          <p className="text-xs text-ink-muted">
            <CountLink ids={inv.undisclosed.projectIds} title={`Investment value not disclosed, announcements in ${year}`}>
              {plural(inv.undisclosed.count, 'project')}
            </CountLink>{' '}
            did not disclose a value.
          </p>
          <div className="border-t border-line pt-3">
            <p className="mb-1.5 text-xs font-medium text-ink-muted">
              Disclosed investment in facilities opened in {year}, under construction or committed now
            </p>
            <CurrencyFigures byCurrency={active.byCurrency} context={`Disclosed investment, facilities opened in ${year}, under construction or committed`} empty="No values disclosed." />
            <p className="mt-1.5 text-xs text-ink-muted">
              <CountLink ids={active.undisclosedIds} title={`No investment value disclosed — opened in ${year}, under construction or committed`}>
                {plural(active.undisclosedIds.length, 'further facility', 'further facilities')}
              </CountLink>{' '}
              without a disclosed value. Figures are as published; some cover more than the logistics facility (see each project).
            </p>
          </div>
        </Card>
        <Card letter="f" title="Last data update">
          <p className="text-xl font-semibold">
            {meta.lastSuccessfulRun ? formatDubaiDateTime(meta.lastSuccessfulRun) : 'Seeded'}
          </p>
          <p className="text-sm text-ink-muted">
            {meta.lastSuccessfulRun
              ? 'Last successful automated source check.'
              : `No automated refresh has run yet; the register is the verified seed${
                  d.data.register.updatedAt ? ` of ${formatDubaiDateTime(d.data.register.updatedAt)}` : ''
                }.`}
          </p>
          <ExportButtons />
        </Card>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <StageChart metrics={metrics} />
        <section className="card p-5" aria-labelledby="regional-teaser">
          <h2 id="regional-teaser" className="text-[15px] font-semibold">
            Outside Dubai
          </h2>
          <p className="mt-2 text-sm text-ink-muted">
            <CountLink ids={metrics.regionalContext.projectIds} title="Regional context (outside Dubai)">
              {plural(metrics.regionalContext.projectCount, 'project')}
            </CountLink>{' '}
            elsewhere in the region are tracked for context. They are kept out of every Dubai figure on this page.
          </p>
          <p className="mt-3 text-sm">
            <a href="#/regional">View regional context</a>
          </p>
        </section>
      </div>

      <NonFloorTable year={year} metrics={metrics} />
      <DataQuality metrics={metrics} />
    </div>
  );
}
