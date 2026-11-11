import type { ReactNode } from 'react';
import {
  GRADE_A_LABELS,
  PROJECT_STATUS_LABELS,
  type GradeAStatus,
  type Presentation,
  type ProjectStatus,
  type VerificationLevel,
} from '../../shared/index.ts';
import { CATEGORY_COLORS } from '../lib/presentation.ts';
import { hostOf } from '../lib/format.ts';

export function PageHeader({ kicker, title, children }: { kicker?: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-6 mt-8 sm:mt-10">
      {kicker && <p className="kicker mb-1">{kicker}</p>}
      <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
      {children && <div className="mt-2 max-w-3xl text-[15px] leading-relaxed text-ink-muted">{children}</div>}
    </header>
  );
}

const STATUS_TONE: Record<ProjectStatus, string> = {
  proposed: 'bg-slate-100 text-slate-700 ring-slate-300',
  mou: 'bg-slate-100 text-slate-700 ring-slate-300',
  term_sheet: 'bg-slate-100 text-slate-700 ring-slate-300',
  signed_agreement: 'bg-sky-50 text-sky-900 ring-sky-200',
  investment_committed: 'bg-sky-50 text-sky-900 ring-sky-200',
  under_construction: 'bg-amber-50 text-amber-900 ring-amber-200',
  construction_completed: 'bg-accent-50 text-accent-800 ring-accent-200',
  operational: 'bg-accent-50 text-accent-800 ring-accent-200',
  cancelled: 'bg-rose-50 text-rose-800 ring-rose-200',
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_TONE[status]}`}>
      {PROJECT_STATUS_LABELS[status]}
    </span>
  );
}

export function GradeBadge({ grade }: { grade: GradeAStatus }) {
  const tone =
    grade === 'confirmed'
      ? 'bg-accent-700 text-white ring-accent-700'
      : grade === 'probable'
        ? 'bg-white text-accent-800 ring-accent-600'
        : 'bg-white text-ink-soft ring-line';
  return (
    <span className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}>
      {GRADE_A_LABELS[grade]}
    </span>
  );
}

const VER_TONE: Record<VerificationLevel, string> = {
  direct: 'text-accent-800 ring-accent-300',
  indexed: 'text-amber-900 ring-amber-300',
  inferred: 'text-slate-700 ring-slate-300',
};
const VER_SHORT: Record<VerificationLevel, string> = { direct: 'Direct', indexed: 'Indexed', inferred: 'Inferred' };

export function VerificationBadge({ level }: { level: VerificationLevel }) {
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide ring-1 ring-inset ${VER_TONE[level]}`}>
      {VER_SHORT[level]}
    </span>
  );
}

/** External link: opens in a new tab, says so to screen readers. */
export function ExtLink({ href, children, className }: { href: string; children?: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children ?? hostOf(href)}
      <span className="sr-only"> (opens in a new tab)</span>
      <span aria-hidden="true" className="ml-0.5 text-[0.8em]">↗</span>
    </a>
  );
}

export function CategorySwatch({ category, size = 10 }: { category: Presentation['category']; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 rounded-sm"
      style={{ width: size, height: size, background: CATEGORY_COLORS[category] }}
    />
  );
}

export function Chips({ names, small }: { names: string[]; small?: boolean }) {
  return (
    <span className="flex flex-wrap gap-1">
      {names.map((n) => (
        <span
          key={n}
          className={`rounded-full border border-[#C9D3D6] bg-[#F3F6F7] px-2 ${small ? 'py-0 text-[11px]' : 'py-0.5 text-xs'} font-medium text-ink`}
        >
          {n}
        </span>
      ))}
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card px-6 py-10 text-center">
      <p className="text-base font-semibold">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-xl text-sm text-ink-muted">{children}</div>}
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn'; children: ReactNode }) {
  const cls = tone === 'warn' ? 'border-amber-300 bg-amber-50 text-amber-950' : 'border-accent-200 bg-accent-50 text-ink';
  return <div className={`rounded-md border px-4 py-3 text-sm leading-relaxed ${cls}`}>{children}</div>;
}

export function Dl({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-[minmax(9rem,max-content)_1fr]">
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="font-medium text-ink-muted">{k}</dt>
          <dd className="-mt-2 sm:mt-0">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
