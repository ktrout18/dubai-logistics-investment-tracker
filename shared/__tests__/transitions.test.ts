import { describe, expect, it } from 'vitest';
import { EVENT_TYPES, STATUS_LADDER, isValidTransition, replayEvents, statusFromEvent, statusRank } from '../index.ts';

describe('status ladder', () => {
  it('is ordered and excludes cancelled', () => {
    expect(STATUS_LADDER[0]).toBe('proposed');
    expect(STATUS_LADDER.at(-1)).toBe('operational');
    expect(statusRank('cancelled')).toBe(-1);
    expect(statusRank('mou')).toBeLessThan(statusRank('under_construction'));
  });
});

describe('isValidTransition', () => {
  it('allows forward moves, skips and staying put', () => {
    expect(isValidTransition('proposed', 'mou')).toBe(true);
    expect(isValidTransition('mou', 'under_construction')).toBe(true);
    expect(isValidTransition('under_construction', 'under_construction')).toBe(true);
    expect(isValidTransition('construction_completed', 'operational')).toBe(true);
  });

  it('allows → cancelled from any live status', () => {
    for (const s of STATUS_LADDER) expect(isValidTransition(s, 'cancelled')).toBe(true);
  });

  it('rejects backward moves unless a correction', () => {
    expect(isValidTransition('operational', 'under_construction')).toBe(false);
    expect(isValidTransition('signed_agreement', 'mou')).toBe(false);
    expect(isValidTransition('operational', 'under_construction', { correction: true })).toBe(true);
  });

  it('rejects leaving cancelled unless a correction', () => {
    expect(isValidTransition('cancelled', 'proposed')).toBe(false);
    expect(isValidTransition('cancelled', 'under_construction')).toBe(false);
    expect(isValidTransition('cancelled', 'under_construction', { correction: true })).toBe(true);
  });
});

describe('statusFromEvent', () => {
  it('maps event types and honours statusAfter', () => {
    expect(statusFromEvent({ type: 'mou' })).toBe('mou');
    expect(statusFromEvent({ type: 'agreement_signed' })).toBe('signed_agreement');
    expect(statusFromEvent({ type: 'construction_start' })).toBe('under_construction');
    expect(statusFromEvent({ type: 'commissioned' })).toBe('construction_completed');
    expect(statusFromEvent({ type: 'opened' })).toBe('operational');
    expect(statusFromEvent({ type: 'expansion' })).toBeUndefined();
    expect(statusFromEvent({ type: 'other', statusAfter: 'investment_committed' })).toBe('investment_committed');
  });

  it('covers every event type', () => {
    for (const t of EVENT_TYPES) expect(() => statusFromEvent({ type: t })).not.toThrow();
  });
});

describe('replayEvents', () => {
  it('returns final status and violations', () => {
    const r = replayEvents([
      { id: 'a', type: 'announcement' },
      { id: 'b', type: 'construction_start' },
      { id: 'c', type: 'mou' },
      { id: 'd', type: 'opened' },
    ]);
    expect(r.status).toBe('operational');
    expect(r.violations).toEqual([{ eventId: 'c', eventIndex: 2, from: 'under_construction', to: 'mou' }]);
  });

  it('ignores status-neutral events', () => {
    expect(replayEvents([{ id: 'x', type: 'expansion' }]).status).toBeUndefined();
  });
});
