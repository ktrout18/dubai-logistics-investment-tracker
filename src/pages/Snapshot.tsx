/**
 * Briefing snapshot: two fixed 16:9 slides mirroring the owner's PDF, for
 * screen capture into PowerPoint or printing. No app chrome on the slides.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  PRESENTATION_CATEGORIES,
  PRESENTATION_CATEGORY_LABELS,
  computePresentedTotals,
  isRegional,
  sumPresentedArea,
  type PresentedTotals,
  type Project,
} from '../../shared/index.ts';
import { CATEGORY_COLORS, briefingYearOf, derivePresentation } from '../lib/presentation.ts';
import { useData } from '../lib/data.tsx';
import { formatDate, formatNumber, hostOf } from '../lib/format.ts';
import { useHashLocation } from '../lib/router.ts';

const W = 1600;
const H = 900;

function SlideFrame({ children, label }: { children: ReactNode; label: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / W)));
    ro.observe(el);
    setScale(Math.min(1, el.clientWidth / W));
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={outer} className="slide-print w-full">
      <div className="slide-outer mx-auto overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.12)]" style={{ width: W * scale, height: H * scale }}>
        <section
          aria-label={label}
          className="slide-inner origin-top-left bg-white text-ink"
          style={{ width: W, height: H, transform: `scale(${scale})` }}
        >
          {children}
        </section>
      </div>
    </div>
  );
}

function PartnerChips({ names }: { names: string[] }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {names.map((n) => (
        <span key={n} className="whitespace-nowrap rounded-full border border-[#C3CED1] bg-[#F2F5F6] px-2.5 py-[1px] text-[15px] font-medium leading-6">
          {n}
        </span>
      ))}
    </span>
  );
}

function Legend() {
  return (
    <ul className="flex items-center gap-x-5 whitespace-nowrap text-[14px] text-ink-muted">
      {PRESENTATION_CATEGORIES.map((c) => (
        <li key={c} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm" style={{ background: CATEGORY_COLORS[c] }} />
          {PRESENTATION_CATEGORY_LABELS[c]}
        </li>
      ))}
    </ul>
  );
}

interface Row {
  p: Project;
  pres: NonNullable<Project['presentation']>;
}

function AreaBar({ row, max, width }: { row: Row; max: number; width: number }) {
  const { pres } = row;
  const isFloor = pres.presentedAreaKind === 'floor' && pres.presentedAreaM2 !== undefined;
  if (!isFloor) return <span className="text-[15px] italic text-ink-muted">{pres.areaLabel}</span>;
  const w = Math.max(3, (pres.presentedAreaM2! / max) * width);
  return (
    <span className="flex items-center gap-2" title={`${pres.areaLabel} m²`}>
      <span
        aria-hidden="true"
        className="block h-[18px] rounded-r-[4px]"
        style={{
          width: w,
          background: CATEGORY_COLORS[pres.category],
          opacity: pres.countedInPresentedTotal ? 1 : 0.45,
        }}
      />
      <span className="num whitespace-nowrap text-[15px] font-medium">
        {pres.areaLabel}
        {!pres.countedInPresentedTotal && <sup className="ml-0.5 text-ink-soft">†</sup>}
      </span>
    </span>
  );
}

function SlideHeader({ kicker, title, sub }: { kicker: string; title: string; sub?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-8">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold uppercase tracking-[0.12em] text-[#00838F]">{kicker}</p>
        <h2 className="mt-1 text-[38px] font-semibold leading-tight tracking-tight">{title}</h2>
        {sub && <p className="mt-1 text-[19px] text-ink-muted">{sub}</p>}
      </div>
      <div className="shrink-0 pt-2">
        <Legend />
      </div>
    </header>
  );
}

function SlideFooter({ notes, sourceLine, asOf }: { notes: ReactNode[]; sourceLine: string; asOf?: string }) {
  return (
    <footer className="absolute bottom-0 left-0 right-0 border-t border-line px-14 pb-5 pt-3 text-[13px] leading-snug text-ink-muted">
      {notes.length > 0 && (
        <ul className="mb-1.5 space-y-0.5">
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      <p className="flex justify-between gap-6">
        <span>{sourceLine}</span>
        {asOf && <span className="whitespace-nowrap font-medium text-ink">As of {asOf}</span>}
      </p>
    </footer>
  );
}

function topHosts(rows: Row[], n = 5): string[] {
  const counts = new Map<string, number>();
  for (const { p } of rows) for (const s of p.sources) counts.set(hostOf(s.url), (counts.get(hostOf(s.url)) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([h]) => h);
}

function toRows(ps: Project[]): Row[] {
  return ps.filter((p) => p.presentation).map((p) => ({ p, pres: p.presentation! }));
}

/** When the register carries no briefing labels at all, derive them so the snapshot still works. */
function derivedTotals(projects: readonly Project[], year: number): PresentedTotals {
  const umbrellas = new Set(projects.filter((p) => p.parentId).map((p) => p.parentId!));
  const dubai = projects.filter((p) => !isRegional(p) && !umbrellas.has(p.id));
  const withPres: Project[] = dubai.map((p) => ({ ...p, presentation: derivePresentation(p, { counted: true }) }));
  const sec = (p: Project) => p.presentation?.section;
  const pick = (f: (p: Project) => boolean) =>
    withPres.filter(f).sort((a, b) => (b.presentation?.presentedAreaM2 ?? 0) - (a.presentation?.presentedAreaM2 ?? 0));
  const openings = pick((p) => sec(p) === 'openings' && Number(p.actualCompletion?.date.slice(0, 4)) === year);
  const completedOnlyCount = openings.filter((p) => p.status === 'construction_completed').length;
  const beingBuilt = pick((p) => sec(p) === 'being_built');
  return {
    year,
    openings: {
      rows: openings,
      openedCount: openings.length - completedOnlyCount,
      completedOnlyCount,
      statusCompletedOnlyCount: completedOnlyCount,
      disclosedFloorCount: openings.filter((p) => p.presentation?.countedInPresentedTotal).length,
      floorAreaM2: sumPresentedArea(openings),
    },
    beingBuilt: { rows: beingBuilt, floorAreaM2: sumPresentedArea(beingBuilt) },
    signedOrAnnounced: { rows: pick((p) => sec(p) === 'signed_or_announced') },
    notCounted: { rows: [] },
    addedAfterPdf: { rows: [] },
  };
}

export function Snapshot() {
  const { projects, data, defaultYear, isFixtures, umbrellas } = useData();
  const { params } = useHashLocation();
  const clean = params.get('clean') === '1';
  const hasBriefing = projects.some((p) => p.presentation);
  const presented = useMemo(() => computePresentedTotals(projects, defaultYear), [projects, defaultYear]);
  const year = (hasBriefing ? briefingYearOf(presented.openings.rows) : undefined) ?? (Number(params.get('year')) || defaultYear);
  const totals = useMemo(
    () => (hasBriefing ? computePresentedTotals(projects, year) : derivedTotals(projects, year)),
    [hasBriefing, projects, year],
  );
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const t = document.title;
    document.title = `Briefing snapshot ${year} · Dubai Logistics Investment Tracker`;
    return () => {
      document.title = t;
    };
  }, [year]);

  const openings = toRows(totals.openings.rows);
  const built = toRows(totals.beingBuilt.rows);
  const signed = toRows(totals.signedOrAnnounced.rows);
  const notCounted = toRows(totals.notCounted.rows);
  const after = totals.addedAfterPdf.rows.length + (hasBriefing ? projects.filter((p) => !p.presentation && !isRegional(p) && !umbrellas.has(p.id)).length : 0);
  const all = [...openings, ...built, ...signed];

  const asOfIso = [data.meta.lastSuccessfulRun?.slice(0, 10), data.register.updatedAt?.slice(0, 10), ...all.map((r) => r.p.lastVerified)]
    .filter((x): x is string => Boolean(x))
    .sort()
    .pop();
  const asOf = asOfIso ? formatDate(asOfIso) : undefined;
  const hosts = topHosts(all);
  const sourceLine = `Sources: ${hosts.length ? `${hosts.join(', ')} and others` : 'company and government releases'}. Every row links to its sources in the Dubai Logistics Investment Tracker.${isFixtures ? ' FICTIONAL TEST DATA.' : ''}`;
  const o = totals.openings;

  const floorMax1 = Math.max(1, ...openings.filter((r) => r.pres.presentedAreaKind === 'floor').map((r) => r.pres.presentedAreaM2 ?? 0));
  const floorMax2 = Math.max(1, ...built.filter((r) => r.pres.presentedAreaKind === 'floor').map((r) => r.pres.presentedAreaM2 ?? 0));
  const rowH = Math.max(24, Math.min(37, Math.floor(460 / Math.max(1, openings.length))));
  const anyUncounted1 = openings.some((r) => r.pres.presentedAreaKind === 'floor' && !r.pres.countedInPresentedTotal);
  const anyUncounted2 = built.some((r) => r.pres.presentedAreaKind === 'floor' && !r.pres.countedInPresentedTotal);

  const commonNotes: ReactNode[] = [
    <>Floor space as reported: each figure is the area its source gives (gross, leasable or built-up), so bases differ and totals are indicative. Strict per-basis figures are on the tracker.</>,
  ];
  const differNote = (rows: Row[]) => {
    const n = rows.filter((r) => r.pres.differsFromSources).length;
    return n ? [<>Sources word or date {n} of these rows differently; see each project page.</>] : [];
  };

  const notes1 = [...commonNotes, ...differNote(openings)];
  if (anyUncounted1) notes1.push(<>† Shown for reference, not included in the total.</>);
  if (notCounted.length)
    notes1.push(<>Not counted (unconfirmed): {notCounted.map((r) => `${r.pres.partners[0] ?? r.p.name} ${r.pres.descriptor}`).join('; ')}.</>);
  const notes2 = [...commonNotes, ...differNote([...built, ...signed.slice(0, 8)])];
  if (anyUncounted2) notes2.push(<>† Shown for reference, not included in the total.</>);
  if (after > 0) notes2.push(<>{after} further project{after === 1 ? ' has' : 's have'} been added to the register since this briefing; see the tracker.</>);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#E9EEEF] pb-10">
      {!clean && (
        <div className="no-print mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
          <a href="#/" className="font-medium">
            ← Back to the tracker
          </a>
          <p className="text-ink-muted">Two 16:9 slides for screen capture or printing (landscape).</p>
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={copy}>
              {copied ? 'Link copied' : 'Copy link'}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => window.print()}>
              Print / save PDF
            </button>
          </div>
        </div>
      )}
      {isFixtures && !clean && (
        <p className="no-print mb-2 text-center text-sm font-medium text-amber-900">Fictional test data (development fixtures).</p>
      )}
      <main className="mx-auto max-w-[1600px] space-y-6 px-4">
        <h1 className="sr-only">Briefing snapshot, {year}</h1>
        {/* Slide 1: openings */}
        <SlideFrame label={`Slide 1: openings and completions ${year}`}>
          <div className="relative h-full px-14 pt-11">
            <SlideHeader
              kicker={`Dubai logistics · ${year}`}
              title={`Openings and completions in ${year}`}
              sub={
                o.rows.length ? (
                  <>
                    Dubai opened {o.openedCount} logistics {o.openedCount === 1 ? 'facility' : 'facilities'}
                    {o.completedOnlyCount > 0 && <> and completed {o.completedOnlyCount === 1 ? 'one' : o.completedOnlyCount} more</>}, with about{' '}
                    {formatNumber(Math.round(o.floorAreaM2 / 1000) * 1000)} m² of floor space as reported
                  </>
                ) : (
                  'No openings recorded for this year yet'
                )
              }
            />
            {openings.length ? (
              <table className="mt-6 w-full table-fixed border-collapse text-[16px]">
                <caption className="sr-only">Openings and completions</caption>
                <colgroup>
                  <col style={{ width: 360 }} />
                  <col style={{ width: 380 }} />
                  <col style={{ width: 170 }} />
                  <col />
                  <col style={{ width: 170 }} />
                </colgroup>
                <thead>
                  <tr className="border-b-2 border-[#00838F] text-left text-[13px] font-semibold uppercase tracking-wider text-ink-muted">
                    <th scope="col" className="pb-1.5">Companies</th>
                    <th scope="col" className="pb-1.5">Facility</th>
                    <th scope="col" className="pb-1.5">Location</th>
                    <th scope="col" className="pb-1.5">Floor space, m²</th>
                    <th scope="col" className="pb-1.5 text-right">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {openings.map((r) => (
                    <tr key={r.p.id} className="border-b border-[#E6EBEC]" style={{ height: rowH }}>
                      <td className="pr-3">
                        <span className="flex items-center gap-2">
                          <span aria-hidden="true" className="h-[22px] w-1.5 shrink-0 rounded-sm" style={{ background: CATEGORY_COLORS[r.pres.category] }} />
                          <PartnerChips names={r.pres.partners} />
                        </span>
                      </td>
                      <td className="truncate pr-3">
                        {r.pres.descriptor}
                      </td>
                      <td className="truncate pr-3 text-ink-muted">{r.pres.locationLabel}</td>
                      <td className="pr-3">
                        <AreaBar row={r} max={floorMax1} width={330} />
                      </td>
                      <td className="whitespace-nowrap text-right text-ink-muted">{r.pres.dateLabel}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-ink" style={{ height: 44 }}>
                    <th scope="row" colSpan={3} className="text-left text-[17px] font-semibold">
                      Total floor space, {o.disclosedFloorCount} {o.disclosedFloorCount === 1 ? 'facility' : 'facilities'} that disclosed it
                    </th>
                    <td colSpan={2} className="num text-[20px] font-semibold text-[#00838F]">
                      {formatNumber(o.floorAreaM2)} m²
                    </td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              <p className="mt-16 text-center text-[22px] text-ink-muted">No openings or completions are recorded for {year} yet.</p>
            )}
            <SlideFooter notes={notes1} sourceLine={sourceLine} asOf={asOf} />
          </div>
        </SlideFrame>

        {/* Slide 2: pipeline */}
        <SlideFrame label="Slide 2: pipeline">
          <div className="relative h-full px-14 pt-11">
            <SlideHeader kicker={`Dubai logistics · pipeline`} title="Being built, signed and announced" />
            <div className="mt-6 grid grid-cols-[1fr_1fr] gap-10">
              <section aria-label="Being built">
                <h3 className="border-b-2 border-[#00838F] pb-1.5 text-[20px] font-semibold">
                  Being built <span className="text-ink-soft">·</span>{' '}
                  <span className="num text-[#00838F]">{formatNumber(totals.beingBuilt.floorAreaM2)} m²</span>{' '}
                  <span className="font-normal text-ink-muted">floor space</span>
                </h3>
                {built.length ? (
                  <ul>
                    {built.map((r) => (
                      <li key={r.p.id} className="border-b border-[#E6EBEC] py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-2">
                            <span aria-hidden="true" className="h-[22px] w-1.5 shrink-0 rounded-sm" style={{ background: CATEGORY_COLORS[r.pres.category] }} />
                            <PartnerChips names={r.pres.partners} />
                          </span>
                          <span className="whitespace-nowrap text-[15px] text-ink-muted">{r.pres.dateLabel}</span>
                        </div>
                        <div className="mt-1.5 grid grid-cols-[1fr_300px] items-center gap-3 pl-3.5">
                          <span className="truncate text-[16px]">
                            {r.pres.descriptor}
                                <span className="text-ink-muted"> · {r.pres.locationLabel}</span>
                          </span>
                          <AreaBar row={r} max={floorMax2} width={200} />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 text-[17px] text-ink-muted">Nothing under construction is recorded.</p>
                )}
              </section>
              <section aria-label="Signed or announced">
                <h3 className="border-b-2 border-[#00838F] pb-1.5 text-[20px] font-semibold">
                  Signed or announced <span className="text-ink-soft">·</span> <span className="font-normal text-ink-muted">Area type varies</span>
                </h3>
                {signed.length ? (
                  <ul className="mt-3 grid grid-cols-2 gap-3">
                    {signed.slice(0, 8).map((r) => (
                      <li key={r.p.id} className="rounded-md border border-[#DCE3E5] bg-[#FAFBFB] p-3" style={{ borderLeft: `5px solid ${CATEGORY_COLORS[r.pres.category]}` }}>
                        <PartnerChips names={r.pres.partners.slice(0, 2)} />
                        <p className="mt-1.5 truncate text-[16px] font-medium">
                          {r.pres.descriptor}
                          </p>
                        <p className="mt-0.5 truncate text-[15px] text-ink-muted">{r.pres.locationLabel}</p>
                        <p className="num mt-0.5 truncate text-[15px] font-semibold">{r.pres.areaLabel}</p>
                        <p className="mt-0.5 truncate text-[14px] text-ink-muted">{r.pres.dateLabel}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 text-[17px] text-ink-muted">No signed or announced projects are recorded.</p>
                )}
                {signed.length > 8 && <p className="mt-2 text-[14px] text-ink-muted">+ {signed.length - 8} more on the tracker</p>}
              </section>
            </div>
            <SlideFooter notes={notes2} sourceLine={sourceLine} asOf={asOf} />
          </div>
        </SlideFrame>
      </main>
    </div>
  );
}
