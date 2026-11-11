import { useMemo } from 'react';
import {
  NON_BINDING_STATUSES,
  PROJECT_STATUSES,
  isDeliveredStatus,
  isRegional,
  type Project,
  type ProjectStatus,
} from '../../shared/index.ts';
import { ExportButtons } from '../components/ExportButtons.tsx';
import { FilterBar, useFilters } from '../components/FilterBar.tsx';
import { makeColumns } from '../components/columns.tsx';
import { ProjectTable } from '../components/ProjectTable.tsx';
import { EmptyState, Notice, PageHeader } from '../components/ui.tsx';
import { applyFilters } from '../lib/filters.ts';
import { yearChoices, useData } from '../lib/data.tsx';
import { plural } from '../lib/format.ts';
import { hrefFor, useHashLocation } from '../lib/router.ts';

function ResultLine({ n, total, what }: { n: number; total: number; what: 'facility' | 'project' }) {
  return (
    <p className="mb-3 text-sm text-ink-muted" role="status" aria-live="polite">
      Showing {plural(n, what, what === 'facility' ? 'facilities' : 'projects')}
      {n !== total && ` of ${total}`}
    </p>
  );
}

export function Delivered() {
  const d = useData();
  const f = useFilters();
  const cols = makeColumns(d.umbrellas);
  const pool = useMemo(
    () => d.projects.filter((p) => !isRegional(p) && isDeliveredStatus(p.status) && p.actualCompletion),
    [d.projects],
  );
  const effective = { ...f, year: f.year ?? String(d.defaultYear) };
  const rows = applyFilters(pool, effective, { yearField: 'actualCompletion' });
  const years = yearChoices(d);
  return (
    <div className="page">
      <PageHeader kicker="Dubai" title="Delivered and opened">
        Facilities whose completion or opening is evidenced by a source. Forecast dates never appear here. Area is shown on the basis the source gives.
      </PageHeader>
      <FilterBar pool={pool} fields={['q', 'year', 'zone', 'sector', 'grade', 'company', 'size']} years={years} defaultYear={d.defaultYear} />
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <ResultLine n={rows.length} total={pool.length} what="facility" />
        <ExportButtons filtered={rows} />
      </div>
      <ProjectTable
        projects={rows}
        caption="Delivered and opened facilities in Dubai"
        defaultSort={{ id: 'completed', dir: 'desc' }}
        columns={[cols.facility, cols.companies, cols.sector, cols.location, { ...cols.area, align: 'right' }, cols.grade, cols.completed, cols.completionEvidence]}
        empty={
          <EmptyState title="No delivered facilities match">
            {pool.length ? 'Try another year or clear the filters.' : 'No delivered facilities are in the register yet.'}
          </EmptyState>
        }
      />
    </div>
  );
}

const STAGES: { id: string; label: string; statuses: readonly ProjectStatus[]; note: string }[] = [
  { id: 'construction', label: 'Under construction', statuses: ['under_construction'], note: 'Construction has started. Completion dates are forecasts until a source confirms delivery.' },
  { id: 'committed', label: 'Committed', statuses: ['investment_committed'], note: 'Investment committed, construction not yet started.' },
  { id: 'signed', label: 'Signed deals', statuses: ['signed_agreement'], note: 'A binding agreement is signed; no investment commitment or construction start reported yet.' },
  { id: 'nonbinding', label: 'Non-binding', statuses: NON_BINDING_STATUSES, note: 'Proposed projects, MoUs and term sheets. These are intentions, not commitments.' },
  { id: 'cancelled', label: 'Cancelled', statuses: ['cancelled'], note: 'Projects reported as cancelled. Kept for the record; never counted.' },
];

export function Pipeline() {
  const d = useData();
  const f = useFilters();
  const { path, params, navigate } = useHashLocation();
  const cols = makeColumns(d.umbrellas);
  const pool = useMemo(() => d.projects.filter((p) => !isRegional(p) && !isDeliveredStatus(p.status)), [d.projects]);
  const filtered = applyFilters(pool, f, { yearField: 'none' });
  const stageId = params.get('stage') ?? STAGES.find((s) => f.status && s.statuses.includes(f.status))?.id ?? 'construction';
  const stage = STAGES.find((s) => s.id === stageId) ?? STAGES[0]!;
  const rows = filtered.filter((p) => stage.statuses.includes(p.status));
  const pipelineStatuses = PROJECT_STATUSES.filter((s) => !isDeliveredStatus(s));
  const setStage = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('stage', id);
    next.delete('sort');
    navigate(hrefFor(path, next), { replace: true });
  };
  const columns =
    stage.id === 'construction'
      ? [cols.facility, cols.companies, cols.location, { ...cols.area, align: 'right' as const }, cols.grade, cols.forecast, cols.investment, cols.milestoneEvidence]
      : [cols.facility, cols.companies, cols.location, { ...cols.area, align: 'right' as const }, cols.status, cols.announced, cols.investment, cols.forecast, cols.milestoneEvidence];

  return (
    <div className="page">
      <PageHeader kicker="Dubai" title="Pipeline and investment announcements">
        Projects not yet delivered, grouped by how firm they are. Signed agreements and committed investments count as committed; proposals, MoUs and
        term sheets are shown separately as non-binding.
      </PageHeader>
      <FilterBar pool={pool} fields={['q', 'zone', 'sector', 'grade', 'status', 'company', 'size']} statuses={pipelineStatuses} />
      <div role="tablist" aria-label="Pipeline stage" className="no-print mb-4 flex flex-wrap gap-1 border-b border-line">
        {STAGES.map((s) => {
          const n = filtered.filter((p) => s.statuses.includes(p.status)).length;
          const active = s.id === stage.id;
          return (
            <button
              key={s.id}
              role="tab"
              type="button"
              aria-selected={active}
              aria-controls="stage-panel"
              id={`tab-${s.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setStage(s.id)}
              onKeyDown={(e) => {
                const i = STAGES.findIndex((x) => x.id === s.id);
                const j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : -99;
                if (j === -99) return;
                const t = STAGES[(j + STAGES.length) % STAGES.length]!;
                setStage(t.id);
                setTimeout(() => document.getElementById(`tab-${t.id}`)?.focus(), 0);
              }}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                active ? 'border-accent-600 text-accent-800' : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              {s.label} <span className="num ml-1 rounded-full bg-[#EEF2F3] px-1.5 text-xs text-ink-muted">{n}</span>
            </button>
          );
        })}
      </div>
      <div id="stage-panel" role="tabpanel" aria-labelledby={`tab-${stage.id}`}>
        <p className="mb-3 max-w-3xl text-sm text-ink-muted">{stage.note}</p>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <ResultLine n={rows.length} total={pool.filter((p) => stage.statuses.includes(p.status)).length} what="project" />
          <ExportButtons filtered={rows} />
        </div>
        <ProjectTable
          projects={rows}
          caption={`${stage.label} projects in Dubai`}
          defaultSort={{ id: stage.id === 'construction' ? 'forecast' : 'announced', dir: stage.id === 'construction' ? 'asc' : 'desc' }}
          columns={columns}
          empty={<EmptyState title={`No ${stage.label.toLowerCase()} projects match`}>{pool.length ? 'Clear the filters or pick another stage.' : 'The pipeline is empty so far.'}</EmptyState>}
        />
      </div>
    </div>
  );
}

export function Regional() {
  const d = useData();
  const f = useFilters();
  const cols = makeColumns(d.umbrellas);
  const pool = useMemo(() => d.projects.filter((p) => isRegional(p)), [d.projects]);
  const rows = applyFilters(pool, f, { yearField: 'none' });
  const emirate = {
    id: 'emirate',
    header: 'Emirate',
    sort: (p: Project) => p.emirate,
    mobile: true,
    cell: (p: Project) => p.emirate,
  };
  return (
    <div className="page">
      <PageHeader kicker="Outside Dubai" title="Regional context">
        Projects elsewhere in the UAE and region, tracked for comparison only.
      </PageHeader>
      <div className="mb-5">
        <Notice>These projects are kept apart: they never appear in Dubai lists, totals or the briefing snapshot.</Notice>
      </div>
      <FilterBar pool={pool} fields={['q', 'sector', 'grade', 'status', 'company', 'size']} statuses={PROJECT_STATUSES} />
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <ResultLine n={rows.length} total={pool.length} what="project" />
        <ExportButtons filtered={rows} />
      </div>
      <ProjectTable
        projects={rows}
        caption="Regional context projects outside Dubai"
        defaultSort={{ id: 'announced', dir: 'desc' }}
        columns={[cols.facility, emirate, cols.companies, cols.location, { ...cols.area, align: 'right' }, cols.status, cols.announced, cols.milestoneEvidence]}
        empty={<EmptyState title="No regional projects match">{pool.length ? 'Clear the filters.' : 'No projects outside Dubai are tracked yet.'}</EmptyState>}
      />
    </div>
  );
}

/** Generic list behind a headline figure: `#/list?ids=a,b&title=…`. */
export function IdList() {
  const d = useData();
  const { params } = useHashLocation();
  const cols = makeColumns(d.umbrellas);
  const ids = (params.get('ids') ?? '').split(',').filter(Boolean);
  const title = params.get('title') ?? 'Projects';
  const rows = ids.map((id) => d.byId.get(id)).filter((p): p is Project => Boolean(p));
  const missing = ids.length - rows.length;
  return (
    <div className="page">
      <PageHeader kicker="Projects behind a figure" title={title}>
        <a href="#/">Back to overview</a>
      </PageHeader>
      {missing > 0 && (
        <div className="mb-4">
          <Notice tone="warn">{plural(missing, 'project id')} in this link could not be found in the current register.</Notice>
        </div>
      )}
      <div className="mb-3 flex justify-end">
        <ExportButtons filtered={rows} />
      </div>
      <ProjectTable
        projects={rows}
        caption={title}
        columns={[cols.facility, cols.companies, cols.location, { ...cols.area, align: 'right' }, cols.grade, cols.status, cols.completed, cols.forecast, cols.milestoneEvidence]}
        empty={<EmptyState title="No projects">This figure has no projects behind it.</EmptyState>}
      />
    </div>
  );
}
