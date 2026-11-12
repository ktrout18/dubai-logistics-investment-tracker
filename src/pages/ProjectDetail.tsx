import type { ReactNode } from 'react';
import {
  AED_DERIVATION_LABELS,
  AREA_BASIS_LABELS,
  ASSET_TYPE_LABELS,
  CHANGE_VERIFICATION_LABELS,
  CONFIDENCE_LABELS,
  EMIRATE_LABELS,
  EVENT_TYPE_LABELS,
  DELIVERY_LABELS,
  INVESTMENT_SCOPE_LABELS,
  MAY_BE_EARLIER_NOTE,
  NET_NEW_LABELS,
  PROVENANCE_LABELS,
  SECTOR_LABELS,
  SOURCE_TYPE_LABELS,
  VERIFICATION_LABELS,
  completionMayBeEarlier,
  deliveryKindOf,
  eventMayBeEarlier,
  investmentScopeOf,
  isRegional,
  normaliseZone,
  phasesOf,
  type Project,
} from '../../shared/index.ts';
import { Dl, EmptyState, ExtLink, GradeBadge, Notice, StatusBadge, VerificationBadge } from '../components/ui.tsx';
import { useData } from '../lib/data.tsx';
import { BASIS_SHORT, formatDate, formatDubaiDateTime, formatMeasureM2, formatMoney, formatOriginal } from '../lib/format.ts';
import { hrefFor } from '../lib/router.ts';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="card p-5 sm:p-6">
      <h2 id={id} className="mb-4 text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function valueText(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  const s = JSON.stringify(v);
  return s.length > 160 ? `${s.slice(0, 160)}…` : s;
}

export function ProjectDetail({ id }: { id: string }) {
  const { byId, projects, umbrellas, data } = useData();
  const p = byId.get(id);
  if (!p) {
    return (
      <div className="page mt-10">
        <EmptyState title="Project not found">
          There is no project with the id <code>{id}</code> in the current register. <a href="#/">Go to the overview</a>.
        </EmptyState>
      </div>
    );
  }
  const parent = p.parentId ? byId.get(p.parentId) : undefined;
  const phases = phasesOf(p.id, projects) as Project[];
  const isUmb = umbrellas.has(p.id);
  const changes = data.changelog.changes.filter((c) => c.projectId === p.id).sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));
  const delivery = deliveryKindOf(p);

  const parties: [ReactNode, ReactNode][] = [];
  if (p.developer) parties.push(['Developer', p.developer]);
  if (p.investor) parties.push(['Investor', p.investor]);
  if (p.owner) parties.push(['Owner', p.owner]);
  if (p.operator) parties.push(['Operator', p.operator]);
  if (!parties.length) parties.push(['Companies', p.companies.join(', ') || 'Not stated']);

  return (
    <div className="page [overflow-wrap:break-word]">
      <nav aria-label="Breadcrumb" className="no-print mt-6 text-sm">
        <a href="#/">Overview</a> <span className="text-ink-soft">/</span>{' '}
        <a href={isRegional(p) ? '#/regional' : p.actualCompletion ? '#/delivered' : '#/pipeline'}>
          {isRegional(p) ? 'Regional context' : p.actualCompletion ? 'Delivered' : 'Pipeline'}
        </a>
      </nav>
      <header className="mb-6 mt-4">
        <p className="kicker">
          {p.zone ? `${normaliseZone(p.zone)} · ` : ''}
          {EMIRATE_LABELS[p.emirate]}
        </p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{p.name}</h1>
        {p.facilityName && p.facilityName !== p.name && <p className="mt-1 text-ink-muted">{p.facilityName}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <StatusBadge status={p.status} />
          <GradeBadge grade={p.gradeA} />
          {p.phaseLabel && <span className="rounded bg-[#EEF2F3] px-1.5 py-0.5 text-xs font-medium">{p.phaseLabel}</span>}
        </div>
        <p className="mt-4 max-w-3xl text-[15px] leading-relaxed">{p.summary}</p>
      </header>

      <div className="space-y-3">
        {isRegional(p) && <Notice>Regional context: this project is outside Dubai and never enters Dubai totals.</Notice>}
        {isUmb && (
          <Notice>
            This is an umbrella project. Its own area and investment are excluded from totals; its phases are counted instead.
          </Notice>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Section id="facts" title="Summary">
            <Dl
              items={[
                ...parties,
                ['Location', p.location],
                ['Industrial zone', p.zone ? normaliseZone(p.zone) : 'Not stated'],
                ['Sector', p.sectors.map((s) => SECTOR_LABELS[s]).join(', ')],
                ['Asset type', ASSET_TYPE_LABELS[p.assetType]],
                ['Status', <StatusBadge key="s" status={p.status} />],
                [
                  'First announced',
                  p.originalAnnouncement ? (
                    <span key="oa">
                      {formatDate(p.originalAnnouncement.date, p.originalAnnouncement.datePrecision)} ·{' '}
                      <ExtLink href={p.originalAnnouncement.sourceUrl}>{p.originalAnnouncement.sourceTitle}</ExtLink>
                    </span>
                  ) : (
                    'Not recorded'
                  ),
                ],
                [
                  'Latest milestone',
                  <span key="lm">
                    {formatDate(p.latestMilestone.date, p.latestMilestone.datePrecision)}: {p.latestMilestone.description} ·{' '}
                    <ExtLink href={p.latestMilestone.sourceUrl} />
                  </span>,
                ],
              ]}
            />
          </Section>

          <Section id="areas" title="Area measures">
            {p.areas.length ? (
              <>
                <ul className="space-y-3 sm:hidden">
                  {p.areas.map((a, i) => (
                    <li key={i} className="rounded-md border border-line p-3 text-sm">
                      <p className="flex items-baseline justify-between gap-2">
                        <span className="font-medium">
                          {BASIS_SHORT[a.basis]}
                          {i === p.primaryAreaIndex && <span className="ml-1 text-xs text-accent-800">(primary)</span>}
                        </span>
                        <span className="num font-semibold">{formatMeasureM2(a)}</span>
                      </p>
                      <p className="text-xs text-ink-soft">{AREA_BASIS_LABELS[a.basis]}</p>
                      {a.originalValue !== undefined && a.originalUnit && (
                        <p className="mt-1 text-xs text-ink-muted">As in source: {formatOriginal(a.originalValue, a.originalUnit)}</p>
                      )}
                      {(a.label || a.note) && <p className="mt-1 text-ink-muted">{[a.label, a.note].filter(Boolean).join(' · ')}</p>}
                      {a.sourceUrl && (
                        <p className="mt-1">
                          <ExtLink href={a.sourceUrl} />
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="hidden overflow-x-auto sm:block">
                  <table className="data-table">
                    <caption>Every area measure reported for this project, with its basis</caption>
                    <thead>
                      <tr>
                        <th scope="col">Basis</th>
                        <th scope="col" className="text-right">
                          Area
                        </th>
                        <th scope="col">As in source</th>
                        <th scope="col">Note</th>
                        <th scope="col">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.areas.map((a, i) => (
                        <tr key={i}>
                          <th scope="row" className="border-b border-line px-3 py-2.5 text-left align-top font-normal">
                            <span className="font-medium">{BASIS_SHORT[a.basis]}</span>
                            {i === p.primaryAreaIndex && <span className="ml-1 text-xs text-accent-800">(primary)</span>}
                            <span className="block text-xs text-ink-soft">{AREA_BASIS_LABELS[a.basis]}</span>
                          </th>
                          <td className="num whitespace-nowrap text-right">{formatMeasureM2(a)}</td>
                          <td className="num whitespace-nowrap">
                            {a.originalValue !== undefined && a.originalUnit ? formatOriginal(a.originalValue, a.originalUnit) : '—'}
                          </td>
                          <td className="min-w-[14rem] text-ink-muted">{[a.label, a.note].filter(Boolean).join(' · ') || '—'}</td>
                          <td>{a.sourceUrl ? <ExtLink href={a.sourceUrl} /> : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-ink-soft">Measures on different bases describe different things and are never added together.</p>
              </>
            ) : (
              <p className="text-sm text-ink-soft">No area has been disclosed.</p>
            )}
          </Section>

          <Section id="timeline" title="Event history">
            {p.events.length ? (
              <ol className="relative ml-2 border-l-2 border-accent-100">
                {p.events.map((e) => (
                  <li key={e.id} className="relative mb-5 pl-5 last:mb-0">
                    <span aria-hidden="true" className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-accent-600" />
                    <p className="text-xs font-medium text-ink-soft">
                      <span className="num">{formatDate(e.date, e.datePrecision)}</span> · {EVENT_TYPE_LABELS[e.type]}
                    </p>
                    <p className="mt-0.5 text-sm">{e.summary}</p>
                    {eventMayBeEarlier(e) && <p className="mt-0.5 text-xs text-ink-muted">{MAY_BE_EARLIER_NOTE}</p>}
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                      <ExtLink href={e.sourceUrl} />
                      <VerificationBadge level={e.verification} />
                      <span>{e.sourceType === 'primary' ? 'Primary source' : 'Secondary source'}</span>
                      {e.sourcePublishedDate && <span>published {formatDate(e.sourcePublishedDate)}</span>}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-ink-soft">No events recorded.</p>
            )}
          </Section>

          <Section id="sources" title="Sources">
            <ul className="divide-y divide-line">
              {p.sources.map((s) => (
                <li key={s.url} className="py-3 [overflow-wrap:anywhere] first:pt-0 last:pb-0">
                  <ExtLink href={s.url} className="font-medium">
                    {s.title ?? s.url}
                  </ExtLink>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                    {s.publisher && <span>{s.publisher}</span>}
                    <span>{s.publishedDate ? `Published ${formatDate(s.publishedDate)}` : 'Publication date not recorded'}</span>
                    <span>{SOURCE_TYPE_LABELS[s.type]}</span>
                    <span className="inline-flex items-center gap-1">
                      <VerificationBadge level={s.verification} /> {VERIFICATION_LABELS[s.verification]}
                    </span>
                    {s.accessedDate && <span>Accessed {formatDate(s.accessedDate)}</span>}
                  </p>
                </li>
              ))}
            </ul>
          </Section>

          {changes.length > 0 && (
            <Section id="changes" title="Change log">
              <ul className="space-y-3 text-sm">
                {changes.map((c) => (
                  <li key={c.id}>
                    <p>
                      <code className="text-xs">{c.field}</code>: <span className="text-ink-muted line-through">{valueText(c.previousValue)}</span> →{' '}
                      <span className="font-medium">{valueText(c.newValue)}</span>
                    </p>
                    <p className="text-xs text-ink-muted">
                      {c.reason} · {CHANGE_VERIFICATION_LABELS[c.verificationStatus]} · {formatDubaiDateTime(c.appliedAt)} · <ExtLink href={c.evidenceUrl}>evidence</ExtLink>
                    </p>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        <div className="min-w-0 space-y-5">
          <Section id="completion" title="Completion">
            <Dl
              items={[
                ['Delivery', delivery ? DELIVERY_LABELS[delivery] : 'Not delivered'],
                [
                  'Actual',
                  p.actualCompletion ? (
                    <span key="a">
                      {formatDate(p.actualCompletion.date, p.actualCompletion.datePrecision)} · <ExtLink href={p.actualCompletion.sourceUrl}>evidence</ExtLink>
                      {completionMayBeEarlier(p) && <span className="mt-1 block text-xs text-ink-muted">{MAY_BE_EARLIER_NOTE}</span>}
                    </span>
                  ) : (
                    'Not yet delivered'
                  ),
                ],
                [
                  'Forecast',
                  p.forecastCompletion ? (
                    <span key="f">
                      {formatDate(p.forecastCompletion.date, p.forecastCompletion.datePrecision)}{' '}
                      <span className="text-xs text-amber-900">(forecast)</span>
                      {p.forecastCompletion.sourceUrl && (
                        <>
                          {' '}
                          · <ExtLink href={p.forecastCompletion.sourceUrl}>source</ExtLink>
                        </>
                      )}
                    </span>
                  ) : (
                    'None published'
                  ),
                ],
              ]}
            />
          </Section>

          <Section id="investment" title="Investment">
            {p.investment ? (
              <Dl
                items={[
                  ['Value', p.investment.disclosed && p.investment.amount && p.investment.currency ? formatMoney(p.investment.amount, p.investment.currency) : 'Not disclosed'],
                  ...(p.investment.amountAed && p.investment.currency !== 'AED'
                    ? ([['In AED', `${formatMoney(p.investment.amountAed, 'AED')} (${AED_DERIVATION_LABELS[p.investment.amountAedDerivation!]})`]] as [ReactNode, ReactNode][])
                    : []),
                  ...(p.investment.disclosed
                    ? ([['Scope', INVESTMENT_SCOPE_LABELS[investmentScopeOf(p.investment)]]] as [ReactNode, ReactNode][])
                    : []),
                  ['Covers', p.investment.basis || '—'],
                  ...(p.investment.sourceUrl ? ([['Source', <ExtLink key="s" href={p.investment.sourceUrl} />]] as [ReactNode, ReactNode][]) : []),
                ]}
              />
            ) : (
              <p className="text-sm text-ink-soft">No investment information recorded.</p>
            )}
          </Section>

          <Section id="grade" title="Classification evidence">
            <Dl
              items={[
                ['Grade-A', <GradeBadge key="g" grade={p.gradeA} />],
                ['Grade-A evidence', p.gradeAEvidence ?? 'None recorded'],
                ['Net new supply', NET_NEW_LABELS[p.netNew]],
                ['Net-new evidence', p.netNewEvidence ?? 'None recorded'],
              ]}
            />
          </Section>

          <Section id="verification" title="Verification">
            <Dl
              items={[
                ['Last verified', formatDate(p.lastVerified)],
                ['Confidence', CONFIDENCE_LABELS[p.confidence]],
                ['Origin', PROVENANCE_LABELS[p.provenance]],
                ...(p.seedNote ? ([['Seed note', p.seedNote]] as [ReactNode, ReactNode][]) : []),
              ]}
            />
            {p.unresolvedQuestions.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold">Unresolved questions</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-muted">
                  {p.unresolvedQuestions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
          </Section>

          {(parent || phases.length > 0) && (
            <Section id="phases" title="Phases">
              {parent && (
                <p className="text-sm">
                  Phase of <a href={hrefFor(`/project/${parent.id}`)}>{parent.name}</a>
                </p>
              )}
              {phases.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {phases.map((c) => (
                    <li key={c.id}>
                      <a href={hrefFor(`/project/${c.id}`)}>{c.phaseLabel ?? c.name}</a> <StatusBadge status={c.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
