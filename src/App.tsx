/**
 * PLACEHOLDER App — proves the data wiring only. The UI worker replaces this.
 */
import { useEffect, useState } from 'react';
import { computeMetrics, type Metrics } from '../shared/index.ts';
import { loadSiteData, type SiteData } from './lib/loadData.ts';

const m2 = (n: number) => `${Math.round(n).toLocaleString('en-GB')} m²`;

export default function App() {
  const [data, setData] = useState<SiteData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const year = new Date().getUTCFullYear();

  useEffect(() => {
    const ctrl = new AbortController();
    loadSiteData(ctrl.signal).then(setData, (e: unknown) => {
      if (!ctrl.signal.aborted) setError(String(e));
    });
    return () => ctrl.abort();
  }, []);

  if (error) return <pre className="p-4 text-red-700">Error loading data: {error}</pre>;
  if (!data) return <p className="p-4">Loading data…</p>;

  const m: Metrics = computeMetrics(data.register.projects, year);
  return (
    <main className="mx-auto max-w-3xl p-4 font-sans text-sm leading-6">
      <h1 className="mb-2 text-xl font-semibold">Dubai Logistics Investment Tracker</h1>
      <p>Placeholder page: data wiring check. {data.register.projects.length} projects in register.</p>
      <p>Last run status: {data.meta.lastRunStatus}. This register is not exhaustive.</p>
      <h2 className="mt-4 font-semibold">Headline metrics for {year} (Dubai only)</h2>
      <ul className="list-disc pl-6">
        <li>
          Grade-A delivered (confirmed): {m.gradeADelivered.projectCount} projects; GFA {m2(m.gradeADelivered.areas.warehouse_gfa.totalM2)}; GLA{' '}
          {m2(m.gradeADelivered.areas.gla.totalM2)}
        </li>
        <li>
          Grade-A delivered (probable): {m.gradeAProbableDelivered.projectCount} projects; GFA{' '}
          {m2(m.gradeAProbableDelivered.areas.warehouse_gfa.totalM2)}; GLA {m2(m.gradeAProbableDelivered.areas.gla.totalM2)}
        </li>
        <li>Other modern delivered: {m.otherModernDelivered.projectCount} projects</li>
        <li>Under construction: {m.underConstruction.all.projectCount} projects ({m.underConstruction.gradeA.projectCount} Grade-A confirmed/probable)</li>
        <li>Committed, not started: {m.committedNotStarted.projectCount}</li>
        <li>Non-binding (proposed / MoU / term sheet): {m.nonBinding.count}</li>
        <li>Investment announcements in {year}: {m.investmentAnnouncements.projectCount} projects</li>
        <li>Regional context (outside Dubai): {m.regionalContext.projectCount} projects</li>
      </ul>
    </main>
  );
}
