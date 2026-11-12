import { describe, expect, it } from 'vitest';
import { indexedDeliveryEvidence, type Project } from '../index.ts';
import { deliverySplitSentence } from '../briefing.ts';

type P = Pick<Project, 'status' | 'events' | 'sources' | 'actualCompletion'>;
const src = (url: string, verification: 'direct' | 'indexed') => ({ url, title: 't', publisher: 'p', type: 'primary' as const, verification });
const ev = (type: Project['events'][number]['type'], url: string, verification: 'direct' | 'indexed') => ({
  id: `2026-01-01-${type}`,
  date: '2026-01-01',
  datePrecision: 'month' as const,
  type,
  summary: 's',
  sourceUrl: url,
  sourceType: 'primary' as const,
  verification,
});

describe('indexedDeliveryEvidence', () => {
  const base = (over: Partial<P>): P => ({
    status: 'operational',
    events: [ev('opened', 'https://a.example/1', 'direct')],
    sources: [src('https://a.example/1', 'direct')],
    actualCompletion: { date: '2026-01-01', datePrecision: 'month', sourceUrl: 'https://a.example/1' },
    ...over,
  });

  it('is undefined when the opening and its date were read directly', () => {
    expect(indexedDeliveryEvidence(base({}) as Project)).toBeUndefined();
  });

  it('flags status and date when every opening event and the date source are indexed', () => {
    const p = base({ events: [ev('opened', 'https://b.example/1', 'indexed')], sources: [src('https://b.example/1', 'indexed')], actualCompletion: { date: '2026-01-01', datePrecision: 'month', sourceUrl: 'https://b.example/1' } });
    expect(indexedDeliveryEvidence(p as Project)).toEqual({ status: true, date: true });
  });

  it('flags only the date when a direct opening event exists but the date source is indexed', () => {
    const p = base({
      events: [ev('opened', 'https://a.example/1', 'direct')],
      sources: [src('https://a.example/1', 'direct'), src('https://b.example/1', 'indexed')],
      actualCompletion: { date: '2026-05-20', datePrecision: 'day', sourceUrl: 'https://b.example/1' },
    });
    expect(indexedDeliveryEvidence(p as Project)).toEqual({ status: false, date: true });
  });

  it('construction completed counts commissioning and completion events; non-delivered projects are never flagged', () => {
    const cc = base({ status: 'construction_completed', events: [ev('commissioned', 'https://b.example/1', 'indexed')] });
    expect(indexedDeliveryEvidence(cc as Project)).toEqual({ status: true, date: false });
    expect(indexedDeliveryEvidence(base({ status: 'under_construction', events: [ev('opened', 'https://b.example/1', 'indexed')] }) as Project)).toBeUndefined();
  });
});

describe('deliverySplitSentence', () => {
  it('reports the split per delivery kind and the indexed count', () => {
    expect(deliverySplitSentence({ warehouse: 1, other: 0, indexed: 0 }, { warehouse: 0, other: 0, indexed: 0 })).toBe(
      'The 1 opened is a warehouse facility. Every delivery status and date rests on a source page read directly.',
    );
    expect(deliverySplitSentence({ warehouse: 2, other: 1, indexed: 1 }, { warehouse: 0, other: 2, indexed: 1 })).toBe(
      'Of the 3 opened, 2 are warehouse facilities and 1 other logistics infrastructure. The 2 construction-completed are all other logistics infrastructure. ' +
        '1 of the 3 openings and 1 of the 2 completions rest on search-indexed evidence for the status or date (source page not read directly).',
    );
    expect(deliverySplitSentence({ warehouse: 1, other: 1, indexed: 1 }, { warehouse: 0, other: 0, indexed: 0 })).toMatch(
      /1 of the 2 openings rests on search-indexed evidence/,
    );
  });
});
