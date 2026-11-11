/**
 * Accept or reject a pending-review item. Acceptance goes through the same
 * apply path as the pipeline (patch.ts) with `appliedBy: 'manual'`, then the
 * whole data set is validated before anything is written.
 */
import {
  CHANGE_VERIFICATION_STATUSES,
  ProjectSchema,
  collectUsedIds,
  formatIssue,
  makeUniqueSlug,
  todayIso,
  validateRegister,
  type ChangeRecord,
  type ChangeVerificationStatus,
  type PendingReviewItem,
  type Project,
} from '../shared/index.ts';
import { applyPatch, creationRecord, proposedToPatch, type PatchOp } from './patch.ts';
import { preserveRaw, rawJson, readSnapshot, writeAtomically, type WriteFs } from './store.ts';

export interface ReviewOptions {
  root: string;
  id: string;
  action: 'accept' | 'reject';
  note?: string;
  verification?: ChangeVerificationStatus;
  now: Date;
  fs?: WriteFs;
}

export interface ReviewOutcome {
  ok: boolean;
  message: string;
  changes: ChangeRecord[];
  filesWritten: string[];
}

function defaultVerification(item: PendingReviewItem): ChangeVerificationStatus {
  const doc = (item.proposed as { _document?: { tier?: string; verification?: string } })._document;
  if (doc?.tier === 'primary' && doc.verification === 'direct') return 'verified_official';
  if (doc?.verification === 'indexed') return 'indexed_only';
  return 'unverified';
}

export async function resolveReview(o: ReviewOptions): Promise<ReviewOutcome> {
  const snap = await readSnapshot(o.root);
  const nowIso = o.now.toISOString().replace(/\.\d+Z$/, 'Z');
  const today = todayIso(o.now);
  const item = snap.pendingReview.items.find((i) => i.id === o.id);
  if (!item) return { ok: false, message: `no pending-review item ${o.id}`, changes: [], filesWritten: [] };
  if (item.state !== 'open') return { ok: false, message: `${o.id} is already ${item.state}`, changes: [], filesWritten: [] };
  if (o.verification && !CHANGE_VERIFICATION_STATUSES.includes(o.verification)) {
    return { ok: false, message: `--verification must be one of ${CHANGE_VERIFICATION_STATUSES.join(', ')}`, changes: [], filesWritten: [] };
  }

  let projects = snap.register.projects;
  const changeIds = new Set(snap.changelog.changes.map((c) => c.id));
  let newChanges: ChangeRecord[] = [];
  const evidence = item.evidence[0]!;
  const meta = {
    evidenceUrl: evidence.url,
    evidenceDate: evidence.publishedDate ?? today,
    reason: `Accepted from review ${item.id}${o.note ? `: ${o.note}` : ''}`,
    verificationStatus: o.verification ?? defaultVerification(item),
    appliedBy: 'manual' as const,
    appliedAt: nowIso,
  };

  if (o.action === 'accept') {
    if (item.kind === 'new_project') {
      const parsed = ProjectSchema.safeParse((item.proposed as { project?: unknown }).project);
      if (!parsed.success) {
        return {
          ok: false,
          message: `${o.id} has no complete project record to accept (${parsed.error.issues[0]?.path.join('.')}: ${parsed.error.issues[0]?.message}). Add the project by hand in a pull request (docs/REVIEW_GUIDE.md), then reject this item with a note.`,
          changes: [],
          filesWritten: [],
        };
      }
      const used = collectUsedIds({ projects, changelog: snap.changelog.changes, pending: snap.pendingReview.items.filter((i) => i.id !== item.id) });
      const project: Project = { ...parsed.data, id: used.has(parsed.data.id) ? makeUniqueSlug(parsed.data.id, used) : parsed.data.id, updatedAt: nowIso };
      projects = [...projects, project];
      newChanges = [creationRecord(project, meta, changeIds)];
    } else {
      const target = projects.find((p) => p.id === item.projectId);
      if (!target) return { ok: false, message: `project ${item.projectId} no longer exists`, changes: [], filesWritten: [] };
      let ops: PatchOp[];
      try {
        const raw = (item.proposed as { _ops?: PatchOp[] })._ops;
        ops = raw ?? proposedToPatch(item.proposed);
      } catch (e) {
        return { ok: false, message: `cannot apply ${o.id}: ${(e as Error).message}`, changes: [], filesWritten: [] };
      }
      if (!ops.length) return { ok: false, message: `${o.id} proposes no field changes; reject it or edit the register by hand`, changes: [], filesWritten: [] };
      const applied = applyPatch(target, ops, meta, changeIds);
      projects = projects.map((p) => (p.id === target.id ? applied.project : p));
      newChanges = applied.changes;
    }
  }

  const items = snap.pendingReview.items.map((i) =>
    i.id === item.id
      ? { ...i, state: o.action === 'accept' ? ('accepted' as const) : ('rejected' as const), resolvedAt: nowIso, ...(o.note ? { resolutionNote: o.note } : {}) }
      : i,
  );
  const rawReg = rawJson(snap.raw.register);
  const rawLog = rawJson(snap.raw.changelog);
  const rawPend = rawJson(snap.raw.pendingReview);
  const files = {
    ...(newChanges.length
      ? {
          register: { ...rawReg, updatedAt: nowIso, projects: preserveRaw(rawReg.projects, snap.register.projects, projects, (p) => p.id) },
          changelog: { ...rawLog, changes: [...preserveRaw(rawLog.changes, snap.changelog.changes, snap.changelog.changes, (c) => c.id), ...newChanges] },
        }
      : {}),
    pendingReview: { ...rawPend, items: preserveRaw(rawPend.items, snap.pendingReview.items, items, (i) => i.id) },
  };
  const v = validateRegister(
    { register: files.register ?? rawReg, changelog: files.changelog ?? rawLog, pendingReview: files.pendingReview, meta: snap.meta, sources: snap.sourcesRaw },
    { today },
  );
  if (!v.ok) {
    return {
      ok: false,
      message: `not written: the result fails validation:\n${v.errors.slice(0, 10).map(formatIssue).join('\n')}`,
      changes: newChanges,
      filesWritten: [],
    };
  }
  const written = await writeAtomically(o.root, snap.raw, files, o.fs);
  return {
    ok: true,
    message: `${o.id} ${o.action === 'accept' ? 'accepted' : 'rejected'}${newChanges.length ? ` (${newChanges.length} change record(s))` : ''}`,
    changes: newChanges,
    filesWritten: written,
  };
}
