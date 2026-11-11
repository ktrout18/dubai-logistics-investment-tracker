/**
 * Project patches and their application. One code path applies every change,
 * whether the pipeline publishes it or a reviewer accepts it (`appliedBy`), and
 * every change produces a ChangeRecord.
 *
 * Serialised form (stored in PendingReviewItem.proposed for `update`/`conflict`):
 *   { "status": "operational", "events[+]": [event], "sources[+]": [source], "areas[+]": [area], "actualCompletion": {...} }
 * Keys ending in "[+]" append each element; other keys set the field.
 */
import {
  makeChangeId,
  periodStart,
  replayEvents,
  todayIso,
  type AppliedBy,
  type ChangeRecord,
  type ChangeVerificationStatus,
  type Project,
  type ProjectEvent,
} from '../shared/index.ts';

export const APPENDABLE = ['events', 'sources', 'areas', 'unresolvedQuestions'] as const;
type Appendable = (typeof APPENDABLE)[number];
export const SETTABLE = [
  'status',
  'actualCompletion',
  'forecastCompletion',
  'investment',
  'gradeA',
  'gradeAEvidence',
  'zone',
  'location',
  'emirate',
  'primaryAreaIndex',
  'confidence',
] as const;
type Settable = (typeof SETTABLE)[number];

export type PatchOp =
  | { op: 'append'; field: Appendable; value: unknown }
  | { op: 'set'; field: Settable | `areas[${number}]`; value: unknown };

export interface PatchMeta {
  evidenceUrl: string;
  evidenceDate: string;
  reason: string;
  verificationStatus: ChangeVerificationStatus;
  appliedBy: AppliedBy;
  appliedAt: string;
  runId?: string;
}

export function patchToProposed(ops: PatchOp[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const o of ops) {
    if (o.op === 'append') {
      const key = `${o.field}[+]`;
      out[key] = [...((out[key] as unknown[] | undefined) ?? []), o.value];
    } else {
      out[o.field] = o.value;
    }
  }
  return out;
}

export function proposedToPatch(proposed: Record<string, unknown>): PatchOp[] {
  const ops: PatchOp[] = [];
  for (const [key, value] of Object.entries(proposed)) {
    if (key.startsWith('_')) continue; // metadata
    const app = /^([a-zA-Z]+)\[\+\]$/.exec(key);
    if (app) {
      const field = app[1] as Appendable;
      if (!(APPENDABLE as readonly string[]).includes(field)) throw new Error(`cannot append to ${field}`);
      if (!Array.isArray(value)) throw new Error(`${key} must be an array`);
      for (const v of value) ops.push({ op: 'append', field, value: v });
    } else if ((SETTABLE as readonly string[]).includes(key) || /^areas\[\d+\]$/.test(key)) {
      ops.push({ op: 'set', field: key as Settable, value });
    } else {
      throw new Error(`field ${key} cannot be changed by a patch`);
    }
  }
  return ops;
}

function sortEvents(events: ProjectEvent[]): ProjectEvent[] {
  return [...events].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Apply a patch to a project (pure). Maintains `latestMilestone` (newest event),
 * `lastVerified` and `updatedAt`, and returns one ChangeRecord per changed field.
 */
export function applyPatch(
  project: Project,
  ops: PatchOp[],
  meta: PatchMeta,
  existingChangeIds: Set<string>,
): { project: Project; changes: ChangeRecord[] } {
  const p: Project = structuredClone(project);
  const changes: ChangeRecord[] = [];
  const record = (field: string, previousValue: unknown, newValue: unknown) => {
    const base = { projectId: p.id, field, appliedAt: meta.appliedAt, newValue };
    const id = makeChangeId(base, existingChangeIds);
    existingChangeIds.add(id);
    changes.push({
      id,
      projectId: p.id,
      ...(meta.runId ? { runId: meta.runId } : {}),
      field,
      previousValue: previousValue ?? null,
      newValue: newValue ?? null,
      evidenceUrl: meta.evidenceUrl,
      evidenceDate: meta.evidenceDate,
      reason: meta.reason,
      verificationStatus: meta.verificationStatus,
      appliedAt: meta.appliedAt,
      appliedBy: meta.appliedBy,
    });
  };

  for (const o of ops) {
    if (o.op === 'append') {
      const arr = p[o.field] as unknown[];
      arr.push(structuredClone(o.value));
      record(o.field, null, o.value);
    } else {
      const areaIdx = /^areas\[(\d+)\]$/.exec(o.field);
      if (areaIdx) {
        const i = Number(areaIdx[1]);
        const prev = p.areas[i];
        if (!prev) throw new Error(`${o.field} does not exist`);
        p.areas[i] = structuredClone(o.value) as Project['areas'][number];
        record(o.field, prev, o.value);
      } else {
        const field = o.field as Settable;
        const prev = (p as Record<string, unknown>)[field];
        if (JSON.stringify(prev) === JSON.stringify(o.value)) continue;
        if (o.value === null || o.value === undefined) delete (p as Record<string, unknown>)[field];
        else (p as Record<string, unknown>)[field] = structuredClone(o.value);
        record(field, prev, o.value);
      }
    }
  }

  p.events = sortEvents(p.events);
  // Status follows the event history when the patch did not set it explicitly.
  if (!ops.some((o) => o.field === 'status')) {
    const replay = replayEvents(p.events);
    if (replay.status && replay.status !== p.status) {
      record('status', p.status, replay.status);
      p.status = replay.status;
    }
  }
  const newest = p.events[p.events.length - 1];
  if (newest && newest.date >= periodStart(p.latestMilestone.date, p.latestMilestone.datePrecision)) {
    const lm = { date: newest.date, datePrecision: newest.datePrecision, description: newest.summary, sourceUrl: newest.sourceUrl };
    if (JSON.stringify(lm) !== JSON.stringify(p.latestMilestone)) {
      record('latestMilestone', p.latestMilestone, lm);
      p.latestMilestone = lm;
    }
  }
  const today = todayIso(new Date(meta.appliedAt));
  if (p.lastVerified !== today) {
    record('lastVerified', p.lastVerified, today);
    p.lastVerified = today;
  }
  p.updatedAt = meta.appliedAt;
  return { project: p, changes };
}

/** ChangeRecord for a project created as a whole. */
export function creationRecord(project: Project, meta: PatchMeta, existingChangeIds: Set<string>): ChangeRecord {
  const base = { projectId: project.id, field: '*', appliedAt: meta.appliedAt, newValue: project };
  const id = makeChangeId(base, existingChangeIds);
  existingChangeIds.add(id);
  return {
    id,
    projectId: project.id,
    ...(meta.runId ? { runId: meta.runId } : {}),
    field: '*',
    previousValue: null,
    newValue: project,
    evidenceUrl: meta.evidenceUrl,
    evidenceDate: meta.evidenceDate,
    reason: meta.reason,
    verificationStatus: meta.verificationStatus,
    appliedAt: meta.appliedAt,
    appliedBy: meta.appliedBy,
  };
}
