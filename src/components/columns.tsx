import {
  AREA_BASIS_LABELS,
  DELIVERY_LABELS,
  INVESTMENT_SCOPE_LABELS,
  MAY_BE_EARLIER_NOTE,
  SECTOR_LABELS,
  completionMayBeEarlier,
  deliveryKindOf,
  describeFacility,
  investmentScopeOf,
  normaliseZone,
  periodEnd,
  statusRank,
  todayIso,
  type Project,
} from '../../shared/index.ts';
import { headlineMeasure } from '../lib/areas.ts';
import { BASIS_SHORT, formatDate, formatMeasureM2, formatMoney } from '../lib/format.ts';
import { hrefFor } from '../lib/router.ts';
import type { Column } from './ProjectTable.tsx';
import { ExtLink, GradeBadge, StatusBadge } from './ui.tsx';

export function AreaCell({ p }: { p: Project }) {
  const m = headlineMeasure(p);
  if (!m) return <span className="text-ink-soft">Not disclosed</span>;
  const others = p.areas.length - 1;
  return (
    <span>
      <span className="num whitespace-nowrap font-medium">{formatMeasureM2(m)}</span>{' '}
      <abbr title={AREA_BASIS_LABELS[m.basis]} className="block text-xs text-ink-muted no-underline">
        {BASIS_SHORT[m.basis]}
      </abbr>
      {others > 0 && (
        <span className="block text-xs text-ink-soft">
          +{others} other measure{others === 1 ? '' : 's'}
        </span>
      )}
    </span>
  );
}

/** Compact evidence link: hostname, truncated, full URL in the tooltip. */
export function SourceLink({ url }: { url: string }) {
  return (
    <span className="inline-block max-w-[9rem] align-top text-sm" title={url}>
      <ExtLink href={url} className="inline-block max-w-full truncate align-top" />
    </span>
  );
}

export function companiesLine(p: Project): string {
  const parts: string[] = [];
  if (p.developer) parts.push(p.developer);
  if (p.operator && p.operator !== p.developer) parts.push(p.operator);
  if (!parts.length && p.investor) parts.push(p.investor);
  if (!parts.length && p.owner) parts.push(p.owner);
  if (!parts.length) parts.push(...p.companies.slice(0, 2));
  return parts.join(' · ');
}

export function makeColumns(umbrellas: ReadonlySet<string>) {
  const facility: Column = {
    id: 'name',
    header: 'Facility',
    sort: (p) => p.name,
    className: 'min-w-[13rem]',
    cell: (p) => {
      return (
        <span className="block">
          <a href={hrefFor(`/project/${p.id}`)} className="font-medium text-ink decoration-line hover:text-accent-800">
            {p.name}
          </a>
          <span className="mt-0.5 block text-xs text-ink-soft">
            {describeFacility(p)}
            {umbrellas.has(p.id) && ' · Umbrella (phases counted instead)'}
          </span>
        </span>
      );
    },
  };
  const companies: Column = {
    id: 'company',
    header: 'Developer / operator',
    sort: (p) => companiesLine(p),
    mobile: true,
    className: 'min-w-[8rem]',
    cell: (p) => companiesLine(p) || <span className="text-ink-soft">Not stated</span>,
  };
  const sector: Column = {
    id: 'sector',
    header: 'Sector',
    sort: (p) => SECTOR_LABELS[p.sectors[0]!],
    mobile: true,
    cell: (p) => p.sectors.map((s) => SECTOR_LABELS[s]).join(', '),
  };
  const location: Column = {
    id: 'location',
    header: 'Location / zone',
    sort: (p) => (p.zone ? normaliseZone(p.zone) : p.location),
    mobile: true,
    cell: (p) => (
      <span>
        {p.zone ? normaliseZone(p.zone) : p.location}
        {p.zone && p.location && <span className="block text-xs text-ink-soft">{p.location}</span>}
      </span>
    ),
  };
  const area: Column = {
    id: 'area',
    header: 'Area (basis)',
    sort: (p) => headlineMeasure(p)?.valueM2,
    mobile: true,
    cell: (p) => <AreaCell p={p} />,
  };
  const grade: Column = {
    id: 'grade',
    header: 'Grade-A',
    sort: (p) => ['confirmed', 'probable', 'unverified', 'not_applicable'].indexOf(p.gradeA),
    mobile: true,
    cell: (p) => <GradeBadge grade={p.gradeA} />,
  };
  const completed: Column = {
    id: 'completed',
    header: 'Date (actual)',
    sort: (p) => p.actualCompletion?.date,
    mobile: true,
    cell: (p) =>
      p.actualCompletion ? (
        <span>
          <span className="num whitespace-nowrap">{formatDate(p.actualCompletion.date, p.actualCompletion.datePrecision)}</span>
          {completionMayBeEarlier(p) && (
            <span className="block text-xs text-ink-soft" title={MAY_BE_EARLIER_NOTE}>
              date of report; may be earlier
            </span>
          )}
        </span>
      ) : (
        <span className="text-ink-soft">—</span>
      ),
  };
  const delivery: Column = {
    id: 'delivery',
    header: 'Delivery',
    sort: (p) => deliveryKindOf(p) ?? '',
    mobile: true,
    cell: (p) => {
      const k = deliveryKindOf(p);
      return k ? <span className="whitespace-nowrap">{DELIVERY_LABELS[k]}</span> : <span className="text-ink-soft">Not delivered</span>;
    },
  };
  const status: Column = {
    id: 'status',
    header: 'Status',
    sort: (p) => statusRank(p.status),
    mobile: true,
    cell: (p) => <StatusBadge status={p.status} />,
  };
  const forecast: Column = {
    id: 'forecast',
    header: 'Due (forecast)',
    sort: (p) => p.forecastCompletion?.date,
    mobile: true,
    cell: (p) =>
      p.forecastCompletion ? (
        <span className="whitespace-nowrap">
          <span className="num">{formatDate(p.forecastCompletion.date, p.forecastCompletion.datePrecision)}</span>{' '}
          <span className="rounded bg-amber-50 px-1 text-[11px] font-medium uppercase tracking-wide text-amber-900 ring-1 ring-inset ring-amber-200">
            Forecast
          </span>
          {periodEnd(p.forecastCompletion.date, p.forecastCompletion.datePrecision) < todayIso() && (
            <span className="block text-xs text-ink-soft">Date has passed</span>
          )}
        </span>
      ) : (
        <span className="text-ink-soft">Not given</span>
      ),
  };
  const announced: Column = {
    id: 'announced',
    header: 'Latest milestone',
    sort: (p) => p.latestMilestone.date,
    mobile: true,
    className: 'min-w-[10rem]',
    cell: (p) => (
      <span>
        <span className="num whitespace-nowrap">{formatDate(p.latestMilestone.date, p.latestMilestone.datePrecision)}</span>
        <span className="block text-xs text-ink-soft">{p.latestMilestone.description}</span>
      </span>
    ),
  };
  const investment: Column = {
    id: 'investment',
    header: 'Investment',
    sort: (p) => (p.investment?.disclosed ? `${p.investment.currency} ${String(p.investment.amount).padStart(15, '0')}` : undefined),
    mobile: true,
    cell: (p) =>
      p.investment?.disclosed && p.investment.amount && p.investment.currency ? (
        <span>
          <span className="num whitespace-nowrap">{formatMoney(p.investment.amount, p.investment.currency)}</span>
          {investmentScopeOf(p.investment) !== 'facility' && (
            <span className="block text-xs text-ink-soft">{INVESTMENT_SCOPE_LABELS[investmentScopeOf(p.investment)]}</span>
          )}
        </span>
      ) : p.investment ? (
        <span className="text-ink-soft">Not disclosed</span>
      ) : (
        <span className="text-ink-soft">—</span>
      ),
  };
  const completionEvidence: Column = {
    id: 'evidence',
    header: 'Source',
    mobile: true,
    cell: (p) => {
      const url = p.actualCompletion?.sourceUrl ?? p.latestMilestone.sourceUrl;
      return <SourceLink url={url} />;
    },
  };
  const milestoneEvidence: Column = {
    ...completionEvidence,
    cell: (p) => <SourceLink url={p.latestMilestone.sourceUrl} />,
  };
  return { facility, companies, sector, location, area, grade, completed, delivery, status, forecast, announced, investment, completionEvidence, milestoneEvidence };
}
