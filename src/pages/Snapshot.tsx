/**
 * Briefing snapshot: two fixed 16:9 slides for screen capture into PowerPoint
 * or printing. Every sentence, row, chip, figure and subtotal comes from
 * `computeBriefing` (shared/briefing.ts), i.e. from the audited records and
 * the shared counting rules. No app chrome on the slides.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  BRIEFING_CATEGORIES,
  BRIEFING_CATEGORY_LABELS,
  DELIVERY_LABELS,
  INDEXED_EVIDENCE_MARK,
  INDEXED_EVIDENCE_NOTE,
  computeBriefing,
  subtotalsText,
  todayIso,
  type BriefingRow,
  type BriefingSection,
  type FloorSubtotal,
  type Project,
} from '../../shared/index.ts';
import { CATEGORY_COLORS } from '../lib/briefingColors.ts';
import { useData } from '../lib/data.tsx';
import { formatDate, hostOf, plural } from '../lib/format.ts';
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

function PartnerChips({ names, size = 15 }: { names: string[]; size?: number }) {
  return (
    <span className="flex min-w-0 flex-wrap gap-1">
      {names.map((n) => (
        <span
          key={n}
          className="max-w-full rounded-[10px] border border-[#C3CED1] bg-[#F2F5F6] px-2 py-[1px] font-medium"
          style={{ fontSize: size, lineHeight: `${Math.round(size * 1.3)}px` }}
        >
          {n}
        </span>
      ))}
    </span>
  );
}

function Swatch({ color, outlined }: { color: string; outlined?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3 w-3 rounded-sm"
      style={outlined ? { border: `2px solid ${color}`, background: '#fff' } : { background: color }}
    />
  );
}

function Legend() {
  return (
    <ul className="flex flex-col items-end gap-y-1 whitespace-nowrap text-[14px] text-ink-muted">
      <li className="flex items-center gap-x-5">
        {BRIEFING_CATEGORIES.map((c) => (
          <span key={c} className="flex items-center gap-1.5">
            <Swatch color={CATEGORY_COLORS[c]} />
            {BRIEFING_CATEGORY_LABELS[c]}
          </span>
        ))}
      </li>
      <li className="flex items-center gap-1.5">
        <Swatch color={CATEGORY_COLORS.other_modern} outlined />
        Outlined bar: area basis not stated by the source
      </li>
    </ul>
  );
}

/** A warehouse row's floor figure as a bar (solid when the basis is stated, outlined when not), else text. */
function AreaCell({ row, max, width }: { row: BriefingRow; max: number; width: number }) {
  const a = row.floor ?? row.otherArea;
  if (!a) return <span className="text-[15px] italic text-ink-soft">Not disclosed</span>;
  const tag = (
    <span className="ml-1.5 whitespace-nowrap rounded border border-[#CBD5D8] px-1 text-[12px] font-medium uppercase tracking-wide text-ink-muted">
      {a.basisTag}
    </span>
  );
  if (!a.bar) {
    return (
      <span className="flex items-center text-[15px] text-ink-muted" title="Not warehouse floor space: not drawn and not in the subtotals">
        <span className="num whitespace-nowrap italic">{a.figure}</span>
        {tag}
      </span>
    );
  }
  const color = CATEGORY_COLORS[row.category];
  const w = Math.max(4, (a.valueM2 / max) * width);
  return (
    <span className="flex items-center gap-2" title={`${a.figure} ${a.basisTag}`}>
      <span
        aria-hidden="true"
        className="block h-[18px] shrink-0 rounded-r-[4px]"
        style={
          a.basisStated
            ? { width: w, background: color }
            : { width: w, background: '#fff', border: `2px solid ${color}`, boxSizing: 'border-box' }
        }
      />
      <span className="num whitespace-nowrap text-[15px] font-medium">{a.figure}</span>
      {tag}
    </span>
  );
}

function SlideHeader({ kicker, title, sub }: { kicker: string; title: string; sub?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-8">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold uppercase tracking-[0.12em] text-[#00838F]">{kicker}</p>
        <h2 className="mt-1 text-[36px] font-semibold leading-tight tracking-tight">{title}</h2>
        {sub && <p className="mt-1 text-[20px] font-medium text-ink">{sub}</p>}
      </div>
      <div className="shrink-0 pt-2">
        <Legend />
      </div>
    </header>
  );
}

function SlideFooter({ notes, sourceLine, asOf }: { notes: ReactNode[]; sourceLine: string; asOf?: string }) {
  // asOf: the latest `lastVerified` of the projects shown (the day their sources were last checked).
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
        {asOf && <span className="whitespace-nowrap font-medium text-ink">Sources last checked {asOf}</span>}
      </p>
    </footer>
  );
}

function Subtotals({ subtotals, size = 18 }: { subtotals: readonly FloorSubtotal[]; size?: number }) {
  if (!subtotals.length) return <span className="text-ink-muted">No warehouse area disclosed</span>;
  return (
    <span className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
      {subtotals.map((s) => (
        <span key={s.basis} className="whitespace-nowrap" style={{ fontSize: size }}>
          <span className="num font-semibold text-[#00838F]">{s.text}</span>{' '}
          <span className="text-[0.8em] font-medium uppercase tracking-wide text-ink-muted">{s.basisTag}</span>
          {s.qualifiedIds.length > 0 && <sup className="ml-0.5 text-ink-soft">§</sup>}
        </span>
      ))}
    </span>
  );
}

function topHosts(projects: readonly Project[], n = 5): string[] {
  const counts = new Map<string, number>();
  for (const p of projects) for (const s of p.sources) counts.set(hostOf(s.url), (counts.get(hostOf(s.url)) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([h]) => h);
}

function DateText({ row }: { row: BriefingRow }) {
  return (
    <span className={row.date.forecastPassed ? 'text-amber-900' : undefined}>
      {row.date.main}
      {row.date.mayBeEarlier && <sup className="ml-0.5 text-ink-soft">*</sup>}
      {row.date.kind === 'actual' && row.indexedEvidence?.date && <sup className="ml-0.5 font-semibold text-amber-900">{INDEXED_EVIDENCE_MARK}</sup>}
      {row.date.forecast && <> · {row.date.forecast}</>}
    </span>
  );
}

const anyQualified = (s: BriefingSection) => s.floorSubtotals.some((t) => t.qualifiedIds.length > 0);

export function Snapshot() {
  const { projects, byId, defaultYear, isFixtures } = useData();
  const { params } = useHashLocation();
  const clean = params.get('clean') === '1';
  const yParam = Number(params.get('year'));
  const year = Number.isInteger(yParam) && yParam > 1900 ? yParam : defaultYear;
  const b = useMemo(() => computeBriefing(projects, year, todayIso()), [projects, year]);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const t = document.title;
    document.title = `Briefing snapshot ${year} · Dubai Logistics Investment Tracker`;
    return () => {
      document.title = t;
    };
  }, [year]);

  const d = b.delivered;
  const built = b.beingBuilt;
  const signed = b.signedOrAnnounced;
  const shownProjects = [...d.rows, ...built.rows, ...signed.rows].map((r) => byId.get(r.id)).filter((p): p is Project => Boolean(p));

  const asOfIso = shownProjects
    .map((p) => p.lastVerified)
    .sort()
    .pop();
  const asOf = asOfIso ? formatDate(asOfIso) : undefined;
  const hosts = topHosts(shownProjects);
  const sourceLine = `Sources: ${hosts.length ? `${hosts.join(', ')} and others` : 'company and government releases'}. Every row links to its sources in the Dubai Logistics Investment Tracker.${isFixtures ? ' FICTIONAL TEST DATA.' : ''}`;

  const barMax = (rows: BriefingRow[]) => Math.max(1, ...rows.filter((r) => r.floor?.bar).map((r) => r.floor!.valueM2));
  const max1 = barMax(d.rows);
  const max2 = barMax(built.rows);
  const rowH = Math.max(26, Math.min(38, Math.floor(400 / Math.max(1, d.rows.length))));

  const areaNote = (
    <>
      Bars: warehouse area on the basis each source states; outlined: basis not stated. Bases are subtotalled separately and never added
      together. Areas of other logistics infrastructure are shown as text only.
    </>
  );
  const notes1: ReactNode[] = [
    <>
      {DELIVERY_LABELS.opened}: a source reports the opening or start of operations. {DELIVERY_LABELS.construction_completed}: completion reported, no
      opening reported. {areaNote}
    </>,
  ];
  const marks1: ReactNode[] = [];
  const mayBeEarlierMark = <>* Month or period in which the source reported the event; it may have happened earlier.</>;
  if (d.rows.some((r) => r.date.mayBeEarlier)) marks1.push(mayBeEarlierMark);
  const indexedMark = (
    <>
      {INDEXED_EVIDENCE_MARK} {INDEXED_EVIDENCE_NOTE}
    </>
  );
  if (d.rows.some((r) => r.indexedEvidence)) marks1.push(indexedMark);
  if (anyQualified(d)) marks1.push(<>§ Includes a figure the source gives as &ldquo;over&rdquo;, &ldquo;nearly&rdquo; or &ldquo;about&rdquo;.</>);
  if (marks1.length) notes1.push(<>{marks1.map((m, i) => <span key={i}>{i > 0 && ' '}{m}</span>)}</>);
  const notes2: ReactNode[] = [<>Completion dates of projects being built are forecasts. {areaNote}</>];
  const marks2: ReactNode[] = [];
  if ([...built.rows, ...signed.rows].some((r) => r.date.mayBeEarlier)) marks2.push(mayBeEarlierMark);
  if (anyQualified(built)) marks2.push(<>§ Includes a figure the source gives as &ldquo;over&rdquo;, &ldquo;nearly&rdquo; or &ldquo;about&rdquo;.</>);
  if (marks2.length) notes2.push(<>{marks2.map((m, i) => <span key={i}>{i > 0 && ' '}{m}</span>)}</>);

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
    <div className="snapshot-page min-h-screen bg-[#E9EEEF] pb-10">
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
      <h1 className="sr-only">Briefing snapshot, {year}</h1>
      <main className="mx-auto max-w-[1600px] space-y-6 px-4">
        {/* Slide 1: delivered in the year */}
        <SlideFrame label={`Slide 1: openings and completions ${year}`}>
          <div className="relative h-full px-14 pt-10">
            <SlideHeader kicker={`Dubai logistics · ${year}`} title={`Openings and completions in ${year}`} sub={b.headline} />
            {d.rows.length ? (
              <table className="mt-3 w-full table-fixed border-collapse text-[16px]">
                <caption className="sr-only">Openings and completions</caption>
                <colgroup>
                  <col style={{ width: 290 }} />
                  <col style={{ width: 340 }} />
                  <col style={{ width: 150 }} />
                  <col style={{ width: 185 }} />
                  <col />
                  <col style={{ width: 115 }} />
                </colgroup>
                <thead>
                  <tr className="border-b-2 border-[#00838F] text-left text-[13px] font-semibold uppercase tracking-wider text-ink-muted">
                    <th scope="col" className="pb-1.5">Companies</th>
                    <th scope="col" className="pb-1.5">Facility</th>
                    <th scope="col" className="pb-1.5">Location</th>
                    <th scope="col" className="pb-1.5">Delivery</th>
                    <th scope="col" className="pb-1.5">Area, m² (basis)</th>
                    <th scope="col" className="pb-1.5 text-right">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {d.rows.map((r) => (
                    <tr key={r.id} className="border-b border-[#E6EBEC]" style={{ height: rowH }}>
                      <td className="py-[2px] pr-3">
                        <span className="flex items-center gap-2">
                          <span aria-hidden="true" className="h-[22px] w-1.5 shrink-0 rounded-sm" style={{ background: CATEGORY_COLORS[r.category] }} />
                          <PartnerChips names={r.partners.slice(0, 2)} size={13} />
                        </span>
                      </td>
                      <td className="py-[2px] pr-3 text-[14px] leading-[1.15]">
                        {r.descriptor}
                        {r.gradeTag && <span className="whitespace-nowrap text-[13px] text-ink-muted"> · {r.gradeTag}</span>}
                      </td>
                      <td className="py-[2px] pr-3 text-[14px] leading-[1.15] text-ink-muted">{r.location}</td>
                      <td className="whitespace-nowrap pr-3 text-[14px]">
                        <span className={r.deliveryKind === 'construction_completed' ? 'font-medium text-amber-900' : 'text-ink-muted'}>
                          {r.deliveryLabel}
                        </span>
                        {r.indexedEvidence?.status && <sup className="ml-0.5 font-semibold text-amber-900">{INDEXED_EVIDENCE_MARK}</sup>}
                      </td>
                      <td className="pr-3">
                        <AreaCell row={r} max={max1} width={130} />
                      </td>
                      <td className="whitespace-nowrap text-right text-[15px] text-ink-muted">
                        <DateText row={r} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-ink" style={{ height: 42 }}>
                    <th scope="row" colSpan={3} className="pr-3 text-left text-[15px] font-semibold leading-tight">
                      Warehouse area by basis
                      <span className="block text-[13px] font-normal text-ink-muted">
                        {d.floorDisclosedIds.length} of {plural(d.warehouseIds.length, 'warehouse facility', 'warehouse facilities')} disclosed one;{' '}
                        never added together
                      </span>
                    </th>
                    <td colSpan={3}>
                      <Subtotals subtotals={d.floorSubtotals} size={17} />
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
          <div className="relative h-full px-14 pt-10">
            <SlideHeader kicker="Dubai logistics · pipeline" title="Being built, signed and announced" />
            <div className="mt-5 grid grid-cols-[1fr_1fr] gap-10">
              <section aria-label="Being built">
                <h3 className="border-b-2 border-[#00838F] pb-1 text-[20px] font-semibold">
                  Being built <span className="text-ink-soft">·</span>{' '}
                  <span className="font-normal text-ink-muted">{plural(built.rows.length, 'project')}</span>
                </h3>
                <div className="flex items-baseline justify-between gap-3 border-b border-[#E6EBEC] py-1.5 text-[14px] text-ink-muted">
                  <span className="shrink-0">Warehouse area by basis:</span>
                  <Subtotals subtotals={built.floorSubtotals} size={16} />
                </div>
                {built.rows.length ? (
                  <ul>
                    {built.rows.map((r) => (
                      <li key={r.id} className="border-b border-[#E6EBEC] py-[4px]">
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex min-w-0 items-center gap-2">
                            <span aria-hidden="true" className="h-[20px] w-1.5 shrink-0 rounded-sm" style={{ background: CATEGORY_COLORS[r.category] }} />
                            <PartnerChips names={r.partners.slice(0, 2)} size={14} />
                          </span>
                          <span className="whitespace-nowrap text-[14px] text-ink-muted">
                            <DateText row={r} />
                          </span>
                        </div>
                        <div className="mt-1 grid grid-cols-[1fr_330px] items-center gap-3 pl-3.5">
                          <span className="text-[15px] leading-[1.2]">
                            {r.descriptor}
                            {r.gradeTag && <span className="whitespace-nowrap text-ink-muted"> · {r.gradeTag}</span>}
                            <span className="text-ink-muted"> · {r.location}</span>
                          </span>
                          <AreaCell row={r} max={max2} width={140} />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 text-[17px] text-ink-muted">Nothing under construction is recorded.</p>
                )}
              </section>
              <section aria-label="Signed or announced">
                <h3 className="border-b-2 border-[#00838F] pb-1 text-[20px] font-semibold">
                  Signed or announced <span className="text-ink-soft">·</span>{' '}
                  <span className="font-normal text-ink-muted">{plural(signed.rows.length, 'project')}; area basis varies</span>
                </h3>
                {signed.rows.length ? (
                  <ul className="mt-3 grid grid-cols-2 gap-3">
                    {signed.rows.slice(0, 8).map((r) => (
                      <li
                        key={r.id}
                        className="min-w-0 rounded-md border border-[#DCE3E5] bg-[#FAFBFB] p-2.5"
                        style={{ borderLeft: `5px solid ${CATEGORY_COLORS[r.category]}` }}
                      >
                        <PartnerChips names={r.partners.slice(0, 2)} size={14} />
                        <p className="mt-1 text-[15px] font-medium leading-[1.2]">
                          {r.descriptor}
                        </p>
                        <p className="text-[14px] leading-snug text-ink-muted">
                          {r.location} · <span className="whitespace-nowrap">{r.statusLabel}</span>
                        </p>
                        <p className="num text-[14px] font-semibold leading-snug">
                          {r.areaText}
                          {r.investment && <span className="font-normal text-ink-muted"> · {r.investment.text}</span>}
                        </p>
                        <p className="text-[13px] leading-snug text-ink-muted">
                          <DateText row={r} />
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 text-[17px] text-ink-muted">No signed or announced projects are recorded.</p>
                )}
                {signed.rows.length > 8 && <p className="mt-2 text-[14px] text-ink-muted">+ {signed.rows.length - 8} more on the tracker</p>}
              </section>
            </div>
            <SlideFooter notes={notes2} sourceLine={sourceLine} asOf={asOf} />
          </div>
        </SlideFrame>
      </main>
      <p className="sr-only">
        Delivered warehouse area by basis: {subtotalsText(d.floorSubtotals)}. Being built: {subtotalsText(built.floorSubtotals)}.
      </p>
    </div>
  );
}
