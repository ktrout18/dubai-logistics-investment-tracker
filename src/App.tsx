import { useEffect, useMemo } from 'react';
import { Layout } from './components/Layout.tsx';
import { EmptyState } from './components/ui.tsx';
import { DataProvider, DerivedProvider, deriveData, useDataState } from './lib/data.tsx';
import { useHashLocation } from './lib/router.ts';
import { Delivered, IdList, Pipeline, Regional } from './pages/Lists.tsx';
import { Method } from './pages/Method.tsx';
import { Overview } from './pages/Overview.tsx';
import { ProjectDetail } from './pages/ProjectDetail.tsx';
import { Snapshot } from './pages/Snapshot.tsx';

const SITE = 'Dubai Logistics Investment Tracker';

const TITLES: Record<string, string> = {
  '/': SITE,
  '/delivered': `Delivered and opened · ${SITE}`,
  '/pipeline': `Pipeline · ${SITE}`,
  '/regional': `Regional context · ${SITE}`,
  '/method': `Method and review · ${SITE}`,
  '/list': `Projects · ${SITE}`,
};

function Routes() {
  const { path } = useHashLocation();
  const projectId = path.startsWith('/project/') ? decodeURIComponent(path.slice('/project/'.length)) : undefined;
  switch (true) {
    case path === '/':
      return <Overview />;
    case path === '/delivered':
      return <Delivered />;
    case path === '/pipeline':
      return <Pipeline />;
    case path === '/regional':
      return <Regional />;
    case path === '/list':
      return <IdList />;
    case path === '/method':
      return <Method />;
    case projectId !== undefined:
      return <ProjectDetail id={projectId!} />;
    default:
      return (
        <div className="page mt-10">
          <EmptyState title="Page not found">
            There is no page at this address. <a href="#/">Go to the overview</a>.
          </EmptyState>
        </div>
      );
  }
}

function Shell() {
  const state = useDataState();
  const { path } = useHashLocation();
  const derived = useMemo(
    () => (state.status === 'ready' && state.data ? deriveData(state.data, state.isFixtures) : null),
    [state.status, state.data, state.isFixtures],
  );

  useEffect(() => {
    window.scrollTo(0, 0);
    if (path.startsWith('/project/') && derived) {
      const p = derived.byId.get(decodeURIComponent(path.slice(9)));
      document.title = p ? `${p.name} · ${SITE}` : `Project not found · ${SITE}`;
    } else if (path !== '/snapshot') {
      document.title = TITLES[path] ?? SITE;
    }
  }, [path, derived]);

  if (state.status === 'loading') {
    return (
      <Layout isFixtures={state.isFixtures}>
        <div className="page mt-16" role="status" aria-live="polite">
          <div className="mx-auto max-w-md text-center">
            <div className="mx-auto h-1 w-40 overflow-hidden rounded bg-accent-100">
              <div className="h-full w-1/3 animate-pulse rounded bg-accent-600" />
            </div>
            <p className="mt-4 text-sm text-ink-muted">Loading the register…</p>
          </div>
        </div>
      </Layout>
    );
  }
  if (state.status === 'error' || !derived) {
    return (
      <Layout isFixtures={state.isFixtures}>
        <div className="page mt-12" role="alert">
          <div className="card mx-auto max-w-xl p-6">
            <h1 className="text-xl font-semibold">The data could not be loaded</h1>
            <p className="mt-2 text-sm text-ink-muted">
              The register files did not load or did not match the expected format, so no figures are shown rather than incomplete ones. Please try
              again; if the problem continues, the published data may be mid-update.
            </p>
            {state.error && <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded bg-[#F3F6F7] p-3 text-xs text-ink-muted">{state.error}</pre>}
            <div className="mt-4 flex gap-2">
              <button type="button" className="btn btn-primary" onClick={state.retry}>
                Try again
              </button>
              <a className="btn" href="./data/register.json">
                Open raw data
              </a>
            </div>
          </div>
        </div>
      </Layout>
    );
  }
  return (
    <DerivedProvider value={derived}>
      {path === '/snapshot' ? (
        <Snapshot />
      ) : (
        <Layout isFixtures={state.isFixtures}>
          <Routes />
        </Layout>
      )}
    </DerivedProvider>
  );
}

export default function App() {
  return (
    <DataProvider>
      <Shell />
    </DataProvider>
  );
}
