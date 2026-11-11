/**
 * Data context: loads the site data once and exposes derived lookups.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  isDeliveredStatus,
  umbrellaIdSet,
  yearOf,
  INVESTMENT_ANNOUNCEMENT_EVENT_TYPES,
  type EventType,
  type Project,
} from '../../shared/index.ts';
import { loadSiteData, type SiteData } from './loadData.ts';

/** True when the fictional fixture data was requested and is allowed in this build. */
export function fixturesRequested(): boolean {
  const allowed = import.meta.env.DEV || import.meta.env.VITE_ENABLE_FIXTURES === '1';
  if (!allowed) return false;
  return new URLSearchParams(window.location.search).get('fixtures') === '1';
}

export interface DataState {
  status: 'loading' | 'error' | 'ready';
  error?: string;
  data?: SiteData;
  isFixtures: boolean;
  retry: () => void;
}

const Ctx = createContext<DataState | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const isFixtures = fixturesRequested();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Omit<DataState, 'retry' | 'isFixtures'>>({ status: 'loading' });
  useEffect(() => {
    const ctrl = new AbortController();
    setState({ status: 'loading' });
    const load: Promise<SiteData> =
      (import.meta.env.DEV || import.meta.env.VITE_ENABLE_FIXTURES === '1') && isFixtures
      ? import('./fixtureData.ts').then((m) => m.fixtureSiteData())
      : loadSiteData(ctrl.signal);
    load.then(
      (data) => !ctrl.signal.aborted && setState({ status: 'ready', data }),
      (e: unknown) => {
        if (ctrl.signal.aborted) return;
        const msg = e instanceof Error ? e.message : String(e);
        setState({ status: 'error', error: msg.length > 400 ? `${msg.slice(0, 400)}…` : msg });
      },
    );
    return () => ctrl.abort();
  }, [attempt, isFixtures]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const value = useMemo(() => ({ ...state, isFixtures, retry }), [state, isFixtures, retry]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDataState(): DataState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDataState outside DataProvider');
  return v;
}

export interface Derived {
  data: SiteData;
  projects: Project[];
  byId: Map<string, Project>;
  umbrellas: Set<string>;
  /** Years with any delivery or investment announcement, ascending. */
  years: number[];
  /** Default reporting year: latest year with a delivery or announcement, else the current year. */
  defaultYear: number;
  isFixtures: boolean;
}

/** Years with activity (actual completions + investment-announcement events) among Dubai projects. */
export function activityYears(projects: readonly Project[]): number[] {
  const s = new Set<number>();
  const annTypes = INVESTMENT_ANNOUNCEMENT_EVENT_TYPES as readonly EventType[];
  for (const p of projects) {
    if (p.emirate !== 'Dubai') continue;
    if (isDeliveredStatus(p.status) && p.actualCompletion) s.add(yearOf(p.actualCompletion.date));
    for (const e of p.events) if (annTypes.includes(e.type)) s.add(yearOf(e.date));
  }
  return [...s].sort((a, b) => a - b);
}

export function deriveData(data: SiteData, isFixtures: boolean, now = new Date()): Derived {
  const projects = data.register.projects;
  const years = activityYears(projects);
  const current = now.getUTCFullYear();
  const deliveredYears = projects
    .filter((p) => p.emirate === 'Dubai' && isDeliveredStatus(p.status) && p.actualCompletion)
    .map((p) => yearOf(p.actualCompletion!.date));
  const defaultYear = deliveredYears.length ? Math.max(...deliveredYears) : years.length ? years[years.length - 1]! : current;
  return {
    data,
    projects,
    byId: new Map(projects.map((p) => [p.id, p])),
    umbrellas: umbrellaIdSet(projects),
    years,
    defaultYear,
    isFixtures,
  };
}

/** Selectable reporting years: from the earliest activity year (max 10 back) to max(current, latest). */
export function yearChoices(d: Pick<Derived, 'years' | 'defaultYear'>, now = new Date()): number[] {
  const current = now.getUTCFullYear();
  const hi = Math.max(current, d.defaultYear, d.years[d.years.length - 1] ?? current);
  const lo = Math.max(Math.min(d.years[0] ?? current, d.defaultYear), hi - 10);
  const out: number[] = [];
  for (let y = hi; y >= lo; y--) out.push(y);
  return out;
}

const DerivedCtx = createContext<Derived | null>(null);
export const DerivedProvider = DerivedCtx.Provider;

export function useData(): Derived {
  const v = useContext(DerivedCtx);
  if (!v) throw new Error('useData outside a ready data state');
  return v;
}
