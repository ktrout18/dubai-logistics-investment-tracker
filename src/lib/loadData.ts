/**
 * Runtime data loading for the site. Data is fetched from `./data/*.json`
 * (relative, so it works under any GitHub Pages sub-path) and parsed with the
 * shared zod schemas. A data-only commit + rebuild updates the site.
 */
import {
  ChangelogFileSchema,
  DATA_FILES,
  MetaFileSchema,
  PendingReviewFileSchema,
  RegisterFileSchema,
  type ChangelogFile,
  type DataFileKey,
  type MetaFile,
  type PendingReviewFile,
  type RegisterFile,
} from '../../shared/index.ts';

/** URL (relative to the page) of a data file, e.g. `./data/register.json`. */
export function dataUrl(key: DataFileKey): string {
  return `./${DATA_FILES[key]}`;
}

async function fetchJson(key: DataFileKey, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(dataUrl(key), { signal, cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load ${dataUrl(key)}: HTTP ${res.status}`);
  return res.json();
}

export interface SiteData {
  register: RegisterFile;
  meta: MetaFile;
  changelog: ChangelogFile;
  pendingReview: PendingReviewFile;
}

/** Fetch and schema-parse the files the site needs. Throws on network or schema errors. */
export async function loadSiteData(signal?: AbortSignal): Promise<SiteData> {
  const [register, meta, changelog, pendingReview] = await Promise.all([
    fetchJson('register', signal),
    fetchJson('meta', signal),
    fetchJson('changelog', signal),
    fetchJson('pendingReview', signal),
  ]);
  return {
    register: RegisterFileSchema.parse(register),
    meta: MetaFileSchema.parse(meta),
    changelog: ChangelogFileSchema.parse(changelog),
    pendingReview: PendingReviewFileSchema.parse(pendingReview),
  };
}
