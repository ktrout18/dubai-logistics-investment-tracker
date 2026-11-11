import { useState, type ReactNode } from 'react';
import { filtersToParams, parseFilters } from '../lib/filters.ts';
import { hrefFor, useHashLocation } from '../lib/router.ts';

const NAV = [
  { path: '/', label: 'Overview' },
  { path: '/delivered', label: 'Delivered' },
  { path: '/pipeline', label: 'Pipeline' },
  { path: '/regional', label: 'Regional context' },
  { path: '/snapshot', label: 'Briefing snapshot' },
  { path: '/method', label: 'Method & review' },
] as const;

const LIST_PATHS = ['/delivered', '/pipeline', '/regional'];

export function Layout({ children, isFixtures }: { children: ReactNode; isFixtures: boolean }) {
  const { path, params } = useHashLocation();
  const [open, setOpen] = useState(false);
  const filters = parseFilters(params);
  const linkFor = (target: string) => {
    if (LIST_PATHS.includes(target) && LIST_PATHS.includes(path)) return hrefFor(target, filtersToParams(filters));
    if (target === '/' && filters.year) return hrefFor('/', { year: filters.year });
    return hrefFor(target);
  };
  const isActive = (p: string) => (p === '/' ? path === '/' : path === p || path.startsWith(`${p}/`));

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-white focus:p-2" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>
        Skip to content
      </a>
      {isFixtures && (
        <div role="note" className="bg-amber-200 px-4 py-1.5 text-center text-sm font-medium text-amber-950">
          Fictional test data (development fixtures). None of these projects exist.
        </div>
      )}
      <header className="no-print border-b border-line bg-white">
        <div className="page flex items-center justify-between gap-4 py-3">
          <a href="#/" className="flex items-center gap-2.5 text-ink no-underline">
            <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
              <rect width="32" height="32" rx="6" fill="#00838F" />
              <path d="M7 22V13l9-5 9 5v9" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" />
              <rect x="12" y="16" width="8" height="6" fill="#fff" />
            </svg>
            <span className="leading-tight">
              <span className="block text-[15px] font-semibold">Dubai Logistics Investment Tracker</span>
              <span className="hidden text-xs text-ink-soft sm:block">Source-verified register of warehousing and logistics projects</span>
            </span>
          </a>
          <button
            type="button"
            className="btn lg:hidden"
            aria-expanded={open}
            aria-controls="site-nav"
            onClick={() => setOpen((o) => !o)}
          >
            Menu
          </button>
        </div>
        <nav id="site-nav" aria-label="Main" className={`${open ? 'block' : 'hidden'} border-t border-line lg:block`}>
          <ul className="page flex flex-col gap-0.5 py-2 lg:flex-row lg:gap-1 lg:py-0">
            {NAV.map((n) => (
              <li key={n.path}>
                <a
                  href={linkFor(n.path)}
                  onClick={() => setOpen(false)}
                  aria-current={isActive(n.path) ? 'page' : undefined}
                  className={`block rounded px-3 py-2 text-sm font-medium no-underline lg:rounded-none lg:border-b-2 lg:px-3 lg:py-3 ${
                    isActive(n.path)
                      ? 'bg-accent-50 text-accent-800 lg:border-accent-600 lg:bg-transparent'
                      : 'text-ink-muted hover:text-ink lg:border-transparent'
                  }`}
                >
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" tabIndex={-1} className="flex-1 pb-16 outline-none">
        {children}
      </main>
      <footer className="no-print border-t border-line bg-white">
        <div className="page grid gap-2 py-6 text-sm text-ink-muted sm:grid-cols-2">
          <p>
            This register is built from public sources and is <strong className="text-ink">not exhaustive</strong>. Every figure
            links to its evidence; areas are reported on the basis each source gives and never added across bases.
          </p>
          <p className="sm:text-right">
            <a href="#/method">How figures are counted</a> · <a href="./data/register.json">Data (JSON)</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
