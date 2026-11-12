/**
 * Reading and writing the data files. Writes are all-or-nothing: every file is
 * first written to a temp file in the same directory, then renamed over the
 * original; if any step fails, files already replaced are restored from the
 * bytes read at the start. Unchanged files are not touched (byte-identical).
 */
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import {
  ChangelogFileSchema,
  DATA_FILES,
  MetaFileSchema,
  PendingReviewFileSchema,
  RegisterFileSchema,
  serializeDataFile,
  type ChangelogFile,
  type MetaFile,
  type PendingReviewFile,
  type RegisterFile,
} from '../shared/index.ts';

export const PIPELINE_STATE_FILE = 'data/pipeline-state.json';

export const RunSummarySchema = z
  .object({
    runId: z.string(),
    startedAt: z.string(),
    finishedAt: z.string(),
    status: z.enum(['success', 'partial', 'failed']),
    dryRun: z.boolean(),
    sourcesOk: z.number(),
    sourcesFailed: z.array(z.string()),
    documents: z.number(),
    published: z.number(),
    held: z.number(),
    searches: z.number(),
    estimatedCostUsd: z.number(),
    /** Claims removed by triage (outside the UAE, not a facility, restatements). */
    skipped: z.number().optional(),
    /** Claims recorded as regional mentions (other emirates). */
    regional: z.number().optional(),
    note: z.string().optional(),
  })
  .strict();
export type RunSummary = z.infer<typeof RunSummarySchema>;

/** A claim about a facility in another emirate, kept for the owner (never in the register automatically). */
export const RegionalMentionSchema = z
  .object({
    name: z.string(),
    emirate: z.string(),
    claim: z.string(),
    url: z.string(),
    /** Further pages reporting the same mention. */
    otherUrls: z.array(z.string()).optional(),
    firstSeen: z.string(),
    lastSeen: z.string(),
  })
  .strict();
export type RegionalMention = z.infer<typeof RegionalMentionSchema>;

export const PipelineStateSchema = z
  .object({
    schemaVersion: z.literal(1),
    /** Normalised URL → when/how it was processed. Prevents reprocessing the same article. */
    processed: z.record(
      z
        .object({
          at: z.string(),
          outcome: z.string(),
          contentHash: z.string().optional(),
        })
        .strict(),
    ),
    /** projectId → last time the rotating recheck searched for it. */
    recheck: z.record(z.string()),
    runs: z.array(RunSummarySchema),
    /** Claims in other emirates, de-duplicated by name and emirate (newest last). */
    regionalMentions: z.array(RegionalMentionSchema).optional(),
  })
  .strict();
export type PipelineState = z.infer<typeof PipelineStateSchema>;

export function emptyState(): PipelineState {
  return { schemaVersion: 1, processed: {}, recheck: {}, runs: [] };
}

export interface DataSnapshot {
  register: RegisterFile;
  changelog: ChangelogFile;
  pendingReview: PendingReviewFile;
  meta: MetaFile;
  sourcesRaw: unknown;
  state: PipelineState;
  /** Exact bytes as read, for change detection and rollback. */
  raw: Record<WritableKey, string | null>;
}

export type WritableKey = 'register' | 'changelog' | 'pendingReview' | 'meta' | 'state';

export function filePath(root: string, key: WritableKey | 'sources'): string {
  if (key === 'state') return resolve(root, PIPELINE_STATE_FILE);
  return resolve(root, DATA_FILES[key]);
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

function parseWith<T>(schema: z.ZodType<T>, text: string | null, label: string): T {
  if (text === null) throw new Error(`${label} is missing`);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`${label}: invalid JSON (${(e as Error).message})`);
  }
  const r = schema.safeParse(json);
  if (!r.success) throw new Error(`${label}: ${r.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  return r.data;
}

export async function readSnapshot(root: string): Promise<DataSnapshot> {
  const raw = {
    register: await readText(filePath(root, 'register')),
    changelog: await readText(filePath(root, 'changelog')),
    pendingReview: await readText(filePath(root, 'pendingReview')),
    meta: await readText(filePath(root, 'meta')),
    state: await readText(filePath(root, 'state')),
  };
  const sourcesText = await readText(filePath(root, 'sources'));
  return {
    register: parseWith(RegisterFileSchema, raw.register, DATA_FILES.register),
    changelog: parseWith(ChangelogFileSchema, raw.changelog, DATA_FILES.changelog),
    pendingReview: parseWith(PendingReviewFileSchema, raw.pendingReview, DATA_FILES.pendingReview),
    meta: parseWith(MetaFileSchema, raw.meta, DATA_FILES.meta),
    sourcesRaw: sourcesText === null ? undefined : (JSON.parse(sourcesText) as unknown),
    state: raw.state === null ? emptyState() : parseWith(PipelineStateSchema, raw.state, PIPELINE_STATE_FILE),
    raw,
  };
}

export interface WriteFs {
  writeFile(path: string, data: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
}

export const nodeFs: WriteFs = {
  writeFile: (p, d) => writeFile(p, d, 'utf8'),
  rename: (a, b) => rename(a, b),
  unlink: (p) => unlink(p),
};

/**
 * Write the given files atomically as a set. Returns the keys actually changed.
 * Callers must validate BEFORE calling this.
 */
export async function writeAtomically(
  root: string,
  original: DataSnapshot['raw'],
  next: Partial<Record<WritableKey, unknown>>,
  fs: WriteFs = nodeFs,
): Promise<WritableKey[]> {
  const plan: { key: WritableKey; path: string; tmp: string; text: string }[] = [];
  for (const [key, value] of Object.entries(next) as [WritableKey, unknown][]) {
    if (value === undefined) continue;
    const text = serializeDataFile(value);
    if (text === original[key]) continue;
    const path = filePath(root, key);
    plan.push({ key, path, tmp: join(dirname(path), `.${key}.${process.pid}.${Date.now()}.tmp`), text });
  }
  if (!plan.length) return [];
  const written: typeof plan = [];
  try {
    for (const p of plan) await fs.writeFile(p.tmp, p.text);
  } catch (e) {
    for (const p of plan) await fs.unlink(p.tmp).catch(() => {});
    throw e;
  }
  try {
    for (const p of plan) {
      await fs.rename(p.tmp, p.path);
      written.push(p);
    }
  } catch (e) {
    // Roll back files already replaced, then remove leftover temps.
    for (const p of written) {
      const prev = original[p.key];
      if (prev === null) await fs.unlink(p.path).catch(() => {});
      else await fs.writeFile(p.path, prev).catch(() => {});
    }
    for (const p of plan) await fs.unlink(p.tmp).catch(() => {});
    throw e;
  }
  return plan.map((p) => p.key);
}

/**
 * Keep the original JSON objects (and their key order) for records that did not
 * change, so a write only produces diff lines for real changes.
 */
export function preserveRaw<T extends Record<string, unknown>>(
  rawItems: unknown,
  parsedOriginal: readonly T[],
  next: readonly T[],
  key: (t: T) => string,
): unknown[] {
  const raws = Array.isArray(rawItems) ? (rawItems as unknown[]) : [];
  const origByKey = new Map<string, { parsed: T; raw: unknown }>();
  parsedOriginal.forEach((p, i) => origByKey.set(key(p), { parsed: p, raw: raws[i] }));
  return next.map((n) => {
    const o = origByKey.get(key(n));
    if (o && o.raw !== undefined && JSON.stringify(o.parsed) === JSON.stringify(n)) return o.raw;
    return n;
  });
}

/** Parse the raw text of a data file (already validated) for preserveRaw. */
export function rawJson(text: string | null): Record<string, unknown> {
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}
