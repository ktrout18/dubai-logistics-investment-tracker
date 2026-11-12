import { useEffect } from 'react';
import {
  ASSET_TYPE_LABELS,
  CHANGE_VERIFICATION_LABELS,
  DELIVERY_DEFINITIONS,
  DELIVERY_KINDS,
  DELIVERY_LABELS,
  ELIGIBILITY_RULES,
  GRADE_A_RULE,
  INDEXED_EVIDENCE_MARK,
  INDEXED_EVIDENCE_NOTE,
  NET_NEW_BASELINE_DATE,
  NOT_DELIVERED_DEFINITION,
  OTHER_INFRASTRUCTURE_ASSET_TYPES,
  WAREHOUSE_ASSET_TYPES,
  REVIEW_KIND_LABELS,
  REVIEW_STATE_LABELS,
  RUN_STATUS_LABELS,
  SCAN_STATUS_LABELS,
  VERIFICATION_LABELS,
  VERIFICATION_LEVELS,
} from '../../shared/index.ts';
import { ExtLink, PageHeader } from '../components/ui.tsx';
import { useData } from '../lib/data.tsx';
import { formatDate, formatDubaiDateTime } from '../lib/format.ts';
import { hrefFor } from '../lib/router.ts';

function valueText(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  const s = JSON.stringify(v);
  return s.length > 140 ? `${s.slice(0, 140)}…` : s;
}

function proposedSummary(p: Record<string, unknown>): string {
  const name = typeof p.name === 'string' ? p.name : undefined;
  const keys = Object.keys(p);
  if (name) return name;
  return keys.slice(0, 4).join(', ') + (keys.length > 4 ? '…' : '');
}

export function Method() {
  const { data, byId } = useData();
  const open = data.pendingReview.items.filter((i) => i.state === 'open').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const changes = [...data.changelog.changes].sort((a, b) => b.appliedAt.localeCompare(a.appliedAt)).slice(0, 50);
  const meta = data.meta;

  useEffect(() => {
    // Support in-page anchors like #/method#review
    const frag = window.location.hash.split('#')[2];
    if (frag) document.getElementById(frag)?.scrollIntoView();
  }, []);

  return (
    <div className="page">
      <PageHeader kicker="Method" title="How figures are counted">
        The register lists projects found in public sources. It is not exhaustive. Each figure on this site links to the projects and sources behind it.
      </PageHeader>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="card p-5 sm:p-6" aria-labelledby="rules">
          <h2 id="rules" className="text-lg font-semibold">
            Counting rules
          </h2>
          <ol className="mt-3 list-decimal space-y-3 pl-5 text-[15px] leading-relaxed">
            <li>
              <strong>Measurement bases are never mixed.</strong> Each facility has one area figure, on the basis its source states: gross floor area
              (GFA), gross leasable area (GLA), built-up area that includes offices or other uses, or an area whose basis the source does not state.
              These are subtotalled separately and never added together. Land, open-yard and district areas are not floor space and appear only in
              their own labelled place. A figure the source gives as &ldquo;over&rdquo; or &ldquo;nearly&rdquo; is shown with that word.
            </li>
            <li>
              <strong>Grade-A needs evidence.</strong>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {GRADE_A_RULE.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </li>
            <li>
              <strong>Delivered means evidenced.</strong> A facility counts as delivered in a year only when a source dates its opening or completion in
              that year. Opened and construction-completed facilities are always counted separately (definitions opposite). Forecast completion dates
              are always labelled as forecasts and never count as delivery. Where a source gives only the month or quarter in which it reported an
              opening, the project page says the event may have happened earlier.
            </li>
            <li>
              <strong>Phases, not umbrellas.</strong> When a park is built in phases, each phase is counted; the umbrella project is listed for context but
              its area and investment are excluded from totals so nothing is counted twice.
            </li>
            <li>
              <strong>Dubai only.</strong> Totals cover projects in Dubai. Projects elsewhere are listed under regional context and never enter Dubai
              figures.
            </li>
            <li>
              <strong>Money as published.</strong> Investment values are summed per currency and never converted or combined. Only amounts that cover
              the logistics facility itself are summed; amounts that also cover land, offices, a headquarters or a wider complex are listed
              separately with their scope. AED equivalents appear only where a source states them or from USD at the official peg, labelled.
            </li>
            <li>
              <strong>Net new</strong> means new supply completed after {formatDate(NET_NEW_BASELINE_DATE)}.
            </li>
          </ol>
        </section>

        <div className="space-y-5">
          <section className="card p-5 sm:p-6" aria-labelledby="delivery-defs">
            <h2 id="delivery-defs" className="text-lg font-semibold">
              Delivery status
            </h2>
            <dl className="mt-3 space-y-3 text-[15px] leading-relaxed">
              {DELIVERY_KINDS.map((k) => (
                <div key={k}>
                  <dt className="font-semibold">{DELIVERY_LABELS[k]}</dt>
                  <dd>{DELIVERY_DEFINITIONS[k]}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-sm text-ink-muted">{NOT_DELIVERED_DEFINITION}</p>
            <p className="mt-3 text-sm text-ink-muted">
              The headline, the figure cards, the tables, the project pages, the briefing snapshot and the CSV export all use these two definitions.
            </p>
          </section>
          <section className="card p-5 sm:p-6" aria-labelledby="eligibility">
            <h2 id="eligibility" className="text-lg font-semibold">
              What enters a total
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed">
              {ELIGIBILITY_RULES.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-ink-muted">
              Warehouse asset types: {WAREHOUSE_ASSET_TYPES.map((t) => ASSET_TYPE_LABELS[t]).join(', ')}. Other logistics
              infrastructure: {OTHER_INFRASTRUCTURE_ASSET_TYPES.map((t) => ASSET_TYPE_LABELS[t]).join(', ')}.
            </p>
          </section>
          <section className="card p-5 sm:p-6" aria-labelledby="verified">
            <h2 id="verified" className="text-lg font-semibold">
              What &ldquo;verified&rdquo; means
            </h2>
            <ul className="mt-3 space-y-2 text-[15px]">
              {VERIFICATION_LEVELS.map((v) => (
                <li key={v}>
                  <strong className="capitalize">{v}:</strong> {VERIFICATION_LABELS[v]}.
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-ink-muted">
              Where a delivery status or date rests only on search-indexed evidence, every view marks it with {INDEXED_EVIDENCE_MARK}: {INDEXED_EVIDENCE_NOTE}{' '}
              A project counts as verified when at least one of its sources was read directly. Changes found by the automated check are applied only
              with an official source or several independent ones; everything else waits for human review below.
            </p>
          </section>
          <section className="card p-5 sm:p-6" aria-labelledby="runs">
            <h2 id="runs" className="text-lg font-semibold">
              Automated checks
            </h2>
            <p className="mt-3 text-sm">
              Last run: {meta.lastAttemptedRun ? formatDubaiDateTime(meta.lastAttemptedRun) : 'never'} ({RUN_STATUS_LABELS[meta.lastRunStatus]}). Last
              success: {meta.lastSuccessfulRun ? formatDubaiDateTime(meta.lastSuccessfulRun) : 'none yet; the data is the initial seed'}.
            </p>
            {meta.sourceScans.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-ink-muted">
                {meta.sourceScans.map((s) => (
                  <li key={s.sourceId}>
                    {s.name}: {SCAN_STATUS_LABELS[s.status]}
                    {s.note ? ` (${s.note})` : ''}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <section id="review" className="mt-10 scroll-mt-4" aria-labelledby="review-h">
        <h2 id="review-h" className="text-xl font-semibold">
          Awaiting review <span className="num text-ink-soft">({open.length})</span>
        </h2>
        <p className="mt-1 text-sm text-ink-muted">Findings held back from the register until a person checks them. Shown read-only.</p>
        {open.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">Nothing is waiting for review.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {open.map((i) => (
              <li key={i.id} className="card p-4 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-[#EEF2F3] px-1.5 py-0.5 text-xs font-medium">{REVIEW_KIND_LABELS[i.kind]}</span>
                  <span className="font-medium">
                    {i.projectId && byId.get(i.projectId) ? (
                      <a href={hrefFor(`/project/${i.projectId}`)}>{byId.get(i.projectId)!.name}</a>
                    ) : (
                      proposedSummary(i.proposed)
                    )}
                  </span>
                  <span className="text-xs text-ink-soft">
                    {REVIEW_STATE_LABELS[i.state]} · found {formatDubaiDateTime(i.createdAt)}
                  </span>
                </p>
                <p className="mt-2">
                  <strong className="font-medium">Why held:</strong> {i.reasonHeld}
                </p>
                <ul className="mt-2 space-y-1">
                  {i.evidence.map((e) => (
                    <li key={e.url} className="text-ink-muted">
                      <ExtLink href={e.url} />
                      {e.publishedDate && ` · ${formatDate(e.publishedDate)}`}
                      {e.quote && <q className="ml-1 italic">{e.quote}</q>}
                    </li>
                  ))}
                </ul>
                {i.issueUrl && (
                  <p className="mt-1">
                    <ExtLink href={i.issueUrl}>Review issue</ExtLink>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10" aria-labelledby="changes-h">
        <h2 id="changes-h" className="text-xl font-semibold">
          Recent changes
        </h2>
        {changes.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">No changes recorded yet.</p>
        ) : (
          <div className="card mt-4 overflow-x-auto">
            <table className="data-table">
              <caption>Recent changes to the register</caption>
              <thead>
                <tr>
                  <th scope="col">Project</th>
                  <th scope="col">Field</th>
                  <th scope="col">Previous → new</th>
                  <th scope="col">Reason</th>
                  <th scope="col">Evidence</th>
                  <th scope="col">Verification</th>
                  <th scope="col">Applied</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((c) => (
                  <tr key={c.id}>
                    <th scope="row" className="border-b border-line px-3 py-2.5 text-left align-top font-normal">
                      <a href={hrefFor(`/project/${c.projectId}`)}>{byId.get(c.projectId)?.name ?? c.projectId}</a>
                    </th>
                    <td>
                      <code className="text-xs">{c.field}</code>
                    </td>
                    <td className="min-w-[12rem] max-w-[22rem] break-words">
                      <span className="text-ink-muted line-through">{valueText(c.previousValue)}</span> →{' '}
                      <span className="font-medium">{valueText(c.newValue)}</span>
                    </td>
                    <td className="min-w-[12rem]">{c.reason}</td>
                    <td className="whitespace-nowrap">
                      <ExtLink href={c.evidenceUrl} />
                      <span className="block text-xs text-ink-soft">{formatDate(c.evidenceDate)}</span>
                    </td>
                    <td>{CHANGE_VERIFICATION_LABELS[c.verificationStatus]}</td>
                    <td className="whitespace-nowrap text-xs">
                      {formatDubaiDateTime(c.appliedAt)}
                      <span className="block text-ink-soft">{c.appliedBy === 'pipeline' ? 'Pipeline' : 'Manual'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
