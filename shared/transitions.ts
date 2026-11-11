/**
 * Project status ladder and transition rules.
 *
 * Ladder (forward order):
 *   proposed → mou → term_sheet → signed_agreement → investment_committed
 *   → under_construction → construction_completed → operational
 * `cancelled` is terminal and off-ladder.
 *
 * Rules (`isValidTransition`):
 * - Staying at the same status is valid (e.g. a construction milestone).
 * - Any forward move is valid, including skipping steps (projects are often
 *   first reported mid-way, e.g. straight at under_construction).
 * - Any non-cancelled status → cancelled is valid.
 * - Backward moves, and any move out of `cancelled`, are invalid unless the
 *   move is flagged as a correction (`{ correction: true }`, i.e. an event of
 *   type `correction`).
 */
import type { EventType, ProjectEvent, ProjectStatus } from './schema.ts';

/** The ordered ladder (excludes `cancelled`). */
export const STATUS_LADDER = [
  'proposed',
  'mou',
  'term_sheet',
  'signed_agreement',
  'investment_committed',
  'under_construction',
  'construction_completed',
  'operational',
] as const satisfies readonly ProjectStatus[];

/** Position on the ladder (0-based); `cancelled` returns -1. */
export function statusRank(status: ProjectStatus): number {
  return (STATUS_LADDER as readonly ProjectStatus[]).indexOf(status);
}

export interface TransitionOptions {
  /** True when the change is an explicit correction of earlier data (event type `correction`). */
  correction?: boolean;
}

/** See module doc for the rules. */
export function isValidTransition(from: ProjectStatus, to: ProjectStatus, opts: TransitionOptions = {}): boolean {
  if (from === to) return true;
  if (opts.correction) return true;
  if (from === 'cancelled') return false;
  if (to === 'cancelled') return true;
  return statusRank(to) > statusRank(from);
}

/** Status implied by an event type, or undefined if the type does not imply one. */
export const EVENT_TYPE_IMPLIED_STATUS: Readonly<Record<EventType, ProjectStatus | undefined>> = {
  announcement: 'proposed',
  mou: 'mou',
  term_sheet: 'term_sheet',
  agreement_signed: 'signed_agreement',
  investment_committed: 'investment_committed',
  construction_start: 'under_construction',
  construction_milestone: 'under_construction',
  construction_completed: 'construction_completed',
  // Commissioning = facility complete and handed over; we do not assume it is open.
  commissioned: 'construction_completed',
  opened: 'operational',
  expansion: undefined,
  cancelled: 'cancelled',
  correction: undefined,
  other: undefined,
};

/**
 * Status after an event: `event.statusAfter` when set, otherwise the status
 * implied by the event type (see EVENT_TYPE_IMPLIED_STATUS). Undefined when
 * the event does not change status.
 */
export function statusFromEvent(event: Pick<ProjectEvent, 'type' | 'statusAfter'>): ProjectStatus | undefined {
  return event.statusAfter ?? EVENT_TYPE_IMPLIED_STATUS[event.type];
}

export interface TransitionViolation {
  eventId: string;
  eventIndex: number;
  from: ProjectStatus;
  to: ProjectStatus;
}

export interface ReplayResult {
  /** Status after replaying all events; undefined if no event implies a status. */
  status: ProjectStatus | undefined;
  /** Invalid moves found while replaying (in event order). */
  violations: TransitionViolation[];
}

/**
 * Replay events in array order and report the final status and any invalid
 * transitions. An event that implies a status *lower* than the current one
 * without being a correction is a violation (the replay still continues from
 * the event's status, so later violations are reported relative to it).
 * Note: a plain `announcement` after the project has progressed (e.g. a
 * re-announcement) implies `proposed`; set `statusAfter` on such events.
 */
export function replayEvents(
  events: readonly Pick<ProjectEvent, 'id' | 'type' | 'statusAfter'>[],
): ReplayResult {
  let current: ProjectStatus | undefined;
  const violations: TransitionViolation[] = [];
  events.forEach((e, i) => {
    const next = statusFromEvent(e);
    if (!next) return;
    if (current !== undefined && !isValidTransition(current, next, { correction: e.type === 'correction' })) {
      violations.push({ eventId: e.id, eventIndex: i, from: current, to: next });
    }
    current = next;
  });
  return { status: current, violations };
}
