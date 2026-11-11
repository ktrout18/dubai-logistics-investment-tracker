/**
 * Stable identifiers.
 *
 * Project ids are slugs (e.g. `dnata-dubai-south-warehouse`) that are NEVER
 * reused: once an id has appeared in the register, the changelog or the
 * review queue it stays reserved even if the project is later removed.
 * Use `collectUsedIds` to build the reserved set and `makeUniqueSlug` to mint.
 */
import type { ChangeRecord, EventType, PendingReviewItem, Project } from './schema.ts';
import { SLUG_RE } from './schema.ts';

export const MAX_SLUG_LENGTH = 80;

/**
 * Turn any text into a slug: ASCII lower-case, digits and single hyphens.
 * Diacritics are stripped, `&` becomes `and`, the result is cut at a hyphen
 * boundary to at most `maxLength` characters. Returns '' for text without
 * any alphanumerics.
 */
export function slugify(text: string, maxLength = MAX_SLUG_LENGTH): string {
  let s = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (s.length > maxLength) {
    s = s.slice(0, maxLength);
    const cut = s.lastIndexOf('-');
    if (cut > maxLength / 2) s = s.slice(0, cut);
    s = s.replace(/-+$/g, '');
  }
  return s;
}

/** True when `id` is a syntactically valid project slug. */
export function isValidSlug(id: string): boolean {
  return id.length >= 3 && id.length <= 100 && SLUG_RE.test(id);
}

/**
 * Return `base` slugified, or with the smallest numeric suffix `-2`, `-3`, ...
 * that is not in `used`. Throws if the text yields an empty slug.
 */
export function makeUniqueSlug(base: string, used: Iterable<string> | ReadonlySet<string>): string {
  const set = used instanceof Set ? (used as ReadonlySet<string>) : new Set(used);
  let root = slugify(base);
  if (!root) throw new Error(`Cannot derive a slug from "${base}"`);
  if (root.length < 3) root = `${root}-project`;
  if (!set.has(root)) return root;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = `${root.slice(0, MAX_SLUG_LENGTH - suffix.length).replace(/-+$/g, '')}${suffix}`;
    if (!set.has(candidate)) return candidate;
  }
}

/**
 * Build a project id from its most identifying parts, e.g.
 * `makeProjectId({ operator: 'dnata', zone: 'Dubai South', facility: 'warehouse' }, used)`
 * → `dnata-dubai-south-warehouse`. Empty parts are skipped.
 */
export function makeProjectId(
  parts: { operator?: string; name?: string; zone?: string; facility?: string },
  used: Iterable<string> | ReadonlySet<string>,
): string {
  const text = [parts.operator, parts.name, parts.zone, parts.facility].filter((x) => x && x.trim()).join(' ');
  return makeUniqueSlug(dedupeWords(text), used);
}

function dedupeWords(text: string): string {
  const seen = new Set<string>();
  return text
    .split(/\s+/)
    .filter((w) => {
      const k = w.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .join(' ');
}

/**
 * Every project id ever used anywhere in the data files: register projects
 * (and their parentIds), changelog projectIds, and review-queue projectIds.
 * New ids must avoid this whole set so that ids are never reused.
 */
export function collectUsedIds(input: {
  projects?: readonly Pick<Project, 'id' | 'parentId'>[];
  changelog?: readonly Pick<ChangeRecord, 'projectId'>[];
  pending?: readonly Pick<PendingReviewItem, 'projectId'>[];
  retired?: readonly string[];
}): Set<string> {
  const used = new Set<string>(input.retired ?? []);
  for (const p of input.projects ?? []) {
    used.add(p.id);
    if (p.parentId) used.add(p.parentId);
  }
  for (const c of input.changelog ?? []) used.add(c.projectId);
  for (const r of input.pending ?? []) if (r.projectId) used.add(r.projectId);
  return used;
}

/** Event id unique within a project: `<date>-<type>` plus `-2`, `-3`... if taken. */
export function makeEventId(date: string, type: EventType, existing: Iterable<string>): string {
  return makeUniqueSlug(`${date}-${type.replace(/_/g, '-')}`, existing);
}

/** 32-bit FNV-1a hash as 8 lower-case hex chars. Deterministic and dependency-free. */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Deterministic change-record id: `chg-YYYYMMDD-<hash>` where the hash covers
 * projectId, field, appliedAt and the new value. Pass `existing` to guarantee
 * uniqueness (a numeric suffix is added on collision).
 */
export function makeChangeId(
  rec: Pick<ChangeRecord, 'projectId' | 'field' | 'appliedAt' | 'newValue'>,
  existing: Iterable<string> = [],
): string {
  const day = rec.appliedAt.slice(0, 10).replace(/-/g, '');
  const h = fnv1a(`${rec.projectId}|${rec.field}|${rec.appliedAt}|${JSON.stringify(rec.newValue ?? null)}`);
  return makeUniqueSlug(`chg-${day}-${h}`, existing);
}

/** Deterministic review-item id: `rev-YYYYMMDD-<hash>` over createdAt + evidence URLs + proposed. */
export function makeReviewId(
  item: Pick<PendingReviewItem, 'createdAt' | 'evidence' | 'proposed'>,
  existing: Iterable<string> = [],
): string {
  const day = item.createdAt.slice(0, 10).replace(/-/g, '');
  const h = fnv1a(
    `${item.createdAt}|${item.evidence.map((e) => e.url).join(',')}|${JSON.stringify(item.proposed)}`,
  );
  return makeUniqueSlug(`rev-${day}-${h}`, existing);
}
